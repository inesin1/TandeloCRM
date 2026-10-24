import { Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { CopilotConfiguration } from './copilot-config.schema';
import { CopilotSettingsService } from './copilot-settings.service';
import {
  COPILOT_LIMITS,
  CopilotProviderInputItem,
  CopilotProviderResult,
} from './copilot.types';

export class CopilotProviderError extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
    this.name = 'CopilotProviderError';
  }
}

type GenerateOptions = {
  instructions: string;
  input: CopilotProviderInputItem[];
  signal: AbortSignal;
  timeoutMs: number;
  tools?: Record<string, unknown>[];
  textFormat?: Record<string, unknown>;
  configuration?: CopilotConfiguration;
};

@Injectable()
export class CopilotProvider {
  constructor(private readonly settings: CopilotSettingsService) {}

  getConfiguration() {
    return this.settings.getEffective();
  }

  async testConnection() {
    try {
      const configuration = await this.getConfiguration();
      const result = await this.generate({
        configuration,
        instructions: 'Return exactly this JSON object: {"text":"OK","sourceIds":[]}.',
        input: [{ role: 'user', content: 'Check connection. Return the requested JSON.' }],
        signal: AbortSignal.timeout(COPILOT_LIMITS.providerTimeoutMs),
        timeoutMs: COPILOT_LIMITS.providerTimeoutMs,
        tools: [{ type: 'function', name: 'connection_check', description: 'A connection check.', strict: true, parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } }],
        textFormat: { type: 'json_schema', name: 'connection_check', strict: true, schema: { type: 'object', properties: { text: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' } } }, required: ['text', 'sourceIds'], additionalProperties: false } },
      });
      const answer = JSON.parse(result.text);
      if (result.functionCalls.length || answer?.text !== 'OK' || !Array.isArray(answer.sourceIds) || answer.sourceIds.length) {
        return { ok: false, errorCode: 'provider_invalid_response' };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, errorCode: error instanceof CopilotProviderError ? error.errorCode : 'provider_configuration_error' };
    }
  }

  async generate({
    instructions,
    input,
    signal,
    timeoutMs,
    tools,
    textFormat,
    configuration: suppliedConfiguration,
  }: GenerateOptions): Promise<CopilotProviderResult> {
    const configuration = suppliedConfiguration ?? await this.getConfiguration();
    const startedAt = Date.now();
    if (!configuration.model) throw new CopilotProviderError('provider_not_configured');
    const chat = configuration.apiFormat === 'chat-completions';
    const endpoint = `${configuration.baseUrl}/${chat ? 'chat/completions' : 'responses'}`;
    const body = chat ? {
      model: configuration.model,
      messages: [{ role: 'system', content: instructions }, ...this.chatMessages(input)],
      store: false,
      parallel_tool_calls: false,
      max_tokens: COPILOT_LIMITS.maxOutputTokens,
      ...(tools?.length ? { tools: tools.map(({ type, ...definition }) => ({ type, function: definition })) } : {}),
      ...(textFormat ? { response_format: { type: 'json_schema', json_schema: this.chatFormat(textFormat) } } : {}),
    } : {
      model: configuration.model,
      instructions,
      input,
      store: false,
      parallel_tool_calls: false,
      max_output_tokens: COPILOT_LIMITS.maxOutputTokens,
      ...(tools ? { tools } : {}),
      ...(textFormat ? { text: { format: textFormat } } : {}),
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (signal.aborted) throw new CopilotProviderError('cancelled');
      if (remainingMs <= 0) throw new CopilotProviderError('provider_timeout');

      try {
        const response = await axios.post<unknown>(
          endpoint,
          body,
          {
            headers: {
              ...(configuration.apiKey ? { Authorization: `Bearer ${configuration.apiKey}` } : {}),
              'Content-Type': 'application/json',
            },
            signal,
            maxRedirects: 0,
            timeout: Math.min(remainingMs, COPILOT_LIMITS.providerTimeoutMs),
          },
        );
        return chat ? this.normalizeChat(response.data) : this.normalize(response.data);
      } catch (error) {
        if (error instanceof CopilotProviderError) throw error;
        if (signal.aborted) throw new CopilotProviderError('cancelled');
        if (Date.now() - startedAt >= timeoutMs || this.isTimeout(error)) {
          throw new CopilotProviderError('provider_timeout');
        }
        if (attempt === 0 && this.isRetryable(error)) continue;
        throw new CopilotProviderError(this.errorCode(error));
      }
    }

    throw new CopilotProviderError('provider_unavailable');
  }

  private chatFormat(format: Record<string, unknown>) {
    const { type: _type, ...schema } = format;
    return schema;
  }

  private chatMessages(input: CopilotProviderInputItem[]) {
    return input.map((item: Record<string, unknown>) => {
      if (item.type === 'function_call_output') {
        return { role: 'tool', tool_call_id: item.call_id, content: item.output };
      }
      if (item.role === 'user' || item.role === 'assistant') {
        return { role: item.role, content: item.content ?? null, ...(Array.isArray(item.tool_calls) ? { tool_calls: item.tool_calls } : {}) };
      }
      throw new CopilotProviderError('provider_invalid_input');
    });
  }

  private normalizeChat(data: unknown): CopilotProviderResult {
    if (!data || typeof data !== 'object') throw new CopilotProviderError('provider_invalid_response');
    const response = data as { choices?: Array<{ finish_reason?: string; message?: { role?: string; content?: unknown; refusal?: unknown; tool_calls?: unknown } }>; usage?: Record<string, unknown> };
    const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
    if (choice?.finish_reason === 'length') throw new CopilotProviderError('provider_incomplete_response');
    if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) throw new CopilotProviderError('model_refusal');
    if (!choice?.message || !['stop', 'tool_calls'].includes(choice.finish_reason ?? '')) throw new CopilotProviderError('provider_invalid_response');
    const message = choice.message;
    if (message.tool_calls != null && !Array.isArray(message.tool_calls)) throw new CopilotProviderError('provider_invalid_tool_call');
    const calls = (message.tool_calls ?? []) as Array<{ id?: unknown; type?: unknown; function?: { name?: unknown; arguments?: unknown } }>;
    const functionCalls = calls.map((call) => {
      if (!call || typeof call.id !== 'string' || !call.id || call.type !== 'function' || typeof call.function?.name !== 'string' || typeof call.function?.arguments !== 'string') {
        throw new CopilotProviderError('provider_invalid_tool_call');
      }
      return { id: call.id, callId: call.id, name: call.function.name, arguments: call.function.arguments };
    });
    if (new Set(functionCalls.map((call) => call.callId)).size !== functionCalls.length) throw new CopilotProviderError('provider_invalid_tool_call');
    const text = typeof message.content === 'string' ? message.content.trim() : '';
    if (!text && !functionCalls.length) throw new CopilotProviderError('provider_empty_response');
    const usage = response.usage ? Object.fromEntries(Object.entries(response.usage).filter(([, value]) => typeof value === 'number')) as Record<string, number> : undefined;
    return {
      text, functionCalls,
      responseItems: [{ role: 'assistant', content: text || null, ...(functionCalls.length ? { tool_calls: functionCalls.map((call) => ({ id: call.callId, type: 'function', function: { name: call.name, arguments: call.arguments } })) } : {}) }],
      ...(usage ? { usage } : {}),
    };
  }

  private normalize(data: unknown): CopilotProviderResult {
    if (!data || typeof data !== 'object') {
      throw new CopilotProviderError('provider_invalid_response');
    }
    const response = data as {
      status?: string;
      output_text?: unknown;
      output?: unknown;
      usage?: Record<string, unknown>;
    };
    if (response.status === 'failed') {
      throw new CopilotProviderError('provider_failed');
    }
    if (response.status !== 'completed' && response.status !== 'incomplete') {
      throw new CopilotProviderError('provider_invalid_status');
    }
    if (response.status === 'incomplete') {
      throw new CopilotProviderError('provider_incomplete_response');
    }
    if (!Array.isArray(response.output)) {
      throw new CopilotProviderError('provider_invalid_response');
    }

    const outputItems = response.output.filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object',
    );
    const refusal = outputItems.some((item) => {
      const content = item.content;
      return (
        Array.isArray(content) &&
        content.some(
          (block) =>
            !!block && typeof block === 'object' && block.type === 'refusal',
        )
      );
    });
    if (refusal) throw new CopilotProviderError('model_refusal');

    const functionCalls = outputItems
      .filter((item) => item.type === 'function_call')
      .map((item) => {
        if (
          typeof item.id !== 'string' ||
          typeof item.call_id !== 'string' ||
          typeof item.name !== 'string' ||
          typeof item.arguments !== 'string'
        ) {
          throw new CopilotProviderError('provider_invalid_tool_call');
        }
        return {
          id: item.id,
          callId: item.call_id,
          name: item.name,
          arguments: item.arguments,
        };
      });
    const text =
      typeof response.output_text === 'string'
        ? response.output_text.trim()
        : outputItems
            .filter(
              (item) => item.type === 'message' && Array.isArray(item.content),
            )
            .flatMap((item) => item.content as Record<string, unknown>[])
            .filter(
              (block) =>
                block.type === 'output_text' && typeof block.text === 'string',
            )
            .map((block) => block.text as string)
            .join('')
            .trim();

    if (!text && !functionCalls.length) {
      throw new CopilotProviderError('provider_empty_response');
    }

    const usage = response.usage
      ? (Object.fromEntries(
          Object.entries(response.usage).filter(
            ([, value]) => typeof value === 'number',
          ),
        ) as Record<string, number>)
      : undefined;
    return {
      text,
      functionCalls,
      responseItems: outputItems,
      ...(usage ? { usage } : {}),
    };
  }

  private isRetryable(error: unknown) {
    return (
      axios.isAxiosError(error) &&
      (error.response?.status === 429 || (error.response?.status ?? 0) >= 500)
    );
  }

  private isTimeout(error: unknown) {
    return (
      axios.isAxiosError(error) &&
      [AxiosError.ETIMEDOUT, AxiosError.ECONNABORTED].includes(error.code ?? '')
    );
  }

  private errorCode(error: unknown) {
    if (!axios.isAxiosError(error)) return 'provider_error';
    if (error.response?.status === 401 || error.response?.status === 403) {
      return 'provider_auth_error';
    }
    if (error.response?.status === 429) return 'provider_rate_limited';
    if ((error.response?.status ?? 0) >= 500) return 'provider_unavailable';
    return 'provider_error';
  }
}
