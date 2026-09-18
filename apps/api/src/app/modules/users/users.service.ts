import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { roles, userRoles } from '../access-control/access-control.entity';
import { groups, publicUserColumns, users, userGroups } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateUserDto) {
    const { password, roleIds, groupIds, ...rest } = dto;
    const passwordHash = await argon2.hash(password);

    return this.db.transaction(async (tx) => {
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

  async update(id: string, dto: UpdateUserDto) {
    const { password, roleIds, groupIds, ...rest } = dto;
    const userId = Number(id);

    return this.db.transaction(async (tx) => {
      const values = password
        ? { ...rest, passwordHash: await argon2.hash(password) }
        : rest;

      const [user] = Object.keys(values).length
        ? await tx
            .update(users)
            .set(values)
            .where(eq(users.id, userId))
            .returning(publicUserColumns)
        : await tx
            .select(publicUserColumns)
            .from(users)
            .where(eq(users.id, userId));

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
    const result = await this.db.delete(users).where(eq(users.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return { deleted: true };
  }
}
