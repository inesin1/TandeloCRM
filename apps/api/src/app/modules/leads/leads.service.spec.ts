import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contacts } from '../contacts/contact.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { leads } from './lead.entity';
import { LeadsService } from './leads.service';

const now = new Date('2026-09-17T12:00:00.000Z');
const lead: typeof leads.$inferSelect = {
  id: 7,
  name: 'Renewal',
  price: 200,
  source: 'Website',
  pipelineId: 2,
  statusId: 3,
  companyId: 4,
  ownerId: 5,
  customFields: { priority: 'high' },
  createdAt: now,
  updatedAt: now,
};
const contact: typeof contacts.$inferSelect = {
  id: 11,
  name: 'Alex',
  position: 'Manager',
  companyId: 4,
  email: 'alex@example.com',
  phone: null,
  ownerId: 5,
  customFields: {},
  createdAt: now,
  updatedAt: now,
};
const status = { id: 3, name: 'Qualified', color: '#123456' };
const company = { id: 4, name: 'Example' };
const owner = { id: 5, name: 'Owner', email: 'owner@example.com' };
const hydrated = { ...lead, status, company, owner, contacts: [contact] };
const dto: CreateLeadDto = {
  name: lead.name,
  price: lead.price,
  source: lead.source,
  pipelineId: lead.pipelineId,
  statusId: lead.statusId,
  companyId: lead.companyId,
  ownerId: lead.ownerId,
  customFields: lead.customFields,
  contactIds: [11, 12],
};
const columns =
  '"id", "name", "price", "source", "pipelineId", "statusId", "companyId", "ownerId", "customFields", "createdAt", "updatedAt"';
const selectSql =
  'select "leads"."id", "leads"."name", "leads"."price", "leads"."source", "leads"."pipelineId", "leads"."statusId", "leads"."companyId", "leads"."ownerId", "leads"."customFields", "leads"."createdAt", "leads"."updatedAt", "statuses"."id", "statuses"."name", "statuses"."color", "companies"."id", "companies"."name", "users"."id", "users"."name", "users"."email" from "leads" inner join "statuses" on ("leads"."statusId" = "statuses"."id" and "leads"."pipelineId" = "statuses"."pipelineId") left join "companies" on "leads"."companyId" = "companies"."id" left join "users" on "leads"."ownerId" = "users"."id"';
const contactSql =
  'select "lead_contacts"."leadId", "contacts"."id", "contacts"."name", "contacts"."position", "contacts"."companyId", "contacts"."email", "contacts"."phone", "contacts"."ownerId", "contacts"."customFields", "contacts"."createdAt", "contacts"."updatedAt" from "lead_contacts" inner join "contacts" on "lead_contacts"."contactId" = "contacts"."id"';
const idSql = `${selectSql} where "leads"."id" = $1`;
const linksSql =
  'insert into "lead_contacts" ("leadId", "contactId") values ($1, $2), ($3, $4)';
const clearSql =
  'delete from "lead_contacts" where "lead_contacts"."leadId" = $1';

