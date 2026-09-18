import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { leads } from '../leads/lead.entity';
import { users } from '../users/user.entity';

export const TASK_TYPES = ['call', 'email', 'meeting', 'document'] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const tasks = pgTable('tasks', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  leadId: integer()
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  type: text({ enum: TASK_TYPES }).notNull(),
  text: text().notNull(),
  dueAt: timestamp().notNull(),
  isCompleted: boolean().notNull().default(false),
  assigneeId: integer().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
