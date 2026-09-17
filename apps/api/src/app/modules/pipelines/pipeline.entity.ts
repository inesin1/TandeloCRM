import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const pipelines = pgTable('pipelines', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const statuses = pgTable(
  'statuses',
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    pipelineId: integer()
      .notNull()
      .references(() => pipelines.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text().notNull(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // Required by the composite foreign key from leads (statusId, pipelineId).
  (t) => [unique('statuses_id_pipeline_key').on(t.id, t.pipelineId)],
);
