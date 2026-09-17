import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../users/user.entity';

export const LEAD_STATUSES = [
  'new',
  'qualification',
  'proposal',
  'negotiation',
  'won',
  'lost',
] as const;

export const leads = pgTable('leads', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  status: text().notNull().default('new'),
  price: integer().notNull().default(0),
  ownerId: integer().references(() => users.id, { onDelete: 'set null' }),
  companyName: text(),
  contactName: text(),
  source: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
