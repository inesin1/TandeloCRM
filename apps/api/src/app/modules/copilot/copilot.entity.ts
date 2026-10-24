import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '../users/user.entity';

export const copilotConversations = pgTable(
  'copilot_conversations',
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text().notNull().default('Новый чат'),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index().on(table.userId, table.updatedAt, table.id)],
);

export const copilotRuns = pgTable(
  'copilot_runs',
  {
    id: uuid().defaultRandom().primaryKey(),
    conversationId: integer()
      .notNull()
      .references(() => copilotConversations.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientRequestId: uuid().notNull(),
    requestHash: text().notNull(),
    context: jsonb().$type<{ kind: string; id: number } | null>(),
    timezone: text().notNull(),
    status: text({ enum: ['running', 'completed', 'failed', 'cancelled'] })
      .notNull()
      .default('running'),
    deadlineAt: timestamp().notNull(),
    finishedAt: timestamp(),
    errorCode: text(),
    usage: jsonb().$type<Record<string, unknown> | null>(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex().on(table.conversationId, table.clientRequestId),
    uniqueIndex()
      .on(table.conversationId)
      .where(sql`${table.status} = 'running'`),
    index().on(table.userId, table.status, table.createdAt),
  ],
);

export const copilotMessages = pgTable(
  'copilot_messages',
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    conversationId: integer()
      .notNull()
      .references(() => copilotConversations.id, { onDelete: 'cascade' }),
    runId: uuid().references(() => copilotRuns.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    text: text().notNull(),
    sources: jsonb().$type<Record<string, unknown>[]>().notNull().default([]),
    requiredPermissions: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index().on(table.conversationId, table.id),
    uniqueIndex().on(table.runId, table.role),
  ],
);

export const copilotActions = pgTable(
  'copilot_actions',
  {
    id: uuid().defaultRandom().primaryKey(),
    conversationId: integer()
      .notNull()
      .references(() => copilotConversations.id, { onDelete: 'cascade' }),
    runId: uuid()
      .notNull()
      .references(() => copilotRuns.id, { onDelete: 'cascade' }),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    callId: text().notNull(),
    toolName: text().notNull(),
    validatedPayload: jsonb().$type<Record<string, unknown>>().notNull(),
    beforeSnapshot: jsonb().$type<Record<string, unknown> | null>(),
    requiredPermissions: jsonb().$type<string[]>().notNull().default([]),
    status: text({
      enum: ['proposed', 'executed', 'rejected', 'expired', 'conflict'],
    })
      .notNull()
      .default('proposed'),
    expiresAt: timestamp().notNull(),
    result: jsonb().$type<Record<string, unknown> | null>(),
    createdAt: timestamp().notNull().defaultNow(),
    executedAt: timestamp(),
  },
  (table) => [uniqueIndex().on(table.runId, table.callId)],
);
