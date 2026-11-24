import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text } from 'drizzle-orm/pg-core';

export const workspaceSettings = pgTable(
  'workspace_settings',
  {
    id: integer().primaryKey(),
    currency: text().notNull(),
  },
  (table) => [check('workspace_settings_singleton', sql`${table.id} = 1`)],
);
