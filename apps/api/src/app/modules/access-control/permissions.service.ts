import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import {
  permissions,
  rolePermissions,
  userRoles,
} from './access-control.entity';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  findAll() {
    return this.db.select().from(permissions);
  }

  async getEffectivePermissions(userId: number) {
    const permissionRecords = await this.db
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(
        permissions,
        eq(rolePermissions.permissionId, permissions.id),
      )
      .where(eq(userRoles.userId, userId));

    return [...new Set(permissionRecords.map(({ key }) => key))];
  }
}
