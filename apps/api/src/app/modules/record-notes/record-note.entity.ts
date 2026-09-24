import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.entity';
import { contacts } from '../contacts/contact.entity';
import { users } from '../users/user.entity';

export const recordNotes = pgTable('record_notes', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  contactId: integer().references(() => contacts.id, { onDelete: 'cascade' }),
  companyId: integer().references(() => companies.id, { onDelete: 'cascade' }),
  body: text().notNull(),
  authorId: integer().references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp().notNull().defaultNow(),
});
