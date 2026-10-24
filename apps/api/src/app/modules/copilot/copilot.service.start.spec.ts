import { ConflictException, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  copilotConversations,
  copilotMessages,
  copilotRuns,
} from './copilot.entity';
import { CopilotService } from './copilot.service';
import { users } from '../users/user.entity';

const USER_ID = 8;
const CONVERSATION_ID = 4;

function extractParams(value: unknown, result: unknown[] = []): unknown[] {
  if (!value || typeof value !== 'object') return result;
  if (
    'value' in value &&
    (typeof value.value !== 'object' || value.value === null)
  ) {
    result.push(value.value);
  }
  const chunks = 'queryChunks' in value ? value.queryChunks : undefined;
  if (Array.isArray(chunks))
    chunks.forEach((chunk) => extractParams(chunk, result));
  return result;
}

function createMemoryDb(seed: { runs?: Record<string, unknown>[] } = {}) {
  const state = {
    user: { id: USER_ID },
    conversation: {
      id: CONVERSATION_ID,
      userId: USER_ID,
      title: 'Новый чат',
      updatedAt: new Date(),
    },
    runs: [...(seed.runs ?? [])],
    messages: [] as Record<string, unknown>[],
  };
  let transactionTail = Promise.resolve();

  const createExecutor = () => {
    let countQuery = 0;
    const read = (table: unknown, selection: unknown, params: unknown[]) => {
      if (table === users) return [state.user];
      if (table === copilotConversations) return [state.conversation];
      if (table === copilotMessages) return [...state.messages];
      if (table === copilotRuns) {
        if (selection) {
          countQuery += 1;
          const active = state.runs.filter(
            (run) => run.status === 'running',
          ).length;
          if (countQuery === 1) {
            return [
              {
                value: state.runs.filter(
                  (run) =>
                    run.status === 'running' &&
                    params.includes(run.conversationId),
                ).length,
              },
            ];
          }
          return [{ value: countQuery === 2 ? active : state.runs.length }];
        }
        const requestIds = params.filter((param) => typeof param === 'string');
        return state.runs.filter((run) =>
          requestIds.includes(run.clientRequestId),
        );
      }
      return [];
    };
    const select = (selection?: unknown) => {
      let table: unknown;
      let params: unknown[] = [];
      const builder: Record<string, (...args: unknown[]) => unknown> = {
        from: (value) => ((table = value), builder),
        where: (value) => ((params = extractParams(value)), builder),
        orderBy: () => builder,
        limit: (limit) =>
          Promise.resolve(
            read(table, selection, params).slice(0, Number(limit)),
          ),
        for: () => Promise.resolve(read(table, selection, params)),
        then: (resolve, reject) =>
          Promise.resolve(read(table, selection, params)).then(resolve, reject),
      };
      return builder;
    };
    const update = (table: unknown) => {
      let values: Record<string, unknown> = {};
      const execute = () => {
        if (table === copilotConversations)
          Object.assign(state.conversation, values);
        if (table === copilotRuns && values.status === 'failed') {
          for (const run of state.runs) {
            if (
              run.status === 'running' &&
              run.deadlineAt instanceof Date &&
              run.deadlineAt <= new Date()
            ) {
              Object.assign(run, values);
            }
          }
        }
        return [];
      };
      const builder: Record<string, (...args: unknown[]) => unknown> = {
        set: (value) => ((values = value as Record<string, unknown>), builder),
        where: () => Promise.resolve(execute()),
        returning: () => Promise.resolve(execute()),
        then: (resolve, reject) =>
          Promise.resolve(execute()).then(resolve, reject),
      };
      return builder;
    };
    const insert = (table: unknown) => {
      let values: Record<string, unknown> = {};
      let inserted: Record<string, unknown> | undefined;
      const execute = () => {
        if (!inserted && table === copilotRuns) {
          inserted = {
            id: randomUUID(),
            status: 'running',
            createdAt: new Date(),
            ...values,
          };
          state.runs.push(inserted);
        } else if (!inserted && table === copilotMessages) {
          inserted = {
            id: state.messages.length + 1,
            createdAt: new Date(),
            ...values,
          };
          state.messages.push(inserted);
        }
        return inserted;
      };
      const builder: Record<string, (...args: unknown[]) => unknown> = {
        values: (value) => (
          (values = value as Record<string, unknown>),
          builder
        ),
        returning: () => Promise.resolve([execute()]),
        then: (resolve, reject) =>
          Promise.resolve(execute()).then(resolve, reject),
      };
      return builder;
    };
    return { select, update, insert };
  };

  const db = {
    transaction: (
      callback: (tx: ReturnType<typeof createExecutor>) => unknown,
    ) => {
      const result = transactionTail.then(() => callback(createExecutor()));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    select: (...args: unknown[]) => createExecutor().select(...args),
  };
  return { db, state };
}

const dto = (clientRequestId = randomUUID(), text = 'Question') => ({
  clientRequestId,
  text,
  timezone: 'Asia/Tbilisi',
});

function createService(db: unknown) {
  const runner = { launch: vi.fn(), cancelLocal: vi.fn() };
  const permissions = {
    getEffectivePermissions: vi.fn().mockResolvedValue([]),
  };
  return {
    runner,
    service: new CopilotService(
      db as never,
      permissions as never,
      runner as never,
    ),
  };
}

describe('CopilotService run starts', () => {
  it('creates one run and message, then returns the same run for a matching request retry', async () => {
    const { db, state } = createMemoryDb();
    const { service, runner } = createService(db);
    const request = dto();

    const first = await service.startMessage(USER_ID, CONVERSATION_ID, request);
    const retry = await service.startMessage(USER_ID, CONVERSATION_ID, request);

    expect(retry).toEqual(first);
    expect(state.runs).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
    expect(runner.launch).toHaveBeenCalledOnce();
  });

  it('rejects a reused request id with a different normalized payload', async () => {
    const { db } = createMemoryDb();
    const { service } = createService(db);
    const request = dto();
    await service.startMessage(USER_ID, CONVERSATION_ID, request);

    await expect(
      service.startMessage(USER_ID, CONVERSATION_ID, {
        ...request,
        text: 'Different',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent starts so only one active run is created in a conversation', async () => {
    const { db, state } = createMemoryDb();
    const { service, runner } = createService(db);

    const results = await Promise.allSettled([
      service.startMessage(USER_ID, CONVERSATION_ID, dto()),
      service.startMessage(USER_ID, CONVERSATION_ID, dto()),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(state.runs).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
    expect(runner.launch).toHaveBeenCalledOnce();
  });

  it('enforces the per-user run window', async () => {
    const runs = Array.from({ length: 20 }, () => ({
      id: randomUUID(),
      status: 'completed',
      createdAt: new Date(),
      clientRequestId: randomUUID(),
    }));
    const { db, state } = createMemoryDb({ runs });
    const { service } = createService(db);

    await expect(
      service.startMessage(USER_ID, CONVERSATION_ID, dto()),
    ).rejects.toMatchObject({
      status: 429,
    });
    expect(state.runs).toHaveLength(20);
    expect(state.messages).toHaveLength(0);
  });

  it('limits active runs across separate conversations owned by one user', async () => {
    const runs = [2, 3].map((conversationId) => ({
      id: randomUUID(),
      conversationId,
      status: 'running',
      createdAt: new Date(),
      deadlineAt: new Date(Date.now() + 60_000),
      clientRequestId: randomUUID(),
    }));
    const { db, state } = createMemoryDb({ runs });
    const { service } = createService(db);

    await expect(
      service.startMessage(USER_ID, CONVERSATION_ID, dto()),
    ).rejects.toMatchObject({ status: 409 });
    expect(state.runs).toHaveLength(2);
    expect(state.messages).toHaveLength(0);
  });

  it('rejects invalid timezones before creating database state', async () => {
    const { db, state } = createMemoryDb();
    const { service } = createService(db);

    await expect(
      service.startMessage(USER_ID, CONVERSATION_ID, {
        ...dto(),
        timezone: 'Mars/Olympus',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(state.runs).toHaveLength(0);
  });
});
