import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { roles, userRoles } from '../access-control/access-control.entity';
import { SYSTEM_ROLE_NAMES } from '../access-control/permissions.constants';
import { groups, publicUserColumns, users, userGroups } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const ADMIN_ROLE = 'Admin';
type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateUserDto) {
    const { password, roleIds, groupIds, ...rest } = dto;
    const passwordHash = await argon2.hash(password);

    return this.db.transaction(async (tx) => {
      await this.assertSystemRole(tx, roleIds);
      const [user] = await tx
        .insert(users)
        .values({ ...rest, passwordHash })
        .returning(publicUserColumns);

      if (roleIds?.length) {
        await tx
          .insert(userRoles)
          .values(roleIds.map((roleId) => ({ userId: user.id, roleId })));
      }
      if (groupIds?.length) {
        await tx
          .insert(userGroups)
          .values(groupIds.map((groupId) => ({ userId: user.id, groupId })));
      }

      return user;
    });
  }

  async findAll() {
    const [records, roleLinks, groupLinks] = await Promise.all([
      this.db.select(publicUserColumns).from(users).orderBy(asc(users.id)),
      this.db
        .select({ userId: userRoles.userId, id: roles.id, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id)),
      this.db
        .select({ userId: userGroups.userId, id: groups.id, name: groups.name })
        .from(userGroups)
        .innerJoin(groups, eq(userGroups.groupId, groups.id)),
    ]);

    return records.map((user) => ({
      ...user,
      roles: roleLinks
        .filter((link) => link.userId === user.id)
        .map(({ id, name }) => ({ id, name })),
      groups: groupLinks
        .filter((link) => link.userId === user.id)
        .map(({ id, name }) => ({ id, name })),
    }));
  }

  async findOne(id: string) {
    const [user] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(eq(users.id, Number(id)));
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user ?? null;
  }

  async findActiveById(id: number) {
    const [user] = await this.db
      .select(publicUserColumns)
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)));
    return user ?? null;
  }

  async update(id: string, dto: UpdateUserDto) {
    const { password, roleIds, groupIds, ...rest } = dto;
    const userId = Number(id);

    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(740921)`);
      const [currentUser] = await tx
        .select(publicUserColumns)
        .from(users)
        .where(eq(users.id, userId));
      if (!currentUser) {
        throw new NotFoundException(`User ${id} not found`);
      }

      const currentRoles = await tx
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));
      const nextRole = roleIds
        ? await this.assertSystemRole(tx, roleIds)
        : null;
      const losesAdminAccess =
        currentUser.isActive &&
        currentRoles.some(({ name }) => name === ADMIN_ROLE) &&
        (!(dto.isActive ?? currentUser.isActive) ||
          (nextRole !== null && nextRole.name !== ADMIN_ROLE));
      if (losesAdminAccess) {
        await this.ensureAnotherActiveAdmin(tx);
      }

      const values = password
        ? { ...rest, passwordHash: await argon2.hash(password) }
        : rest;

      const [user] = Object.keys(values).length
        ? await tx
            .update(users)
            .set(values)
            .where(eq(users.id, userId))
            .returning(publicUserColumns)
        : [currentUser];

      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }

      if (roleIds) {
        await tx.delete(userRoles).where(eq(userRoles.userId, userId));
        if (roleIds.length) {
          await tx
            .insert(userRoles)
            .values(roleIds.map((roleId) => ({ userId, roleId })));
        }
      }

      if (groupIds) {
        await tx.delete(userGroups).where(eq(userGroups.userId, userId));
        if (groupIds.length) {
          await tx
            .insert(userGroups)
            .values(groupIds.map((groupId) => ({ userId, groupId })));
        }
      }

      return user;
    });
  }

  async remove(id: string) {
    return this.db.transaction(async (tx) => {
      const userId = Number(id);
      await tx.execute(sql`select pg_advisory_xact_lock(740921)`);
      const [user] = await tx
        .select(publicUserColumns)
        .from(users)
        .where(eq(users.id, userId));
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }

      if (user.isActive && (await this.hasAdminRole(tx, userId))) {
        await this.ensureAnotherActiveAdmin(tx);
      }

      await tx.delete(users).where(eq(users.id, userId));
      return { deleted: true };
    });
  }

  private async assertSystemRole(
    db: DatabaseTransaction,
    roleIds: number[] | undefined,
  ) {
    if (!roleIds || roleIds.length !== 1) {
      throw new BadRequestException('Exactly one system role is required');
    }

    const [role] = await db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(inArray(roles.id, roleIds));
    if (
      !role ||
      !SYSTEM_ROLE_NAMES.includes(role.name as (typeof SYSTEM_ROLE_NAMES)[number])
    ) {
      throw new BadRequestException('Only Admin and Member roles are allowed');
    }
    return role;
  }

  private async hasAdminRole(db: DatabaseTransaction, userId: number) {
    const [role] = await db
      .select({ id: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(roles.name, ADMIN_ROLE),
        ),
      );
    return Boolean(role);
  }

  private async ensureAnotherActiveAdmin(db: DatabaseTransaction) {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.isActive, true), eq(roles.name, ADMIN_ROLE)));

    if (admins.length <= 1) {
      throw new ConflictException('The last active Admin cannot be removed');
    }
  }
}
