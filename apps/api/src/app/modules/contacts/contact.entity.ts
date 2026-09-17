import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.entity';
import { users } from '../users/user.entity';

export const contacts = pgTable('contacts', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull(),
  position: text(),
  companyId: integer().references(() => companies.id, { onDelete: 'set null' }),
  email: text(),
  phone: text(),
  ownerId: integer().references(() => users.id, { onDelete: 'set null' }),
  customFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
