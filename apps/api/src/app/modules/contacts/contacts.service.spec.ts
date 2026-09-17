import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import { contacts } from './contact.entity';
import { ContactsService } from './contacts.service';

const contact: typeof contacts.$inferSelect = {
  id: 7,
  name: 'Sales',
  position: 'Manager',
  companyId: 5,
  email: 'sales@example.com',
  phone: '+0 000 000 000',
  ownerId: 3,
  customFields: { tier: 'gold' },
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const columns =
  '"id", "name", "position", "companyId", "email", "phone", "ownerId", "customFields", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "contacts"`;

function toRow(value: typeof contacts.$inferSelect): unknown[] {
  return [
    value.id,
    value.name,
    value.position,
    value.companyId,
    value.email,
    value.phone,
    value.ownerId,
    value.customFields,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof contacts.$inferSelect)[] = [],
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
  const service = new ContactsService(db, customFieldsService);
  return { service, query, validate };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ContactsService', () => {
  describe('findAll', () => {
    it('returns all contacts without filters', async () => {
      const records = [contact, { ...contact, id: 8 }];
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
        where: '"contacts"."ownerId" = $1',
        params: [0],
      },
      {
        filters: { search: 'Sale' },
        where: '"contacts"."name" ilike $1',
        params: ['%Sale%'],
      },
      {
        filters: { companyId: 0 },
        where: '"contacts"."companyId" = $1',
        params: [0],
      },
      {
        filters: { ownerId: 3, companyId: 5, search: 'Sale' },
        where:
          '("contacts"."ownerId" = $1 and "contacts"."companyId" = $2 and "contacts"."name" ilike $3)',
        params: [3, 5, '%Sale%'],
      },
    ])('builds filters $filters', async ({ filters, where, params }) => {
      const { service, query } = setup([contact]);

      expect(await service.findAll(filters)).toEqual([contact]);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} where ${where}` }),
        params,
      );
    });
  });

  describe('findOne', () => {
    it('selects the numeric id and returns the contact', async () => {
      const { service, query } = setup([contact]);

      expect(await service.findOne('7')).toEqual(contact);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "contacts"."id" = $1`,
        }),
        [7],
      );
    });

    it('throws NotFoundException for a missing contact', async () => {
      const { service, query } = setup();

      await expect(service.findOne('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "contacts"."id" = $1`,
        }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('validates custom fields before inserting the DTO and returns generated fields', async () => {
      const dto: CreateContactDto = {
        name: contact.name,
        position: contact.position,
        companyId: contact.companyId,
        email: contact.email,
        phone: contact.phone,
        ownerId: contact.ownerId,
        customFields: contact.customFields,
      };
      const { service, query, validate } = setup([contact]);
      validate.mockImplementation(async () => {
        expect(query).not.toHaveBeenCalled();
      });

      expect(await service.create(dto)).toEqual(contact);
      expect(validate).toHaveBeenCalledExactlyOnceWith(
        'contact',
        dto.customFields,
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "contacts" (${columns}) values (default, $1, $2, $3, $4, $5, $6, $7, default, default) returning ${columns}`,
        }),
        [
          'Sales',
          'Manager',
          5,
          'sales@example.com',
          '+0 000 000 000',
          3,
          JSON.stringify(dto.customFields),
        ],
      );
    });

    it('validates an empty object and uses database defaults when optional fields are omitted', async () => {
      const record = {
        ...contact,
        position: null,
        companyId: null,
        email: null,
        phone: null,
        ownerId: null,
        customFields: {},
      };
      const { service, query, validate } = setup([record]);

      expect(await service.create({ name: 'Sales' })).toEqual(record);
      expect(validate).toHaveBeenCalledExactlyOnceWith('contact', {});
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "contacts" (${columns}) values (default, $1, default, default, default, default, default, default, default, default) returning ${columns}`,
        }),
        ['Sales'],
      );
    });

    it.each<CreateContactDto>([
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
    it('only selects the existing contact for an empty DTO', async () => {
      const { service, query, validate } = setup([contact]);

      expect(await service.update('7', {})).toEqual(contact);
      expect(validate).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "contacts"."id" = $1`,
        }),
        [7],
      );
    });

    it('updates scalar fields and clears the owner and company without validating absent custom fields', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdateContactDto = {
        name: 'Renewals',
        companyId: null,
        ownerId: null,
      };
      const updated = { ...contact, ...dto, updatedAt: now };
      const { service, query, validate } = setup([updated]);

      expect(await service.update('7', dto)).toEqual(updated);
      expect(validate).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "contacts" set "name" = $1, "companyId" = $2, "ownerId" = $3, "updatedAt" = $4 where "contacts"."id" = $5 returning ${columns}`,
        }),
        ['Renewals', null, null, now.toISOString(), 7],
      );
    });

    it.each([{}, { tier: 'silver' }])(
      'validates and replaces custom fields with %j before updating',
      async (customFields) => {
        vi.useFakeTimers();
        const now = new Date('2026-09-17T12:00:00.000Z');
        vi.setSystemTime(now);
        const updated = { ...contact, customFields, updatedAt: now };
        const { service, query, validate } = setup([updated]);
        validate.mockImplementation(async () => {
          expect(query).not.toHaveBeenCalled();
        });

        expect(await service.update('7', { customFields })).toEqual(updated);
        expect(validate).toHaveBeenCalledExactlyOnceWith(
          'contact',
          customFields,
        );
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            text: `update "contacts" set "customFields" = $1, "updatedAt" = $2 where "contacts"."id" = $3 returning ${columns}`,
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

    it.each<UpdateContactDto>([{}, { name: 'Missing' }])(
      'throws NotFoundException for a missing contact with DTO %j',
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
          text: 'delete from "contacts" where "contacts"."id" = $1',
        }),
        [7],
      );
    });

    it('throws NotFoundException when no row was deleted', async () => {
      const { service, query } = setup();

      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "contacts" where "contacts"."id" = $1',
        }),
        [404],
      );
    });
  });
});
