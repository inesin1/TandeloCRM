import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text().notNull(),
  isActive: boolean().notNull().default(true),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const publicUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export type PublicUser = Omit<typeof users.$inferSelect, 'passwordHash'>;

export const groups = pgTable('groups', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull().unique(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const userGroups = pgTable(
  'user_groups',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: integer()
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.groupId] })],
);
