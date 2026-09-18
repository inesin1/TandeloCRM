import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { leads } from '../leads/lead.entity';
import { users } from '../users/user.entity';
import { TASK_TYPES, tasks } from './task.entity';

describe('task schema', () => {
  it('removes tasks together with their lead', () => {
    const key = getTableConfig(tasks).foreignKeys.find((key) =>
      key.reference().columns.includes(tasks.leadId),
    );
    expect(tasks.leadId.notNull).toBe(true);
    expect(key?.reference().foreignColumns).toEqual([leads.id]);
    expect(key?.onDelete).toBe('cascade');
  });

  it('keeps tasks when their assignee is deleted', () => {
    const key = getTableConfig(tasks).foreignKeys.find((key) =>
      key.reference().columns.includes(tasks.assigneeId),
    );
    expect(tasks.assigneeId.notNull).toBe(false);
    expect(key?.reference().foreignColumns).toEqual([users.id]);
    expect(key?.onDelete).toBe('set null');
  });

  it('accepts only the known task types and defaults to an open task', () => {
    expect(tasks.type.enumValues).toEqual(TASK_TYPES);
    expect(tasks.isCompleted.notNull).toBe(true);
    expect(tasks.isCompleted.default).toBe(false);
    expect(tasks.dueAt.notNull).toBe(true);
  });
});
