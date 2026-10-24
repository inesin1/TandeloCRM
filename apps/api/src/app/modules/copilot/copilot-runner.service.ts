import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMPTY, Observable, Subject } from 'rxjs';
import { Env } from '../../env.schema';
import { CopilotProvider, CopilotProviderError } from './copilot-provider';
import { CopilotToolsService } from './copilot-tools.service';
import { CopilotActionsService } from './copilot-actions.service';
import { isCopilotProposalToolName } from './copilot-proposals';
import { createCopilotToolState } from './copilot-tools';
import { COPILOT_LIMITS, CopilotProviderResult } from './copilot.types';

const FINAL_FORMAT = {
  type: 'json_schema',
  name: 'copilot_answer',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string' },
      sourceIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['text', 'sourceIds'],
  },
};

export type CopilotCompletion = {
  text: string;
  sources: Array<{ sourceId: string; kind: string; id: string | number; label: string }>;
  requiredPermissions: string[];
  usage?: Record<string, number>;
};

type RunCallbacks = {
  serverNow: Date;
  requiredPermissions?: string[];
  canStart: () => Promise<boolean>;
  complete: (answer: CopilotCompletion) => Promise<boolean>;
  fail: (errorCode: string) => Promise<void>;
};

export interface CopilotRunnerEvent {
  type: 'tool_started' | 'tool_finished';
  data: { runId: string; tool: string; success?: boolean };
}

@Injectable()
export class CopilotRunnerService {
  private readonly logger = new Logger(CopilotRunnerService.name);
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly runFailures = new Map<string, (errorCode: string) => Promise<void>>();
  private readonly shutdownRuns = new Set<string>();
  private readonly runEvents = new Map<string, Subject<CopilotRunnerEvent>>();

  constructor(
    private readonly provider: CopilotProvider,
    private readonly config: ConfigService<Env, true>,
    private readonly tools: CopilotToolsService,
    private readonly actions: CopilotActionsService,
  ) {}

  launch(
    runId: string,
    userId: number,
    input: Array<Record<string, unknown>>,
    instructions: string,
    deadlineAt: Date,
    callbacks: RunCallbacks,
  ) {
    if (this.activeRuns.has(runId)) return;
    const controller = new AbortController();
    const events = new Subject<CopilotRunnerEvent>();
    this.activeRuns.set(runId, controller);
    this.runFailures.set(runId, callbacks.fail);
    this.runEvents.set(runId, events);
    const startedAt = Date.now();
    void this.execute(
      runId,
      userId,
      input,
      instructions,
      deadlineAt,
      controller,
      callbacks,
      startedAt,
    )
      .catch(async () => {
        try {
          await callbacks.fail('internal_error');
        } catch {
          // The detached run must not create an unhandled rejection if persistence also fails.
        }
        this.logger.error(JSON.stringify({ runId, userId, errorCode: 'internal_error' }));
      })
      .catch(() => undefined)
      .finally(() => {
        this.activeRuns.delete(runId);
        this.runFailures.delete(runId);
        this.shutdownRuns.delete(runId);
        events.complete();
        this.runEvents.delete(runId);
      });
  }

  async onApplicationShutdown() {
    await Promise.all([...this.activeRuns].map(async ([runId, controller]) => {
      this.shutdownRuns.add(runId);
      controller.abort();
      try {
        await this.runFailures.get(runId)?.('server_restarted');
      } catch {
        this.logger.error(JSON.stringify({ runId, errorCode: 'shutdown_persist_failed' }));
      }
    }));
  }

  subscribeToRunEvents(runId: string): Observable<CopilotRunnerEvent> {
    return this.runEvents.get(runId)?.asObservable() ?? EMPTY;
  }

  cancelLocal(runId: string) {
    this.activeRuns.get(runId)?.abort();
  }

