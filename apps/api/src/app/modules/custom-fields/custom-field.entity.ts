import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'boolean',
  'select',
] as const;
export const CUSTOM_FIELD_ENTITY_TYPES = [
  'lead',
  'company',
  'contact',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type CustomFieldEntityType = (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

export const customFieldDefinitions = pgTable(
  'custom_field_definitions',
  {
    id: integer().generatedAlwaysAsIdentity().primaryKey(),
    entityType: text({ enum: CUSTOM_FIELD_ENTITY_TYPES }).notNull(),
    key: text().notNull(),
    label: text().notNull(),
    type: text({ enum: CUSTOM_FIELD_TYPES }).notNull(),
    options: jsonb().$type<string[]>(),
    isRequired: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('custom_field_definitions_entity_type_key').on(t.entityType, t.key),
  ],
);
