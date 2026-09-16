import { pgTable, text, timestamp, integer, primaryKey } from 'drizzle-orm/pg-core';
import { users } from '../users/user.entity';

export const roles = pgTable('roles', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  name: text().notNull().unique(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: integer()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

export const permissions = pgTable('permissions', {
  id: integer().generatedAlwaysAsIdentity().primaryKey(),
  key: text().notNull().unique(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: integer()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer()
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);
