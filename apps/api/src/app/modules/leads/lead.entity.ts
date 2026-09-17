import {
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.entity';
import { contacts } from '../contacts/contact.entity';
import { statuses } from '../pipelines/pipeline.entity';
import { users } from '../users/user.entity';

export const leads = pgTable(
  'leads',
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    name: text().notNull(),
    price: integer().notNull().default(0),
    source: text(),
    pipelineId: integer().notNull(),
    statusId: integer().notNull(),
    companyId: integer().references(() => companies.id, {
      onDelete: 'set null',
    }),
    ownerId: integer().references(() => users.id, { onDelete: 'set null' }),
    customFields: jsonb()
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The database must reject a status belonging to a different pipeline.
    foreignKey({
      columns: [table.statusId, table.pipelineId],
      foreignColumns: [statuses.id, statuses.pipelineId],
    }),
  ],
);

export const leadContacts = pgTable(
  'lead_contacts',
  {
    leadId: integer()
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    contactId: integer()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.leadId, table.contactId] })],
);
