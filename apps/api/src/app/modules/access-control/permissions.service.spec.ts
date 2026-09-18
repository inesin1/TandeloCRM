import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { permissions } from './access-control.entity';
import { PermissionsService } from './permissions.service';

const permission: typeof permissions.$inferSelect = {
  id: 3,
  key: 'leads:read',
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PermissionsService', () => {
  it('returns all permissions', async () => {
    const pool = new Pool();
    const query = vi.spyOn(pool, 'query').mockResolvedValue({
      command: '',
      oid: 0,
      fields: [],
      rows: [[permission.id, permission.key, '2026-09-01 10:00:00.000']],
      rowCount: 1,
    });
    const service = new PermissionsService(drizzle(pool));

    expect(await service.findAll()).toEqual([permission]);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        text: 'select "id", "key", "createdAt" from "permissions"',
      }),
      [],
    );
  });
});
