import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, QueryArrayConfig, QueryArrayResult } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roles } from './access-control.entity';
import { RolesService } from './roles.service';

const role: typeof roles.$inferSelect = {
  id: 7,
  name: 'Admin',
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

function setup(records: (typeof roles.$inferSelect)[] = []) {
  const query = vi
    .fn<
      (config: QueryArrayConfig, values: unknown[]) => Promise<QueryArrayResult>
    >()
    .mockResolvedValue({
      command: '',
      oid: 0,
      fields: [],
      rows: records.map(toRow),
      rowCount: records.length,
    });
  const pool = Object.assign(new Pool(), { query });
  return { service: new RolesService(drizzle(pool)), query };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RolesService', () => {
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
});
