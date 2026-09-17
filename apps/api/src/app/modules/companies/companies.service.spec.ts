import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';
import { companies } from './company.entity';
import { CompaniesService } from './companies.service';

const company: typeof companies.$inferSelect = {
  id: 7,
  name: 'Sales',
  industry: 'Software',
  address: 'Demo street',
  email: 'sales@example.com',
  phone: '+0 000 000 000',
  ownerId: 3,
  customFields: { tier: 'gold' },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const columns =
  '"id", "name", "industry", "address", "email", "phone", "ownerId", "customFields", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "companies"`;

function toRow(value: typeof companies.$inferSelect): unknown[] {
  return [
    value.id,
    value.name,
    value.industry,
    value.address,
    value.email,
    value.phone,
    value.ownerId,
    value.customFields,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof companies.$inferSelect)[] = [],
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
  const db = drizzle(pool);
  const customFieldsService = new CustomFieldsService(db);
  const validate = vi
    .spyOn(customFieldsService, 'validate')
    .mockResolvedValue();
  const service = new CompaniesService(db, customFieldsService);
  return { service, query, validate };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CompaniesService', () => {
  describe('findAll', () => {
    it('returns all companies without filters', async () => {
      const records = [company, { ...company, id: 8 }];
      const { service, query } = setup(records);

      expect(await service.findAll()).toEqual(records);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: selectSql }),
        [],
      );
    });

    it.each([
      {
        filters: { ownerId: 0 },
        where: '"companies"."ownerId" = $1',
        params: [0],
      },
      {
        filters: { search: 'Sale' },
        where: '"companies"."name" ilike $1',
        params: ['%Sale%'],
      },
      {
        filters: { ownerId: 3, search: 'Sale' },
        where: '("companies"."ownerId" = $1 and "companies"."name" ilike $2)',
        params: [3, '%Sale%'],
      },
    ])('builds filters $filters', async ({ filters, where, params }) => {
      const { service, query } = setup([company]);

      expect(await service.findAll(filters)).toEqual([company]);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} where ${where}` }),
        params,
      );
    });
  });

  describe('findOne', () => {
    it('selects the numeric id and returns the company', async () => {
      const { service, query } = setup([company]);

      expect(await service.findOne('7')).toEqual(company);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "companies"."id" = $1`,
        }),
        [7],
      );
    });

    it('throws NotFoundException for a missing company', async () => {
      const { service, query } = setup();

      await expect(service.findOne('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "companies"."id" = $1`,
        }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('validates custom fields before inserting the DTO and returns generated fields', async () => {
      const dto: CreateCompanyDto = {
        name: company.name,
        industry: company.industry,
        address: company.address,
        email: company.email,
        phone: company.phone,
        ownerId: company.ownerId,
        customFields: company.customFields,
      };
      const { service, query, validate } = setup([company]);
      validate.mockImplementation(async () => {
        expect(query).not.toHaveBeenCalled();
      });

      expect(await service.create(dto)).toEqual(company);
      expect(validate).toHaveBeenCalledExactlyOnceWith(
        'company',
        dto.customFields,
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "companies" (${columns}) values (default, $1, $2, $3, $4, $5, $6, $7, default, default) returning ${columns}`,
        }),
        [
          'Sales',
          'Software',
          'Demo street',
          'sales@example.com',
          '+0 000 000 000',
          3,
          JSON.stringify(dto.customFields),
        ],
      );
    });

    it('validates an empty object and uses database defaults when optional fields are omitted', async () => {
      const record = {
        ...company,
        industry: null,
        address: null,
        email: null,
        phone: null,
        ownerId: null,
        customFields: {},
      };
      const { service, query, validate } = setup([record]);

      expect(await service.create({ name: 'Sales' })).toEqual(record);
      expect(validate).toHaveBeenCalledExactlyOnceWith('company', {});
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "companies" (${columns}) values (default, $1, default, default, default, default, default, default, default, default) returning ${columns}`,
        }),
        ['Sales'],
      );
    });

    it.each<CreateCompanyDto>([
      { name: 'Sales' },
      { name: 'Sales', customFields: { unknown: true } },
    ])('does not insert when validation rejects %j', async (dto) => {
      const { service, query, validate } = setup();
      const error = new BadRequestException('Invalid custom fields');
      validate.mockRejectedValue(error);

      await expect(service.create(dto)).rejects.toBe(error);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('only selects the existing company for an empty DTO', async () => {
      const { service, query, validate } = setup([company]);

      expect(await service.update('7', {})).toEqual(company);
      expect(validate).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "companies"."id" = $1`,
        }),
        [7],
      );
    });

    it('updates scalar fields and clears the owner without validating absent custom fields', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdateCompanyDto = { name: 'Renewals', ownerId: null };
      const updated = { ...company, ...dto, updatedAt: now };
      const { service, query, validate } = setup([updated]);

      expect(await service.update('7', dto)).toEqual(updated);
      expect(validate).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "companies" set "name" = $1, "ownerId" = $2, "updatedAt" = $3 where "companies"."id" = $4 returning ${columns}`,
        }),
        ['Renewals', null, now.toISOString(), 7],
      );
    });

    it.each([{}, { tier: 'silver' }])(
      'validates and replaces custom fields with %j before updating',
      async (customFields) => {
        vi.useFakeTimers();
        const now = new Date('2026-09-17T12:00:00.000Z');
        vi.setSystemTime(now);
        const updated = { ...company, customFields, updatedAt: now };
        const { service, query, validate } = setup([updated]);
        validate.mockImplementation(async () => {
          expect(query).not.toHaveBeenCalled();
        });

        expect(await service.update('7', { customFields })).toEqual(updated);
        expect(validate).toHaveBeenCalledExactlyOnceWith(
          'company',
          customFields,
        );
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            text: `update "companies" set "customFields" = $1, "updatedAt" = $2 where "companies"."id" = $3 returning ${columns}`,
          }),
          [JSON.stringify(customFields), now.toISOString(), 7],
        );
      },
    );

    it('does not update when custom field validation rejects', async () => {
      const { service, query, validate } = setup();
      const error = new BadRequestException('Invalid custom fields');
      validate.mockRejectedValue(error);

      await expect(service.update('7', { customFields: {} })).rejects.toBe(
        error,
      );
      expect(query).not.toHaveBeenCalled();
    });

    it.each<UpdateCompanyDto>([{}, { name: 'Missing' }])(
      'throws NotFoundException for a missing company with DTO %j',
      async (dto) => {
        const { service } = setup();
        await expect(service.update('404', dto)).rejects.toThrow(
          NotFoundException,
        );
      },
    );
  });

  describe('remove', () => {
    it('deletes the numeric id and reports success', async () => {
      const { service, query } = setup([], 1);

      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "companies" where "companies"."id" = $1',
        }),
        [7],
      );
    });

    it('throws NotFoundException when no row was deleted', async () => {
      const { service, query } = setup();

      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "companies" where "companies"."id" = $1',
        }),
        [404],
      );
    });
  });
});