  private async execute(
    runId: string,
    userId: number,
    input: Array<Record<string, unknown>>,
    instructions: string,
    deadlineAt: Date,
    controller: AbortController,
    callbacks: RunCallbacks,
    startedAt: number,
  ) {
    let providerCalls = 0;
    let toolCalls = 0;
    const toolState = createCopilotToolState();
    for (const key of callbacks.requiredPermissions ?? []) toolState.requiredPermissions.add(key);
    const usage: Record<string, number> = {};
    let model = this.config.get('COPILOT_MODEL', { infer: true });
    try {
      const configuration = await this.provider.getConfiguration();
      model = configuration.model;
      if (!configuration.enabled) throw new CopilotProviderError('copilot_disabled');
      while (providerCalls < COPILOT_LIMITS.maxProviderCalls) {
        if (!(await callbacks.canStart())) return;
        const remainingMs = Math.min(
          COPILOT_LIMITS.runTimeoutMs,
          deadlineAt.getTime() - Date.now(),
        );
        if (remainingMs <= 0) throw new CopilotProviderError('deadline_exceeded');
        if (JSON.stringify({ instructions, input }).length > COPILOT_LIMITS.maxContextChars) {
          throw new CopilotProviderError('context_limit_exceeded');
        }
        const availableTools = [
          ...await this.tools.definitions(userId),
          ...await this.actions.definitions(userId),
        ];
        providerCalls += 1;
        const result = await this.provider.generate({
          configuration,
          instructions,
          input,
          signal: controller.signal,
          timeoutMs: remainingMs,
          tools: availableTools,
          textFormat: FINAL_FORMAT,
        });
        if (controller.signal.aborted) throw new CopilotProviderError('cancelled');
        addUsage(usage, result.usage);

        if (result.functionCalls.length) {
          toolCalls += result.functionCalls.length;
          if (toolCalls > 12) throw new CopilotProviderError('tool_limit_exceeded');
          input.push(...result.responseItems);
          for (const call of result.functionCalls) {
            if (!(await callbacks.canStart())) return;
            const knownTool = availableTools.some((tool) => tool.name === call.name);
            const eventTool = knownTool ? call.name : 'unknown';
            this.publish(runId, { type: 'tool_started', data: { runId, tool: eventTool } });
            let toolResult: { output: unknown; requiredPermissions: string[] };
            try {
              toolResult = isCopilotProposalToolName(call.name)
                ? await this.actions.execute(userId, runId, call.callId, call.name, call.arguments)
                : await this.tools.execute(
                    userId,
                    runId,
                    toolState,
                    call.name,
                    call.arguments,
                    callbacks.serverNow,
                  );
            } catch (error) {
              this.publish(runId, { type: 'tool_finished', data: { runId, tool: eventTool, success: false } });
              throw error;
            }
            this.publish(runId, { type: 'tool_finished', data: { runId, tool: eventTool, success: true } });
            for (const permission of toolResult.requiredPermissions) {
              toolState.requiredPermissions.add(permission);
            }
            let output = JSON.stringify(toolResult.output);
            input.push({
              type: 'function_call_output',
              call_id: call.callId,
              output,
            });
            if (JSON.stringify({ instructions, input }).length > COPILOT_LIMITS.maxContextChars) {
              output = JSON.stringify({ error: 'context_limit', records: [], truncated: true, nextCursor: null });
              input[input.length - 1] = { type: 'function_call_output', call_id: call.callId, output };
            }
            if (JSON.stringify({ instructions, input }).length > COPILOT_LIMITS.maxContextChars) {
              throw new CopilotProviderError('context_limit_exceeded');
            }
          }
          continue;
        }

        const answer = parseFinalAnswer(result);
        const sources = this.tools.selectedSources(toolState, answer.sourceIds);
        if (!sources) throw new CopilotProviderError('invalid_sources');
        const requiredPermissions = [...toolState.requiredPermissions];
        if (!(await this.tools.permissionsStillGranted(userId, requiredPermissions))) {
          throw new CopilotProviderError('permissions_changed');
        }
        const saved = await callbacks.complete({
          text: answer.text,
          sources,
          requiredPermissions,
          usage: Object.keys(usage).length ? usage : undefined,
        });
        this.logger.log(JSON.stringify({
          runId,
          userId,
          model,
          durationMs: Date.now() - startedAt,
          providerCalls,
          toolCalls,
          usage,
          status: saved ? 'completed' : 'discarded',
        }));
        return;
      }
      throw new CopilotProviderError('provider_call_limit_exceeded');
    } catch (error) {
      const errorCode =
        this.shutdownRuns.has(runId)
          ? 'server_restarted'
          : error instanceof CopilotProviderError
          ? error.errorCode
          : controller.signal.aborted
            ? 'cancelled'
            : 'provider_error';
      await callbacks.fail(errorCode);
      this.logger.warn(JSON.stringify({
        runId,
        userId,
        model,
        durationMs: Date.now() - startedAt,
        providerCalls,
        toolCalls,
        errorCode,
      }));
    }
  }

  private publish(runId: string, event: CopilotRunnerEvent) {
    this.runEvents.get(runId)?.next(event);
  }
}

function parseFinalAnswer(result: CopilotProviderResult) {
  let value: unknown;
  try {
    value = JSON.parse(result.text);
  } catch {
    throw new CopilotProviderError('invalid_final_response');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CopilotProviderError('invalid_final_response');
  }
  const answer = value as Record<string, unknown>;
  if (
    Object.keys(answer).length !== 2 ||
    typeof answer.text !== 'string' ||
    !answer.text.trim() ||
    answer.text.length > 20_000 ||
    !Array.isArray(answer.sourceIds) ||
    answer.sourceIds.some((sourceId) => typeof sourceId !== 'string')
  ) throw new CopilotProviderError('invalid_final_response');
  return { text: answer.text.trim(), sourceIds: answer.sourceIds as string[] };
}

function addUsage(total: Record<string, number>, usage?: Record<string, number>) {
  for (const [key, value] of Object.entries(usage ?? {})) {
    total[key] = (total[key] ?? 0) + value;
  }
}
