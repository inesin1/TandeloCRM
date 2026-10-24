import axios from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopilotProvider, CopilotProviderError } from './copilot-provider';

const response = {
  status: 'completed',
  output_text: 'Hello from Copilot',
  output: [
    {
      type: 'message',
      content: [{ type: 'output_text', text: 'Hello from Copilot' }],
    },
  ],
  usage: { input_tokens: 12, output_tokens: 4 },
};

function createProvider(overrides: Record<string, unknown> = {}) {
  return new CopilotProvider({ getEffective: async () => ({
    enabled: true, model: 'test-model', apiKey: 'test-api-key', apiFormat: 'responses', baseUrl: 'https://api.openai.com/v1', ...overrides,
  }) } as never);
}

const options = () => ({
  instructions: 'system',
  input: [{ role: 'user' as const, content: 'hello' }],
  signal: new AbortController().signal,
  timeoutMs: 30_000,
  textFormat: { type: 'json_schema', name: 'answer', strict: true, schema: {} },
});

afterEach(() => vi.restoreAllMocks());

describe('CopilotProvider', () => {
  it('uses a custom Responses URL and never follows redirects with credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: response } as never);
    await createProvider({ baseUrl: 'https://provider.example/api/v1' }).generate(options());
    expect(post.mock.calls[0][0]).toBe('https://provider.example/api/v1/responses');
    expect(post.mock.calls[0][2]).toMatchObject({ maxRedirects: 0, headers: { Authorization: 'Bearer test-api-key' } });
  });

  it('round-trips Chat Completions tool calls, outputs and structured answers without a key', async () => {
    const call = { id: 'chat-call-1', type: 'function', function: { name: 'search_records', arguments: '{"kind":"lead"}' } };
    const post = vi.spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [call] } }] } } as never)
      .mockResolvedValueOnce({ data: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"text":"Found","sourceIds":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } } as never);
    const provider = createProvider({ apiFormat: 'chat-completions', baseUrl: 'http://localhost:11434/v1', apiKey: undefined });
    const tool = { type: 'function', name: 'search_records', description: 'Search', strict: true, parameters: { type: 'object' } };
    const first = await provider.generate({ ...options(), tools: [tool] });
    expect(first.functionCalls).toEqual([{ id: call.id, callId: call.id, name: 'search_records', arguments: call.function.arguments }]);
    const second = await provider.generate({ ...options(), tools: [tool], input: [
      ...options().input, ...first.responseItems, { type: 'function_call_output', call_id: call.id, output: '{"records":[]}' },
    ] });
    expect(second).toMatchObject({ text: '{"text":"Found","sourceIds":[]}', functionCalls: [], usage: { prompt_tokens: 10 } });
    expect(post.mock.calls[1][0]).toBe('http://localhost:11434/v1/chat/completions');
    expect(post.mock.calls[1][1]).toMatchObject({
      tools: [{ type: 'function', function: { name: 'search_records', strict: true } }],
      response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: {} } },
      messages: [
        { role: 'system', content: 'system' }, { role: 'user', content: 'hello' },
        { role: 'assistant', content: null, tool_calls: [call] },
        { role: 'tool', tool_call_id: call.id, content: '{"records":[]}' },
      ],
    });
    expect(post.mock.calls[1][2]?.headers).not.toHaveProperty('Authorization');
    expect(post.mock.calls[1][1]).not.toHaveProperty('input');
  });

  it.each([
    [{ choices: [{ finish_reason: 'length', message: { content: '{' } }] }, 'provider_incomplete_response'],
    [{ choices: [{ finish_reason: 'content_filter', message: {} }] }, 'model_refusal'],
    [{ choices: [{ finish_reason: 'stop', message: { refusal: 'refused' } }] }, 'model_refusal'],
    [{ choices: [{ finish_reason: 'stop', message: { content: '' } }] }, 'provider_empty_response'],
    [{ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'x', type: 'function', function: { name: 'x' } }] } }] }, 'provider_invalid_tool_call'],
    [{ choices: [] }, 'provider_invalid_response'],
  ])('rejects malformed Chat Completions results with stable codes', async (data, errorCode) => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data } as never);
    await expect(createProvider({ apiFormat: 'chat-completions' }).generate(options())).rejects.toMatchObject({ errorCode });
  });

  it('tests saved disabled settings with synthetic input and returns only a safe result', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { status: 'completed', output_text: '{"text":"OK","sourceIds":[]}', output: [] } } as never);
    await expect(createProvider({ enabled: false }).testConnection()).resolves.toEqual({ ok: true });
    expect(post.mock.calls[0][1]).toHaveProperty('tools');
    post.mockRejectedValueOnce(Object.assign(new Error('private key details'), { isAxiosError: true, response: { status: 401 } }));
    await expect(createProvider().testConnection()).resolves.toEqual({ ok: false, errorCode: 'provider_auth_error' });
  });

  it('normalizes a Responses API answer and sends privacy and tool-call controls', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: response } as never);

    await expect(createProvider().generate(options())).resolves.toMatchObject({
      text: 'Hello from Copilot',
      functionCalls: [],
      usage: { input_tokens: 12, output_tokens: 4 },
    });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][1]).toMatchObject({
      store: false,
      parallel_tool_calls: false,
      max_output_tokens: 4000,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('keeps function-call protocol items available for the next tool cycle', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        status: 'completed',
        output: [
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_1',
            name: 'search_records',
            arguments: '{"query":"Acme"}',
          },
        ],
      },
    } as never);

    const result = await createProvider().generate(options());

    expect(result.functionCalls).toEqual([
      {
        id: 'fc_1',
        callId: 'call_1',
        name: 'search_records',
        arguments: '{"query":"Acme"}',
      },
    ]);
    expect(result.responseItems[0]).toMatchObject({ id: 'fc_1' });
  });

  it('retries one 429/5xx response and maps provider failures to stable codes', async () => {
    const retryable = Object.assign(
      new Error('upstream body must not escape'),
      {
        isAxiosError: true,
        response: { status: 503 },
      },
    );
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce({ data: response } as never);

    await expect(createProvider().generate(options())).resolves.toMatchObject({
      text: 'Hello from Copilot',
    });
    expect(post).toHaveBeenCalledTimes(2);

    post.mockReset().mockRejectedValue(
      Object.assign(new Error('private provider text'), {
        isAxiosError: true,
        response: { status: 401 },
      }),
    );
    const error = await createProvider()
      .generate(options())
      .catch((value) => value);
    expect(error).toBeInstanceOf(CopilotProviderError);
    expect(error.errorCode).toBe('provider_auth_error');
    expect(post).toHaveBeenCalledOnce();
    expect(error.message).not.toContain('private provider text');
  });

  it('retries a 429 once, then returns the stable rate-limit code', async () => {
    const rateLimited = () =>
      Object.assign(new Error('private rate-limit details'), {
        isAxiosError: true,
        response: { status: 429 },
      });
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited());

    const error = await createProvider()
      .generate(options())
      .catch((value) => value);

    expect(error).toBeInstanceOf(CopilotProviderError);
    expect(error.errorCode).toBe('provider_rate_limited');
    expect(error.message).not.toContain('private rate-limit details');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('maps provider timeouts without retrying them', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(
      Object.assign(new Error('private timeout details'), {
        isAxiosError: true,
        code: 'ETIMEDOUT',
      }),
    );

    const error = await createProvider()
      .generate(options())
      .catch((value) => value);

    expect(error).toMatchObject({ errorCode: 'provider_timeout' });
    expect(error.message).not.toContain('private timeout details');
    expect(post).toHaveBeenCalledOnce();
  });

  it('rejects empty, incomplete, refused, and malformed provider outputs', async () => {
    const post = vi.spyOn(axios, 'post');
    const cases = [
      [{ status: 'completed', output: [] }, 'provider_empty_response'],
      [{ status: 'incomplete', output: [] }, 'provider_incomplete_response'],
      [
        {
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'refusal' }] }],
        },
        'model_refusal',
      ],
      [{ status: 'failed', output: [] }, 'provider_failed'],
      [{ status: 'in_progress', output: [] }, 'provider_invalid_status'],
      [
        { status: 'completed', output_text: 'text' },
        'provider_invalid_response',
      ],
    ] as const;

    for (const [data, errorCode] of cases) {
      post.mockResolvedValueOnce({ data } as never);
      const error = await createProvider()
        .generate(options())
        .catch((value) => value);
      expect(error).toMatchObject({ errorCode });
    }
  });
});
