import { ConflictException, NotFoundException } from '@nestjs/common';
import { EMPTY, lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CopilotService } from './copilot.service';

function select(data: unknown[]) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.leftJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.then = vi.fn((resolve: (value: unknown[]) => unknown) => Promise.resolve(data).then(resolve));
  builder.limit = vi.fn(async () => data);
  builder.for = vi.fn(async () => data);
  return builder;
}

describe('CopilotService', () => {
  it('returns the accepted request id with user messages for exact pending recovery', async () => {
    const message = { id: 6, conversationId: 5, runId: 'run-1', clientRequestId: 'request-1', role: 'user', text: 'Repeated question', sources: [], requiredPermissions: [], createdAt: new Date() };
    const db = { select: vi.fn()
      .mockReturnValueOnce(select([{ id: 5, userId: 10 }]))
      .mockReturnValueOnce(select([message])) };
    const service = new CopilotService(db as never, { getEffectivePermissions: async () => [] } as never, {} as never);
    const result = await service.listMessages(10, 5, { limit: 50 });
    expect(result.items[0]).toMatchObject({ runId: 'run-1', clientRequestId: 'request-1' });
  });

  it('returns 404 for another user’s conversation', async () => {
    const db = { select: vi.fn(() => select([])) };
    const service = new CopilotService(db as never, {} as never, {} as never);

    await expect(
      service.renameConversation(10, 5, 'Renamed'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the original saved record context with an owned run', async () => {
    const run = {
      id: 'run-1',
      userId: 10,
      conversationId: 5,
      status: 'completed',
      deadlineAt: new Date(Date.now() + 60_000),
      context: { kind: 'lead', id: 43 },
      errorCode: null,
      usage: null,
    };
    const messages = select([]);
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(select([run]))
        .mockReturnValueOnce(messages),
    };
    const service = new CopilotService(
      db as never,
      { getEffectivePermissions: vi.fn().mockResolvedValue([]) } as never,
      {} as never,
      { listPublishedForRun: vi.fn().mockResolvedValue([]) } as never,
    );

    await expect(service.getRun(10, 'run-1')).resolves.toMatchObject({
      context: { kind: 'lead', id: 43 },
    });
  });

  it('streams only persisted assistant text and closes after a completed run', async () => {
    const run = {
      id: 'run-1', userId: 10, conversationId: 5, status: 'completed',
      deadlineAt: new Date(Date.now() + 60_000), context: null, errorCode: null, usage: null,
    };
    const message = {
      id: 22, runId: 'run-1', conversationId: 5, role: 'assistant', text: 'Done 🙂',
      sources: [], requiredPermissions: [], createdAt: new Date(),
    };
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(select([run]))
        .mockReturnValueOnce(select([run]))
        .mockReturnValueOnce(select([message])),
    };
    const service = new CopilotService(
      db as never,
      { getEffectivePermissions: vi.fn().mockResolvedValue([]) } as never,
      { subscribeToRunEvents: vi.fn(() => EMPTY) } as never,
      { listPublishedForRun: vi.fn().mockResolvedValue([]) } as never,
    );

    const stream = await service.streamRun(10, 'run-1');
    const events = await lastValueFrom(stream.pipe(toArray()));

    expect(events.map((event) => event.type)).toEqual(['status', 'text_delta', 'completed']);
    expect(events[1]?.data).toMatchObject({ runId: 'run-1', messageId: 22, delta: 'Done 🙂' });
  });

  it('requires run ownership and limits concurrent event streams per user', async () => {
    const run = {
      id: 'run-1', userId: 10, conversationId: 5, status: 'running',
      deadlineAt: new Date(Date.now() + 60_000), context: null,
    };
    const db = { select: vi.fn(() => select([run])) };
    const service = new CopilotService(
      db as never,
      {} as never,
      { subscribeToRunEvents: vi.fn(() => EMPTY) } as never,
      {} as never,
    );

    const first = await service.streamRun(10, 'run-1');
    const firstSubscription = first.subscribe();
    const second = await service.streamRun(10, 'run-1');
    const secondSubscription = second.subscribe();
    await expect(service.streamRun(10, 'run-1')).rejects.toMatchObject({ status: 429 });
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();

    const reopened = await service.streamRun(10, 'run-1');
    reopened.subscribe().unsubscribe();
  });

  it('returns 404 before opening a stream for a foreign run', async () => {
    const service = new CopilotService({ select: vi.fn(() => select([])) } as never, {} as never, {} as never, {} as never);
    await expect(service.streamRun(10, 'foreign-run')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renames only the owned conversation', async () => {
    const conversation = { id: 5, userId: 10, title: 'Renamed' };
    const update = {
      set: vi.fn(() => update),
      where: vi.fn(() => update),
      returning: vi.fn(async () => [conversation]),
    };
    const db = {
      select: vi.fn(() => select([{ id: 5, userId: 10 }])),
      update: vi.fn(() => update),
    };
    const service = new CopilotService(db as never, {} as never, {} as never);

    await expect(
      service.renameConversation(10, 5, ' Renamed '),
    ).resolves.toEqual(conversation);
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed' }),
    );
  });

  it('refuses to delete a conversation with an active run', async () => {
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(select([{ id: 5, userId: 10 }]))
        .mockReturnValueOnce(select([{ id: 'run-1' }])),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new CopilotService(db as never, {} as never, {} as never);

    await expect(service.deleteConversation(10, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('deletes an owned conversation when no run is active', async () => {
    const deleteQuery = { where: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(select([{ id: 5, userId: 10 }]))
        .mockReturnValueOnce(select([])),
      delete: vi.fn(() => deleteQuery),
    };
    const db = {
      transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new CopilotService(db as never, {} as never, {} as never);

    await expect(service.deleteConversation(10, 5)).resolves.toEqual({
      deleted: true,
    });
    expect(tx.delete).toHaveBeenCalledOnce();
  });

  it('paginates messages and redacts assistant content when permissions were revoked', async () => {
    const conversation = { id: 5, userId: 10 };
    const messages = [
      {
        id: 7,
        conversationId: 5,
        runId: null,
        role: 'assistant',
        text: 'Sensitive summary',
        sources: [{ sourceId: 's1' }],
        requiredPermissions: ['leads:read'],
        createdAt: new Date(),
      },
      {
        id: 6,
        conversationId: 5,
        runId: null,
        role: 'user',
        text: 'My question',
        sources: [],
        requiredPermissions: [],
        createdAt: new Date(),
      },
    ];
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(select([conversation]))
        .mockReturnValueOnce(select(messages)),
    };
    const permissions = {
      getEffectivePermissions: vi.fn().mockResolvedValue([]),
    };
    const service = new CopilotService(
      db as never,
      permissions as never,
      {} as never,
    );

    const result = await service.listMessages(10, 5, { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 7,
      text: 'Сообщение скрыто: доступ к использованным данным отозван.',
      sources: [],
      redacted: true,
    });
    expect(result.nextCursor).toBe(7);
  });

  it('returns 404 for a foreign owner before reading conversation messages', async () => {
    const db = { select: vi.fn(() => select([])) };
    const service = new CopilotService(
      db as never,
      {
        getEffectivePermissions: vi.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.listMessages(10, 5, { limit: 50 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not publish a late provider answer after cancellation wins the status CAS', async () => {
    const update = {
      set: vi.fn(() => update),
      where: vi.fn(() => update),
      returning: vi.fn().mockResolvedValue([]),
    };
    const tx = { select: vi.fn(() => select([])), update: vi.fn(() => update), insert: vi.fn() };
    const db = {
      transaction: vi.fn((callback: (executor: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new CopilotService(db as never, {} as never, {} as never);
    const complete = (
      service as unknown as {
        completeRun: (
          runId: string,
          userId: number,
          result: {
            text: string;
            sources: [];
            requiredPermissions: [];
            usage?: undefined;
          },
        ) => Promise<boolean>;
      }
    ).completeRun;

    await expect(
      complete.call(service, 'run-id', 7, {
        text: 'late answer',
        sources: [],
        requiredPermissions: [],
      }),
    ).resolves.toBe(false);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
