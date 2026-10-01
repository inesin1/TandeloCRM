import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Database } from './database.module';
import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
} from '../access-control/access-control.entity';
import { PERMISSION_KEYS } from '../access-control/permissions.catalog';
import { users } from '../users/user.entity';

const MEMBER_PERMISSION_KEYS = [
  'leads:read',
  'leads:write',
  'contacts:read',
  'contacts:write',
  'companies:read',
  'companies:write',
  'tasks:read',
  'tasks:write',
  'analytics:read',
  'pipelines:read',
  'custom-fields:read',
  'users:read',
  'groups:read',
] as const;

export async function seedAccessControl(db: Database) {
  await db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(PERMISSION_KEYS.map((key) => ({ key })))
      .onConflictDoNothing();
    await tx
      .insert(roles)
      .values([{ name: 'Admin' }, { name: 'Member' }])
      .onConflictDoNothing();

    const roleRecords = await tx
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(inArray(roles.name, ['Admin', 'Member']));
    const adminRole = roleRecords.find(({ name }) => name === 'Admin');
    const memberRole = roleRecords.find(({ name }) => name === 'Member');
    if (!adminRole || !memberRole) {
      throw new Error('System roles are missing after access control seeding');
    }

    const userRecords = await tx.select({ id: users.id }).from(users);
    const adminAssignments = await tx
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(roles.name, 'Admin'));
    const adminUserIds = new Set(adminAssignments.map(({ userId }) => userId));
    await tx.delete(userRoles);
    if (userRecords.length) {
      await tx
        .insert(userRoles)
        .values(
          userRecords.map(({ id }) => ({
            userId: id,
            roleId: adminUserIds.has(id) ? adminRole.id : memberRole.id,
          })),
        )
        .onConflictDoNothing();
    }

    const permissionRecords = await tx
      .select({ id: permissions.id, key: permissions.key })
      .from(permissions)
      .where(inArray(permissions.key, [...PERMISSION_KEYS]));
    const permissionIds = new Map(
      permissionRecords.map(({ id, key }) => [key, id]),
    );

    for (const role of roleRecords) {
      const allowedKeys =
        role.name === 'Admin' ? PERMISSION_KEYS : MEMBER_PERMISSION_KEYS;
      const allowedIds = allowedKeys.flatMap((key) => {
        const id = permissionIds.get(key);
        return id === undefined ? [] : [id];
      });
      if (allowedIds.length) {
        await tx
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.roleId, role.id),
              notInArray(rolePermissions.permissionId, allowedIds),
            ),
          );
        await tx
          .insert(rolePermissions)
          .values(
            allowedIds.map((permissionId) => ({
              roleId: role.id,
              permissionId,
            })),
          )
          .onConflictDoNothing();
      }
    }
  });
}
