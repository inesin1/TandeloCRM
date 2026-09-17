import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import { leads } from './lead.entity';
import { LeadsService } from './leads.service';

const lead: typeof leads.$inferSelect = {
  id: 42,
  name: 'CRM rollout',
  status: 'proposal',
  price: 12000,
  ownerId: 7,
  companyName: 'Example company',
  contactName: 'Alex',
  source: 'referral',
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};

const columns =
  '"id", "name", "status", "price", "ownerId", "companyName", "contactName", "source", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "leads"`;

function toRow(value: typeof leads.$inferSelect): unknown[] {
  return [
    value.id,
    value.name,
    value.status,
    value.price,
    value.ownerId,
    value.companyName,
    value.contactName,
    value.source,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof leads.$inferSelect)[] = [],
  rowCount = records.length,
) {
  const pool = new Pool();
  const query = vi.spyOn(pool, 'query').mockImplementation(async () => ({
    command: '',
    oid: 0,
    fields: [],
    rows: records.map(toRow),
    rowCount,
  }));
  const service = new LeadsService(drizzle(pool));

  return { service, query };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LeadsService', () => {
  describe('findAll', () => {
    it('returns all records without a WHERE clause when filters are omitted', async () => {
      const records = [lead, { ...lead, id: 43, ownerId: null, status: 'new' }];
      const { service, query } = setup(records);

      const result = await service.findAll();

      expect(result).toEqual(records);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: selectSql }),
        [],
      );
    });

    it.each([
      { filters: { ownerId: 7 }, where: '"leads"."ownerId" = $1', params: [7] },
      { filters: { ownerId: 0 }, where: '"leads"."ownerId" = $1', params: [0] },
      {
        filters: { status: 'won' },
        where: '"leads"."status" = $1',
        params: ['won'],
      },
      {
        filters: { search: 'CRM' },
        where: '"leads"."name" ilike $1',
        params: ['%CRM%'],
      },
      {
        filters: { search: "O'Reilly" },
        where: '"leads"."name" ilike $1',
        params: ["%O'Reilly%"],
      },
      {
        filters: { ownerId: 7, status: 'proposal', search: 'CRM' },
        where:
          '("leads"."ownerId" = $1 and "leads"."status" = $2 and "leads"."name" ilike $3)',
        params: [7, 'proposal', '%CRM%'],
      },
    ])(
      'applies filters $filters to the executed query',
      async ({ filters, where, params }) => {
        const { service, query } = setup();

        const result = await service.findAll(filters);

        expect(result).toEqual([]);
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ text: `${selectSql} where ${where}` }),
          params,
        );
      },
    );
  });

  describe('findOne', () => {
    it('selects the requested numeric id and returns the record', async () => {
      const { service, query } = setup([lead]);

      const result = await service.findOne('42');

      expect(result).toEqual(lead);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "leads"."id" = $1`,
        }),
        [42],
      );
    });

    it('throws NotFoundException when the requested record does not exist', async () => {
      const { service, query } = setup();

      const result = service.findOne('404');

      await expect(result).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "leads"."id" = $1`,
        }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('inserts the DTO and returns the database record including generated fields', async () => {
      const dto: CreateLeadDto = {
        name: lead.name,
        status: 'proposal',
        price: lead.price,
        ownerId: lead.ownerId,
        companyName: lead.companyName,
        contactName: lead.contactName,
        source: lead.source,
      };
      const { service, query } = setup([lead]);

      const result = await service.create(dto);

      expect(result).toEqual(lead);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "leads" (${columns}) values (default, $1, $2, $3, $4, $5, $6, $7, default, default) returning ${columns}`,
        }),
        [
          dto.name,
          dto.status,
          dto.price,
          dto.ownerId,
          dto.companyName,
          dto.contactName,
          dto.source,
        ],
      );
    });
  });

  describe('update', () => {
    it('only selects the existing record when the DTO is empty', async () => {
      const { service, query } = setup([lead]);

      const result = await service.update('42', {});

      expect(result).toEqual(lead);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "leads"."id" = $1`,
        }),
        [42],
      );
    });

    it('updates the requested id and returns the changed database record', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdateLeadDto = {
        name: 'Updated lead',
        status: 'won',
        ownerId: null,
        price: 0,
      };
      const updated = { ...lead, ...dto, updatedAt: now };
      const { service, query } = setup([updated]);

      const result = await service.update('42', dto);

      expect(result).toEqual(updated);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "leads" set "name" = $1, "status" = $2, "price" = $3, "ownerId" = $4, "updatedAt" = $5 where "leads"."id" = $6 returning ${columns}`,
        }),
        ['Updated lead', 'won', 0, null, now.toISOString(), 42],
      );
    });

    it.each<UpdateLeadDto>([{}, { name: 'Missing lead' }])(
      'throws NotFoundException for a missing id with DTO %j',
      async (dto) => {
        const { service } = setup();

        const result = service.update('404', dto);

        await expect(result).rejects.toThrow(NotFoundException);
      },
    );
  });

  describe('remove', () => {
    it('deletes the requested id and reports success when one row is deleted', async () => {
      const { service, query } = setup([], 1);

      const result = await service.remove('42');

      expect(result).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "leads" where "leads"."id" = $1',
        }),
        [42],
      );
    });

    it('throws NotFoundException when no row is deleted', async () => {
      const { service, query } = setup([], 0);

      const result = service.remove('404');

      await expect(result).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "leads" where "leads"."id" = $1',
        }),
        [404],
      );
    });
  });
});
