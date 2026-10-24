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

function createProvider() {
  const config = {
    get: (name: string) =>
      name === 'COPILOT_MODEL' ? 'test-model' : 'test-api-key',
  };
  return new CopilotProvider(config as never);
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
