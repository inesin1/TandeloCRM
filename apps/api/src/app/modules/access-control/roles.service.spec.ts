import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';
import { roles } from './access-control.entity';
import { RolesService } from './roles.service';

const role: typeof roles.$inferSelect = {
  id: 7,
  name: 'Manager',
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
};
const columns = '"id", "name", "createdAt"';
const selectSql = `select ${columns} from "roles"`;

function toRow(value: typeof roles.$inferSelect): unknown[] {
  return [
    value.id,
    value.name,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof roles.$inferSelect)[] = [],
  rowCount = records.length,
) {
  const pool = new Pool();
  const query = vi.spyOn(pool, 'query').mockResolvedValue({
    command: '',
    oid: 0,
    fields: [],
    rows: records.map(toRow),
    rowCount,
  });
  return { service: new RolesService(drizzle(pool)), query };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RolesService', () => {
  describe('create', () => {
    it('creates and returns a role', async () => {
      const dto: CreateRoleDto = { name: role.name };
      const { service, query } = setup([role]);

      expect(await service.create(dto)).toEqual(role);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "roles" (${columns}) values (default, $1, default) returning ${columns}`,
        }),
        ['Manager'],
      );
    });
  });

  describe('findAll', () => {
    it('returns all roles', async () => {
      const records = [
        { ...role, name: 'Admin' },
        { ...role, id: 8, name: 'Member' },
      ];
      const { service, query } = setup(records);

      expect(await service.findAll()).toEqual(records);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "roles"."name" in ($1, $2)`,
        }),
        ['Admin', 'Member'],
      );
    });
  });

  describe('findOne', () => {
    it('returns the role selected by numeric id', async () => {
      const adminRole = { ...role, name: 'Admin' };
      const { service, query } = setup([adminRole]);

      expect(await service.findOne('7')).toEqual(adminRole);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where ("roles"."id" = $1 and "roles"."name" in ($2, $3))`,
        }),
        [7, 'Admin', 'Member'],
      );
    });

    it('throws for a missing role', async () => {
      const { service } = setup();
      await expect(service.findOne('404')).rejects.toThrow(
        new NotFoundException('Role 404 not found'),
      );
    });
  });

  describe('update', () => {
    it('reads the role without issuing an update for an empty DTO', async () => {
      const { service, query } = setup([role]);

      expect(await service.update('7', {})).toEqual(role);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "roles"."id" = $1`,
        }),
        [7],
      );
    });

    it('updates and returns the requested role', async () => {
      const dto: UpdateRoleDto = { name: 'Administrator' };
      const updated = { ...role, ...dto };
      const { service, query } = setup([updated]);

      expect(await service.update('7', dto)).toEqual(updated);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "roles" set "name" = $1 where "roles"."id" = $2 returning ${columns}`,
        }),
        ['Administrator', 7],
      );
    });

    it.each<UpdateRoleDto>([{}, { name: 'Missing' }])(
      'throws for a missing role with DTO %j',
      async (dto) => {
        const { service } = setup();
        await expect(service.update('404', dto)).rejects.toThrow(
          NotFoundException,
        );
      },
    );
  });

  describe('remove', () => {
    it('deletes a role and reports success', async () => {
      const { service, query } = setup([], 1);

      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "roles" where "roles"."id" = $1',
        }),
        [7],
      );
    });

    it('throws when no role was deleted', async () => {
      const { service } = setup();
      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
    });
  });
});
