import { NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { users } from './user.entity';
import { UsersService } from './users.service';

const user: typeof users.$inferSelect = {
  id: 7,
  email: 'alex@example.com',
  name: 'Alex',
  passwordHash: 'stored-password-hash',
  isActive: true,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const publicUser = {
  id: user.id,
  email: user.email,
  name: user.name,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};
const publicColumns =
  '"id", "email", "name", "isActive", "createdAt", "updatedAt"';
const publicSelect = `select ${publicColumns} from "users"`;

function publicRow(value = user): unknown[] {
  return [
    value.id,
    value.email,
    value.name,
    value.isActive,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function fullRow(value = user): unknown[] {
  return [
    value.id,
    value.email,
    value.name,
    value.passwordHash,
    value.isActive,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function result(rows: unknown[][] = [], rowCount = rows.length) {
  return { command: '', oid: 0, fields: [], rows, rowCount };
}

function setup(...responses: ReturnType<typeof result>[]) {
  const pool = new Pool();
  const queue = [...responses];
  const query = vi.spyOn(pool, 'query').mockImplementation(async () => {
    const response = queue.shift();
    if (!response) {
      throw new Error('Unexpected SQL query');
    }
    return response;
  });
  const release = vi.fn();
  const client = Object.assign(new Client(), {
    query: pool.query.bind(pool),
    release,
  });
  const connect = vi.spyOn(pool, 'connect').mockResolvedValue(client);
  return {
    service: new UsersService(drizzle(pool)),
    query,
    connect,
    release,
  };
}

function sqlCall(text: string, parameters: unknown[] = []) {
  return [expect.objectContaining({ text }), parameters];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UsersService', () => {
  describe('create', () => {
    it('creates a public user and links roles and groups atomically', async () => {
      const dto: CreateUserDto = {
        email: user.email,
        name: user.name,
        password: 'test-password',
        roleIds: [2, 3],
        groupIds: [4],
      };
      const { service, query, connect, release } = setup(
        result(),
        result([publicRow()]),
        result(),
        result(),
        result(),
      );

      expect(await service.create(dto)).toEqual(publicUser);
      const insertedPasswordHash = query.mock.calls[1][1][2] as string;
      expect(await argon2.verify(insertedPasswordHash, dto.password)).toBe(
        true,
      );
      expect(connect).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(query.mock.calls).toEqual([
        sqlCall('begin'),
        sqlCall(
          `insert into "users" ("id", "email", "name", "passwordHash", "isActive", "createdAt", "updatedAt") values (default, $1, $2, $3, default, default, default) returning ${publicColumns}`,
          [user.email, user.name, expect.any(String)],
        ),
        sqlCall(
          'insert into "user_roles" ("userId", "roleId") values ($1, $2), ($3, $4)',
          [7, 2, 7, 3],
        ),
        sqlCall(
          'insert into "user_groups" ("userId", "groupId") values ($1, $2)',
          [7, 4],
        ),
        sqlCall('commit'),
      ]);
    });
  });

  describe('findAll', () => {
    it('returns public users with their roles and groups', async () => {
      const { service, query } = setup(
        result([publicRow()]),
        result([
          [7, 2, 'Manager'],
          [7, 3, 'Admin'],
        ]),
        result([[7, 4, 'Sales']]),
      );

      expect(await service.findAll()).toEqual([
        {
          ...publicUser,
          roles: [
            { id: 2, name: 'Manager' },
            { id: 3, name: 'Admin' },
          ],
          groups: [{ id: 4, name: 'Sales' }],
        },
      ]);
      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenNthCalledWith(
        1,
        ...sqlCall(`${publicSelect} order by "users"."id" asc`),
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        ...sqlCall(
          'select "user_roles"."userId", "roles"."id", "roles"."name" from "user_roles" inner join "roles" on "user_roles"."roleId" = "roles"."id"',
        ),
      );
      expect(query).toHaveBeenNthCalledWith(
        3,
        ...sqlCall(
          'select "user_groups"."userId", "groups"."id", "groups"."name" from "user_groups" inner join "groups" on "user_groups"."groupId" = "groups"."id"',
        ),
      );
    });
  });

  describe('findOne', () => {
    it('returns a public user selected by numeric id', async () => {
      const { service, query } = setup(result([publicRow()]));

      expect(await service.findOne('7')).toEqual(publicUser);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall(`${publicSelect} where "users"."id" = $1`, [7]),
      );
    });

    it('throws for a missing user', async () => {
      const { service } = setup(result());
      await expect(service.findOne('404')).rejects.toThrow(
        new NotFoundException('User 404 not found'),
      );
    });
  });

  describe('findByEmail', () => {
    it('returns the full user needed for authentication', async () => {
      const { service, query } = setup(result([fullRow()]));

      expect(await service.findByEmail(user.email)).toEqual(user);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall(
          'select "id", "email", "name", "passwordHash", "isActive", "createdAt", "updatedAt" from "users" where "users"."email" = $1',
          [user.email],
        ),
      );
    });

    it('returns null when the email does not exist', async () => {
      const { service } = setup(result());
      expect(await service.findByEmail('missing@example.com')).toBeNull();
    });
  });

  describe('update', () => {
    it('updates scalar fields and replaces roles and groups atomically', async () => {
      const password = 'updated-password';
      const dto: UpdateUserDto = {
        name: 'Alex Updated',
        password,
        isActive: false,
        roleIds: [3],
        groupIds: [],
      };
      const updated = {
        ...user,
        name: dto.name,
        isActive: false,
      };
      const { service, query, release } = setup(
        result(),
        result([publicRow(updated)]),
        result(),
        result(),
        result(),
        result(),
      );

      expect(await service.update('7', dto)).toEqual({
        ...publicUser,
        name: 'Alex Updated',
        isActive: false,
      });
      const updatedPasswordHash = query.mock.calls[1][1].find(
        (value) => typeof value === 'string' && value.startsWith('$argon2'),
      ) as string;
      expect(await argon2.verify(updatedPasswordHash, password)).toBe(true);
      expect(query.mock.calls).toEqual([
        sqlCall('begin'),
        [
          expect.objectContaining({
            text: expect.stringContaining(
              'update "users" set "name" = $1, "passwordHash" = $2, "isActive" = $3, "updatedAt" = $4',
            ),
          }),
          expect.arrayContaining([
            'Alex Updated',
            false,
            expect.any(String),
            7,
          ]),
        ],
        sqlCall(
          'delete from "user_roles" where "user_roles"."userId" = $1',
          [7],
        ),
        sqlCall(
          'insert into "user_roles" ("userId", "roleId") values ($1, $2)',
          [7, 3],
        ),
        sqlCall(
          'delete from "user_groups" where "user_groups"."userId" = $1',
          [7],
        ),
        sqlCall('commit'),
      ]);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('only reads an existing user for an empty DTO', async () => {
      const { service, query } = setup(
        result(),
        result([publicRow()]),
        result(),
      );

      expect(await service.update('7', {})).toEqual(publicUser);
      expect(query.mock.calls).toEqual([
        sqlCall('begin'),
        sqlCall(`${publicSelect} where "users"."id" = $1`, [7]),
        sqlCall('commit'),
      ]);
    });

    it.each<UpdateUserDto>([{}, { name: 'Missing' }])(
      'throws for a missing user with DTO %j',
      async (dto) => {
        const { service } = setup(result(), result(), result());
        await expect(service.update('404', dto)).rejects.toThrow(
          NotFoundException,
        );
      },
    );
  });

  describe('remove', () => {
    it('deletes a user and reports success', async () => {
      const { service, query } = setup(result([], 1));

      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall('delete from "users" where "users"."id" = $1', [7]),
      );
    });

    it('throws when no user was deleted', async () => {
      const { service } = setup(result());
      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
    });
  });
});
