import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { Env } from '../../env.schema';
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
};

@Injectable()
export class CopilotProvider {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async generate({
    instructions,
    input,
    signal,
    timeoutMs,
    tools,
    textFormat,
  }: GenerateOptions): Promise<CopilotProviderResult> {
    const startedAt = Date.now();
    const body = {
      model: this.config.get('COPILOT_MODEL', { infer: true }),
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
          'https://api.openai.com/v1/responses',
          body,
          {
            headers: {
              Authorization: `Bearer ${this.config.get('OPENAI_API_KEY', { infer: true })}`,
              'Content-Type': 'application/json',
            },
            signal,
            timeout: Math.min(remainingMs, COPILOT_LIMITS.providerTimeoutMs),
          },
        );
        return this.normalize(response.data);
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
