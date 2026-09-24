import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../users/user.entity';
import { leads } from './lead.entity';

export const LEAD_ACTIVITY_KINDS = ['created', 'updated', 'note'] as const;

export const leadActivities = pgTable('lead_activities', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  leadId: integer()
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  kind: text({ enum: LEAD_ACTIVITY_KINDS }).notNull(),
  body: text().notNull(),
  authorId: integer().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp().notNull().defaultNow(),
});
