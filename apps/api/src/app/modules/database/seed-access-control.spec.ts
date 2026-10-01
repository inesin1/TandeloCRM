import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEYS } from '../access-control/permissions.catalog';
import { seedAccessControl } from './seed-access-control';

function result(rows: unknown[][] = [], rowCount = rows.length) {
  return { command: '', oid: 0, fields: [], rows, rowCount };
}

function seedResponses() {
  return [
    result(),
    result(),
    result(),
    result([
      [1, 'Admin'],
      [2, 'Member'],
    ]),
    result([[10], [11]]),
    result([[10]]),
    result(),
    result(),
    result(PERMISSION_KEYS.map((key, index) => [index + 1, key])),
    result(),
    result(),
    result(),
    result(),
    result(),
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('seedAccessControl', () => {
  it('can be repeated without duplicate system roles or permissions', async () => {
    const pool = new Pool();
    const responses = [...seedResponses(), ...seedResponses()];
    const query = vi.spyOn(pool, 'query').mockImplementation(async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected SQL query');
      }
      return response;
    });
    const client = Object.assign(new Client(), {
      query: pool.query.bind(pool),
      release: vi.fn(),
    });
    vi.spyOn(pool, 'connect').mockResolvedValue(client);
    const db = drizzle(pool);

    await seedAccessControl(db);
    await seedAccessControl(db);

    const statements = query.mock.calls.map(([call]) => call.text ?? '');
    expect(statements.filter((text) => text.includes('insert into "roles"')))
      .toHaveLength(2);
    expect(statements.filter((text) => text.includes('insert into "permissions"')))
      .toHaveLength(2);
    expect(
      statements.filter(
        (text) =>
          text.includes('insert into "roles"') ||
          text.includes('insert into "permissions"'),
      ).every((text) => text.includes('on conflict do nothing')),
    ).toBe(true);
    expect(statements.some((text) => text.includes('"leads"'))).toBe(false);
  });
});
