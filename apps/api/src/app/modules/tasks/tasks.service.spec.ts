import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskDto } from './dto/create-task.dto';
import { tasks } from './task.entity';
import { TasksService } from './tasks.service';

const now = new Date('2026-09-17T12:00:00.000Z');
const task: typeof tasks.$inferSelect = {
  id: 7,
  leadId: 3,
  type: 'call',
  text: 'First call',
  dueAt: new Date('2026-09-20T09:00:00.000Z'),
  isCompleted: false,
  assigneeId: 5,
  createdAt: now,
  updatedAt: now,
};
const assignee = { id: 5, name: 'Owner', email: 'owner@example.com' };
const hydrated = { ...task, assignee };
const dto: CreateTaskDto = {
  leadId: task.leadId,
  type: task.type,
  text: task.text,
  dueAt: task.dueAt,
  assigneeId: task.assigneeId,
};
const columns =
  '"id", "leadId", "type", "text", "dueAt", "isCompleted", "assigneeId", "createdAt", "updatedAt"';
const selectSql =
  'select "tasks"."id", "tasks"."leadId", "tasks"."type", "tasks"."text", "tasks"."dueAt", "tasks"."isCompleted", "tasks"."assigneeId", "tasks"."createdAt", "tasks"."updatedAt", "users"."id", "users"."name", "users"."email" from "tasks" left join "users" on "tasks"."assigneeId" = "users"."id"';
const orderSql = 'order by "tasks"."dueAt" asc, "tasks"."id" asc';
const idSql = `${selectSql} where "tasks"."id" = $1`;

function timestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, -1);
}

function taskRow(value = task): unknown[] {
  return [
    value.id,
    value.leadId,
    value.type,
    value.text,
    timestamp(value.dueAt),
    value.isCompleted,
    value.assigneeId,
    timestamp(value.createdAt),
    timestamp(value.updatedAt),
  ];
}

function joinedRow(value = task): unknown[] {
  return [
    ...taskRow(value),
    value.assigneeId,
    value.assigneeId === null ? null : assignee.name,
    value.assigneeId === null ? null : assignee.email,
  ];
}

function result(rows: unknown[][] = [], rowCount = rows.length) {
  return { command: '', oid: 0, fields: [], rows, rowCount };
}

function setup(...responses: ReturnType<typeof result>[]) {
  const pool = new Pool();
  const queue = [...responses];
  const query = vi.spyOn(pool, 'query').mockImplementation(async () => {
    const response = queue.shift();
    if (!response) throw new Error('Unexpected SQL query');
    return response;
  });
  return { service: new TasksService(drizzle(pool)), query };
}

function sqlCall(text: string, parameters: unknown[] = []) {
  return [expect.objectContaining({ text }), parameters];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TasksService', () => {
  describe('findAll', () => {
    it('joins the assignee and returns the closest due date first', async () => {
      const unassigned = { ...task, id: 8, assigneeId: null };
      const { service, query } = setup(
        result([joinedRow(), joinedRow(unassigned)]),
      );

      expect(await service.findAll()).toEqual([
        hydrated,
        { ...unassigned, assignee: null },
      ]);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall(`${selectSql} ${orderSql}`),
      );
    });

    it.each([
      {
        filters: { leadId: 0 },
        condition: '"tasks"."leadId" = $1',
        parameters: [0],
      },
      {
        filters: { assigneeId: 0 },
        condition: '"tasks"."assigneeId" = $1',
        parameters: [0],
      },
      {
        filters: { isCompleted: false },
        condition: '"tasks"."isCompleted" = $1',
        parameters: [false],
      },
    ])(
      'keeps filtering by $filters even when the value is falsy',
      async ({ filters, condition, parameters }) => {
        const { service, query } = setup(result());

        expect(await service.findAll(filters)).toEqual([]);
        expect(query).toHaveBeenCalledExactlyOnceWith(
          ...sqlCall(`${selectSql} where ${condition} ${orderSql}`, parameters),
        );
      },
    );

    it('combines every filter with AND', async () => {
      const { service, query } = setup(result());

      expect(
        await service.findAll({ leadId: 3, assigneeId: 5, isCompleted: true }),
      ).toEqual([]);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall(
          `${selectSql} where ("tasks"."leadId" = $1 and "tasks"."assigneeId" = $2 and "tasks"."isCompleted" = $3) ${orderSql}`,
          [3, 5, true],
        ),
      );
    });
  });

  describe('findOne', () => {
    it('reads one task by id', async () => {
      const { service, query } = setup(result([joinedRow()]));

      expect(await service.findOne('7')).toEqual(hydrated);
      expect(query).toHaveBeenCalledExactlyOnceWith(...sqlCall(idSql, [7]));
    });

    it('throws when the task is missing', async () => {
      const { service } = setup(result());

      await expect(service.findOne('7')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('inserts the task and returns it with the assignee joined', async () => {
      const { service, query } = setup(
        result([taskRow()]),
        result([joinedRow()]),
      );

      expect(await service.create(dto)).toEqual(hydrated);
      expect(query.mock.calls).toEqual([
        sqlCall(
          `insert into "tasks" ("id", "leadId", "type", "text", "dueAt", "isCompleted", "assigneeId", "createdAt", "updatedAt") values (default, $1, $2, $3, $4, default, $5, default, default) returning ${columns}`,
          [
            task.leadId,
            task.type,
            task.text,
            task.dueAt.toISOString(),
            task.assigneeId,
          ],
        ),
        sqlCall(idSql, [7]),
      ]);
    });
  });

  describe('update', () => {
    it('writes only the given fields and refreshes updatedAt', async () => {
      vi.useFakeTimers().setSystemTime(now);
      const { service, query } = setup(
        result([taskRow()]),
        result([joinedRow()]),
      );

      expect(await service.update('7', { isCompleted: true })).toEqual(
        hydrated,
      );
      expect(query.mock.calls).toEqual([
        sqlCall(
          `update "tasks" set "isCompleted" = $1, "updatedAt" = $2 where "tasks"."id" = $3 returning ${columns}`,
          [true, now.toISOString(), 7],
        ),
        sqlCall(idSql, [7]),
      ]);
    });

    it('skips the update when no field was given', async () => {
      const { service, query } = setup(result([joinedRow()]));

      expect(await service.update('7', {})).toEqual(hydrated);
      expect(query).toHaveBeenCalledExactlyOnceWith(...sqlCall(idSql, [7]));
    });

    it('throws when the task is missing', async () => {
      const { service } = setup(result());

      await expect(service.update('7', { text: 'Call back' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the task', async () => {
      const { service, query } = setup(result([], 1));

      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall('delete from "tasks" where "tasks"."id" = $1', [7]),
      );
    });

    it('throws when the task is missing', async () => {
      const { service } = setup(result([], 0));

      await expect(service.remove('7')).rejects.toThrow(NotFoundException);
    });
  });
});
