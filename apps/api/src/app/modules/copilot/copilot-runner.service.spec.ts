import { describe, expect, it, vi } from 'vitest';
import { CopilotRunnerService } from './copilot-runner.service';

const result = {
  text: '{"text":"Answer","sourceIds":[]}',
  functionCalls: [],
  responseItems: [],
  usage: { input_tokens: 5 },
};

function createRunner(
  provider: { generate: ReturnType<typeof vi.fn> },
  toolOverrides: Record<string, unknown> = {},
) {
  const config = { get: () => 'test-model' };
  const tools = {
    definitions: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ output: {}, requiredPermissions: [] }),
    selectedSources: vi.fn().mockReturnValue([]),
    permissionsStillGranted: vi.fn().mockResolvedValue(true),
    ...toolOverrides,
  };
  const actions = {
    definitions: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ output: {}, requiredPermissions: [] }),
  };
  return new CopilotRunnerService(provider as never, config as never, tools as never, actions as never);
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CopilotRunnerService', () => {
  it.each([true, false])('inherits history permissions when the model answers without tools (access=%s)', async (granted) => {
    const provider = { generate: vi.fn().mockResolvedValue(result) };
    const permissionsStillGranted = vi.fn().mockResolvedValue(granted);
    const runner = createRunner(provider, { permissionsStillGranted });
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn().mockResolvedValue(undefined);
    runner.launch('history-run', 7, [{ role: 'assistant', content: 'Protected lead data' }], 'prompt', new Date(Date.now() + 60_000), {
      serverNow: new Date(), requiredPermissions: ['leads:read'], canStart: async () => true, complete, fail,
    });
    if (granted) {
      await vi.waitFor(() => expect(complete).toHaveBeenCalledWith(expect.objectContaining({ requiredPermissions: ['leads:read'] })));
    } else {
      await vi.waitFor(() => expect(fail).toHaveBeenCalledWith('permissions_changed'));
      expect(complete).not.toHaveBeenCalled();
    }
    expect(permissionsStillGranted).toHaveBeenCalledWith(7, ['leads:read']);
  });

  it('runs the provider and saves its normalized answer', async () => {
    const provider = { generate: vi.fn().mockResolvedValue(result) };
    const runner = createRunner(provider);
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn();

    runner.launch(
      'run-1',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete, fail },
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({
      text: 'Answer', sources: [], requiredPermissions: [], usage: { input_tokens: 5 },
    }));

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(provider.generate.mock.calls[0][0]).toMatchObject({
      input: [{ role: 'user', content: 'question' }],
      instructions: 'system prompt',
    });
    expect(fail).not.toHaveBeenCalled();
  });

  it('uses stable timeout/provider error codes without exposing provider errors', async () => {
    const provider = {
      generate: vi.fn().mockRejectedValue(new Error('provider secret details')),
    };
    const runner = createRunner(provider);
    const fail = vi.fn().mockResolvedValue(undefined);

    runner.launch(
      'run-2',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete: vi.fn(), fail },
    );
    await vi.waitFor(() => expect(fail).toHaveBeenCalledWith('provider_error'));
    await flush();

    expect(fail).toHaveBeenCalledOnce();
  });

  it('discards a late provider result after local cancellation', async () => {
    let resolveProvider!: (value: typeof result) => void;
    let seenSignal!: AbortSignal;
    const provider = {
      generate: vi.fn(({ signal }: { signal: AbortSignal }) => {
        seenSignal = signal;
        return new Promise<typeof result>((resolve) => {
          resolveProvider = resolve;
        });
      }),
    };
    const runner = createRunner(provider as never);
    const complete = vi.fn();
    const fail = vi.fn().mockResolvedValue(undefined);

    runner.launch(
      'run-3',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete, fail },
    );
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());
    runner.cancelLocal('run-3');
    resolveProvider(result);
    await vi.waitFor(() => expect(fail).toHaveBeenCalledWith('cancelled'));

    expect(seenSignal.aborted).toBe(true);
    expect(complete).not.toHaveBeenCalled();
  });

  it('marks local runs failed when the API shuts down', async () => {
    let seenSignal!: AbortSignal;
    const provider = {
      generate: vi.fn(({ signal }: { signal: AbortSignal }) => {
        seenSignal = signal;
        return new Promise<typeof result>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        });
      }),
    };
    const runner = createRunner(provider as never);
    const fail = vi.fn().mockResolvedValue(undefined);

    runner.launch(
      'run-shutdown', 7, [{ role: 'user', content: 'question' }], 'prompt', new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete: vi.fn(), fail },
    );
    await vi.waitFor(() => expect(provider.generate).toHaveBeenCalledOnce());

    await runner.onApplicationShutdown();
    await vi.waitFor(() => expect(fail).toHaveBeenCalledWith('server_restarted'));

    expect(seenSignal.aborted).toBe(true);
    expect(fail.mock.calls.map(([code]) => code)).not.toContain('cancelled');
  });

  it('does not call the provider after a run deadline', async () => {
    const provider = { generate: vi.fn() };
    const runner = createRunner(provider);
    const fail = vi.fn().mockResolvedValue(undefined);

    runner.launch(
      'run-4',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() - 1),
      { serverNow: new Date(), canStart: async () => true, complete: vi.fn(), fail },
    );
    await vi.waitFor(() =>
      expect(fail).toHaveBeenCalledWith('deadline_exceeded'),
    );

    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('executes one tool at a time and replays provider protocol items', async () => {
    const provider = {
      generate: vi.fn()
        .mockResolvedValueOnce({ ...result, text: '', functionCalls: [{ id: 'fc', callId: 'call', name: 'search_records', arguments: '{}' }], responseItems: [{ type: 'function_call', id: 'fc', call_id: 'call' }] })
        .mockResolvedValueOnce(result),
    };
    const execute = vi.fn().mockResolvedValue({ output: { records: [] }, requiredPermissions: ['leads:read'] });
    const runner = createRunner(provider, { execute });
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn().mockResolvedValue(undefined);

    runner.launch(
      'run-5',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete, fail },
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledOnce();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate.mock.calls[1][0].input).toContainEqual({
      type: 'function_call_output', call_id: 'call', output: '{"records":[]}',
    });
    expect(complete.mock.calls[0][0].requiredPermissions).toEqual(['leads:read']);
    expect(fail).not.toHaveBeenCalled();
  });

  it('publishes only allowlisted tool names and execution status for SSE progress', async () => {
    const provider = {
      generate: vi.fn()
        .mockResolvedValueOnce({ ...result, text: '', functionCalls: [{ id: 'fc', callId: 'call', name: 'search_records', arguments: '{"query":"private"}' }], responseItems: [] })
        .mockResolvedValueOnce(result),
    };
    const runner = createRunner(provider, {
      definitions: vi.fn().mockResolvedValue([{ name: 'search_records' }]),
    });
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const complete = vi.fn().mockResolvedValue(true);

    runner.launch(
      'run-progress', 7, [{ role: 'user', content: 'question' }], 'prompt', new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete, fail: vi.fn() },
    );
    const subscription = runner.subscribeToRunEvents('run-progress').subscribe((event) => events.push(event));
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    await flush();
    subscription.unsubscribe();

    expect(events).toEqual([
      { type: 'tool_started', data: { runId: 'run-progress', tool: 'search_records' } },
      { type: 'tool_finished', data: { runId: 'run-progress', tool: 'search_records', success: true } },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('contains persistence callback failures in the detached run task', async () => {
    const provider = {
      generate: vi.fn().mockRejectedValue(new Error('provider failure')),
    };
    const runner = createRunner(provider);
    const fail = vi.fn().mockRejectedValue(new Error('database unavailable'));

    expect(() =>
      runner.launch(
        'run-6',
        7,
        [{ role: 'user', content: 'question' }],
        'system prompt',
        new Date(Date.now() + 60_000),
        { serverNow: new Date(), canStart: async () => true, complete: vi.fn(), fail },
      ),
    ).not.toThrow();
    await vi.waitFor(() => expect(fail).toHaveBeenCalledTimes(2));
  });

  it('skips provider execution when the persisted run was cancelled before launch', async () => {
    const provider = { generate: vi.fn() };
    const runner = createRunner(provider);
    const fail = vi.fn();
    const complete = vi.fn();

    runner.launch(
      'run-cancelled-before-launch',
      7,
      [{ role: 'user', content: 'question' }],
      'system prompt',
      new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => false, complete, fail },
    );
    await flush();

    expect(provider.generate).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  });
});