function leadRow(value = lead): unknown[] {
  return [
    value.id,
    value.name,
    value.price,
    value.source,
    value.pipelineId,
    value.statusId,
    value.companyId,
    value.ownerId,
    value.customFields,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}
function joinedRow(value = lead): unknown[] {
  return [
    ...leadRow(value),
    status.id,
    status.name,
    status.color,
    value.companyId,
    value.companyId === null ? null : company.name,
    value.ownerId,
    value.ownerId === null ? null : owner.name,
    value.ownerId === null ? null : owner.email,
  ];
}
function contactRow(leadId = lead.id, value = contact): unknown[] {
  return [
    leadId,
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
function result(rows: unknown[][] = [], rowCount = rows.length) {
  return { command: '', oid: 0, fields: [], rows, rowCount };
}
function setup(...responses: (ReturnType<typeof result> | Error)[]) {
  const pool = new Pool();
  const queue = [...responses];
  const query = vi.spyOn(pool, 'query').mockImplementation(async () => {
    const response = queue.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error('Unexpected SQL query');
    return response;
  });
  const release = vi.fn();
  const client = Object.assign(new Client(), {
    query: pool.query.bind(pool),
    release,
  });
  const connect = vi
    .spyOn(pool, 'connect')
    .mockImplementation(async () => client);
  const db = drizzle(pool);
  const customFieldsService = new CustomFieldsService(db);
  const validate = vi
    .spyOn(customFieldsService, 'validate')
    .mockResolvedValue();
  return {
    service: new LeadsService(db, customFieldsService),
    query,
    validate,
    connect,
    release,
  };
}
function sqlCall(text: string, parameters: unknown[] = []) {
  return [expect.objectContaining({ text }), parameters];
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('LeadsService', () => {
  describe('findAll', () => {
    it('joins related records and groups contacts in one query for the entire list', async () => {
      const second = { ...lead, id: 8 };
      const third = { ...lead, id: 9, companyId: null, ownerId: null };
      const otherContact = { ...contact, id: 12 };
      const { service, query } = setup(
        result([joinedRow(), joinedRow(second), joinedRow(third)]),
        result([contactRow(), contactRow(8), contactRow(7, otherContact)]),
      );
      expect(await service.findAll()).toEqual([
        { ...hydrated, contacts: [contact, otherContact] },
        { ...hydrated, id: 8 },
        { ...third, status, company: null, owner: null, contacts: [] },
      ]);
      expect(query.mock.calls).toEqual([
        sqlCall(selectSql),
        sqlCall(
          `${contactSql} where "lead_contacts"."leadId" in ($1, $2, $3) order by "contacts"."id" asc`,
          [7, 8, 9],
        ),
      ]);
    });

    it('combines every filter with AND and binds search against the lead name', async () => {
      const { service, query } = setup(result());
      expect(
        await service.findAll({
          ownerId: 5,
          pipelineId: 2,
          statusId: 3,
          search: 'Renew',
        }),
      ).toEqual([]);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall(
          `${selectSql} where ("leads"."ownerId" = $1 and "leads"."pipelineId" = $2 and "leads"."statusId" = $3 and "leads"."name" ilike $4)`,
          [5, 2, 3, '%Renew%'],
        ),
      );
    });

    it.each([
      {
        filters: { ownerId: 0 },
        condition: '"leads"."ownerId" = $1',
        parameters: [0],
      },
      {
        filters: { pipelineId: 0 },
        condition: '"leads"."pipelineId" = $1',
        parameters: [0],
      },
      {
        filters: { statusId: 0 },
        condition: '"leads"."statusId" = $1',
        parameters: [0],
      },
      {
        filters: { search: '' },
        condition: '"leads"."name" ilike $1',
        parameters: ['%%'],
      },
    ])(
      'keeps explicitly supplied filter $filters',
      async ({ filters, condition, parameters }) => {
        const { service, query } = setup(result());
        await service.findAll(filters);
        expect(query).toHaveBeenCalledExactlyOnceWith(
          ...sqlCall(`${selectSql} where ${condition}`, parameters),
        );
      },
    );

    it('skips the contacts query for an empty list', async () => {
      const { service, query } = setup(result());
      expect(await service.findAll()).toEqual([]);
      expect(query).toHaveBeenCalledExactlyOnceWith(...sqlCall(selectSql));
    });
  });

  describe('findOne', () => {
    it('returns the same joined shape with contacts for a numeric id', async () => {
      const { service, query } = setup(
        result([joinedRow()]),
        result([contactRow()]),
      );
      expect(await service.findOne('7')).toEqual(hydrated);
      expect(query.mock.calls).toEqual([
        sqlCall(idSql, [7]),
        sqlCall(
          `${contactSql} where "lead_contacts"."leadId" in ($1) order by "contacts"."id" asc`,
          [7],
        ),
      ]);
    });

    it('throws 404 without loading contacts for a missing lead', async () => {
      const { service, query } = setup(result());
      await expect(service.findOne('404')).rejects.toThrow(
        new NotFoundException('Lead 404 not found'),
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(...sqlCall(idSql, [404]));
    });
  });

  describe('create', () => {
    it('validates custom fields and inserts the lead and all links in one transaction', async () => {
      const { service, query, validate, connect, release } = setup(
        result(),
        result([leadRow()]),
        result(),
        result([joinedRow()]),
        result([contactRow(), contactRow(7, { ...contact, id: 12 })]),
        result(),
      );
      expect(await service.create(dto)).toEqual({
        ...hydrated,
        contacts: [contact, { ...contact, id: 12 }],
      });
      expect(validate).toHaveBeenCalledExactlyOnceWith(
        'lead',
        lead.customFields,
      );
      expect(validate.mock.invocationCallOrder[0]).toBeLessThan(
        query.mock.invocationCallOrder[0],
      );
      expect(connect).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      expect(query.mock.calls).toEqual([
        sqlCall('begin'),
        sqlCall(
          `insert into "leads" (${columns}) values (default, $1, $2, $3, $4, $5, $6, $7, $8, default, default) returning ${columns}`,
          ['Renewal', 200, 'Website', 2, 3, 4, 5, '{"priority":"high"}'],
        ),
        sqlCall(linksSql, [7, 11, 7, 12]),
        sqlCall(idSql, [7]),
        sqlCall(
          `${contactSql} where "lead_contacts"."leadId" in ($1) order by "contacts"."id" asc`,
          [7],
        ),
        sqlCall('commit'),
      ]);
    });

    it.each([{ contactIds: undefined }, { contactIds: [] }])(
      'uses defaults and validates an empty payload with contactIds $contactIds',
      async ({ contactIds }) => {
        const record = {
          ...lead,
          price: 0,
          source: null,
          companyId: null,
          ownerId: null,
          customFields: {},
        };
        const { service, query, validate } = setup(
          result(),
          result([leadRow(record)]),
          result([joinedRow(record)]),
          result(),
          result(),
        );
        expect(
          await service.create({
            name: lead.name,
            pipelineId: 2,
            statusId: 3,
            contactIds,
          }),
        ).toEqual({
          ...record,
          status,
          company: null,
          owner: null,
          contacts: [],
        });
        expect(validate).toHaveBeenCalledExactlyOnceWith('lead', {});
        expect(query).toHaveBeenNthCalledWith(
          2,
          ...sqlCall(
            `insert into "leads" (${columns}) values (default, $1, default, default, $2, $3, default, default, default, default, default) returning ${columns}`,
            ['Renewal', 2, 3],
          ),
        );
        expect(query).toHaveBeenCalledTimes(5);
      },
    );

    it('rolls back the lead when inserting a contact link fails', async () => {
      const { service, query, release } = setup(
        result(),
        result([leadRow()]),
        new Error('contact FK'),
        result(),
      );
      await expect(service.create(dto)).rejects.toThrow();
      expect(query).toHaveBeenNthCalledWith(
        3,
        ...sqlCall(linksSql, [7, 11, 7, 12]),
      );
      expect(query).toHaveBeenLastCalledWith(...sqlCall('rollback'));
      expect(query).toHaveBeenCalledTimes(4);
      expect(release).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it.each<UpdateLeadDto>([{}, { name: undefined, customFields: undefined }])(
      'only reads the joined lead for empty DTO %j',
      async (payload) => {
        const { service, query, validate, connect } = setup(
          result([joinedRow()]),
          result([contactRow()]),
        );
        expect(await service.update('7', payload)).toEqual(hydrated);
        expect(query).toHaveBeenNthCalledWith(1, ...sqlCall(idSql, [7]));
        expect(query).toHaveBeenCalledTimes(2);
        expect(validate).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
      },
    );

    it('updates scalar fields and replaces contacts atomically', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const updated = {
        ...lead,
        name: 'Changed',
        price: 0,
        source: null,
        pipelineId: 6,
        statusId: 9,
        companyId: null,
        ownerId: null,
        customFields: {},
      };
      const { service, query, validate, release } = setup(
        result(),
        result([leadRow(updated)]),
        result(),
        result(),
        result([joinedRow(updated)]),
        result(),
        result(),
      );
      const payload: UpdateLeadDto = {
        name: 'Changed',
        price: 0,
        source: null,
        pipelineId: 6,
        statusId: 9,
        companyId: null,
        ownerId: null,
        customFields: {},
        contactIds: [11, 12],
      };
      await service.update('7', payload);
      expect(validate).toHaveBeenCalledExactlyOnceWith('lead', {});
      expect(query.mock.calls).toEqual([
        sqlCall('begin'),
        sqlCall(
          `update "leads" set "name" = $1, "price" = $2, "source" = $3, "pipelineId" = $4, "statusId" = $5, "companyId" = $6, "ownerId" = $7, "customFields" = $8, "updatedAt" = $9 where "leads"."id" = $10 returning ${columns}`,
          ['Changed', 0, null, 6, 9, null, null, '{}', now.toISOString(), 7],
        ),
        sqlCall(clearSql, [7]),
        sqlCall(linksSql, [7, 11, 7, 12]),
        sqlCall(idSql, [7]),
        sqlCall(
          `${contactSql} where "lead_contacts"."leadId" in ($1) order by "contacts"."id" asc`,
          [7],
        ),
        sqlCall('commit'),
      ]);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('clears contacts for an empty array and updates the lead before touching links', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const { service, query, validate } = setup(
        result(),
        result([leadRow()]),
        result(),
        result([joinedRow()]),
        result(),
        result(),
      );
      expect(await service.update('7', { contactIds: [] })).toEqual({
        ...hydrated,
        contacts: [],
      });
      expect(query).toHaveBeenNthCalledWith(
        2,
        ...sqlCall(
          `update "leads" set "updatedAt" = $1 where "leads"."id" = $2 returning ${columns}`,
          [now.toISOString(), 7],
        ),
      );
      expect(query).toHaveBeenNthCalledWith(3, ...sqlCall(clearSql, [7]));
      expect(query).toHaveBeenLastCalledWith(...sqlCall('commit'));
      expect(query).toHaveBeenCalledTimes(6);
      expect(validate).not.toHaveBeenCalled();
    });

    it('preserves contacts and skips validation when those fields are omitted', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const { service, query, validate } = setup(
        result(),
        result([leadRow()]),
        result([joinedRow()]),
        result([contactRow()]),
        result(),
      );
      expect(await service.update('7', { price: 0 })).toEqual(hydrated);
      expect(query).toHaveBeenNthCalledWith(
        2,
        ...sqlCall(
          `update "leads" set "price" = $1, "updatedAt" = $2 where "leads"."id" = $3 returning ${columns}`,
          [0, now.toISOString(), 7],
        ),
      );
      expect(query).toHaveBeenNthCalledWith(3, ...sqlCall(idSql, [7]));
      expect(query).toHaveBeenCalledTimes(5);
      expect(validate).not.toHaveBeenCalled();
    });

    it('rolls back both changed fields and removed links when replacement fails', async () => {
      const { service, query, release } = setup(
        result(),
        result([leadRow()]),
        result(),
        new Error('contact FK'),
        result(),
      );
      await expect(
        service.update('7', { name: 'Changed', contactIds: [11, 12] }),
      ).rejects.toThrow();
      expect(query).toHaveBeenNthCalledWith(3, ...sqlCall(clearSql, [7]));
      expect(query).toHaveBeenNthCalledWith(
        4,
        ...sqlCall(linksSql, [7, 11, 7, 12]),
      );
      expect(query).toHaveBeenLastCalledWith(...sqlCall('rollback'));
      expect(query).toHaveBeenCalledTimes(5);
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('throws 404 for an empty DTO targeting a missing lead', async () => {
      const { service, query } = setup(result());
      await expect(service.update('404', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(...sqlCall(idSql, [404]));
    });

    it('rolls back a missing lead update before changing links', async () => {
      const { service, query } = setup(result(), result(), result());
      await expect(service.update('404', { contactIds: [11] })).rejects.toThrow(
        new NotFoundException('Lead 404 not found'),
      );
      expect(query).toHaveBeenCalledTimes(3);
      expect(query).toHaveBeenLastCalledWith(...sqlCall('rollback'));
    });
  });

  it.each(['create', 'update'])(
    'propagates custom field validation errors before any %s write',
    async (operation) => {
      const { service, query, validate, connect } = setup();
      const error = new BadRequestException('Invalid custom field');
      validate.mockRejectedValue(error);
      await expect(
        operation === 'create'
          ? service.create(dto)
          : service.update('7', { customFields: { priority: 'invalid' } }),
      ).rejects.toThrow(error);
      expect(validate).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    },
  );

  describe('remove', () => {
    it('deletes only the lead and relies on cascading links', async () => {
      const { service, query } = setup(result([], 1));
      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall('delete from "leads" where "leads"."id" = $1', [7]),
      );
    });
    it('throws 404 when no lead was deleted', async () => {
      const { service, query } = setup(result());
      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        ...sqlCall('delete from "leads" where "leads"."id" = $1', [404]),
      );
    });
  });
});
