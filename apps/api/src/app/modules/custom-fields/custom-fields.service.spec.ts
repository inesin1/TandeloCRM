import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  customFieldDefinitions,
  CustomFieldType,
} from './custom-field.entity';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { CustomFieldsService } from './custom-fields.service';

const definition: typeof customFieldDefinitions.$inferSelect = {
  id: 7,
  entityType: 'lead',
  key: 'priority',
  label: 'Priority',
  type: 'select',
  options: ['low', 'high'],
  isRequired: false,
  sortOrder: 2,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const columns =
  '"id", "entityType", "key", "label", "type", "options", "isRequired", "sortOrder", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "custom_field_definitions"`;
const orderSql =
  'order by "custom_field_definitions"."sortOrder" asc, "custom_field_definitions"."id" asc';
const idSql = `${selectSql} where "custom_field_definitions"."id" = $1`;

function toRow(value: typeof customFieldDefinitions.$inferSelect): unknown[] {
  return [
    value.id,
    value.entityType,
    value.key,
    value.label,
    value.type,
    value.options,
    value.isRequired,
    value.sortOrder,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function result(
  records: (typeof customFieldDefinitions.$inferSelect)[],
  rowCount = records.length,
) {
  return {
    command: '',
    oid: 0,
    fields: [],
    rows: records.map(toRow),
    rowCount,
  };
}

function setup(
  records: (typeof customFieldDefinitions.$inferSelect)[] = [],
  rowCount = records.length,
) {
  const pool = new Pool();
  const query = vi
    .spyOn(pool, 'query')
    .mockImplementation(async () => result(records, rowCount));
  const service = new CustomFieldsService(drizzle(pool));
  return { service, query };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CustomFieldsService', () => {
  describe('findAll', () => {
    it('returns all definitions ordered by sortOrder and id', async () => {
      const records: (typeof customFieldDefinitions.$inferSelect)[] = [
        definition,
        { ...definition, id: 8, entityType: 'company' },
      ];
      const { service, query } = setup(records);
      expect(await service.findAll()).toEqual(records);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} ${orderSql}` }),
        [],
      );
    });

    it.each(CUSTOM_FIELD_ENTITY_TYPES)(
      'filters definitions for %s in SQL',
      async (entityType) => {
        const record = { ...definition, entityType };
        const { service, query } = setup([record]);
        expect(await service.findAll(entityType)).toEqual([record]);
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            text: `${selectSql} where "custom_field_definitions"."entityType" = $1 ${orderSql}`,
          }),
          [entityType],
        );
      },
    );
  });

  describe('findOne', () => {
    it('selects the numeric id', async () => {
      const { service, query } = setup([definition]);
      expect(await service.findOne('7')).toEqual(definition);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: idSql }),
        [7],
      );
    });

    it('rejects a missing definition', async () => {
      const { service, query } = setup();
      await expect(service.findOne('404')).rejects.toThrow(
        new NotFoundException('Custom field 404 not found'),
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: idSql }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('inserts select options as JSON and returns generated fields', async () => {
      const dto: CreateCustomFieldDto = {
        entityType: 'lead',
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: ['low', 'high'],
        isRequired: false,
        sortOrder: 2,
      };
      const { service, query } = setup([definition]);
      expect(await service.create(dto)).toEqual(definition);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "custom_field_definitions" (${columns}) values (default, $1, $2, $3, $4, $5, $6, $7, default, default) returning ${columns}`,
        }),
        ['lead', 'priority', 'Priority', 'select', '["low","high"]', false, 2],
      );
    });

    it('uses database defaults and null options for other types', async () => {
      const record: typeof customFieldDefinitions.$inferSelect = {
        ...definition,
        type: 'text',
        options: null,
        sortOrder: 0,
      };
      const { service, query } = setup([record]);
      expect(
        await service.create({
          entityType: 'lead',
          key: 'priority',
          label: 'Priority',
          type: 'text',
        }),
      ).toEqual(record);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "custom_field_definitions" (${columns}) values (default, $1, $2, $3, $4, $5, default, default, default, default) returning ${columns}`,
        }),
        ['lead', 'priority', 'Priority', 'text', null],
      );
    });

    it.each<Pick<CreateCustomFieldDto, 'type' | 'options'>>([
      { type: 'select' },
      { type: 'select', options: null },
      { type: 'select', options: [] },
      { type: 'select', options: [' '] },
      { type: 'select', options: ['low', 'low'] },
      { type: 'text', options: ['low'] },
    ])('rejects inconsistent options %j before inserting', async (fields) => {
      const { service, query } = setup();
      await expect(
        service.create({
          entityType: 'lead',
          key: 'priority',
          label: 'Priority',
          ...fields,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('only selects for an empty DTO', async () => {
      const { service, query } = setup([definition]);
      expect(await service.update('7', {})).toEqual(definition);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: idSql }),
        [7],
      );
    });

    it('merges options with the existing type and preserves false and zero', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdateCustomFieldDto = {
        label: 'Urgency',
        options: ['normal', 'urgent'],
        isRequired: false,
        sortOrder: 0,
      };
      const updated = { ...definition, ...dto, updatedAt: now };
      const { service, query } = setup([updated]);
      query.mockImplementationOnce(async () => result([definition]));
      expect(await service.update('7', dto)).toEqual(updated);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ text: idSql }),
        [7],
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: `update "custom_field_definitions" set "label" = $1, "options" = $2, "isRequired" = $3, "sortOrder" = $4, "updatedAt" = $5 where "custom_field_definitions"."id" = $6 returning ${columns}`,
        }),
        ['Urgency', '["normal","urgent"]', false, 0, now.toISOString(), 7],
      );
    });

    it('clears old options when changing from select to text', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const updated: typeof customFieldDefinitions.$inferSelect = {
        ...definition,
        type: 'text',
        options: null,
        updatedAt: now,
      };
      const { service, query } = setup([updated]);
      query.mockImplementationOnce(async () => result([definition]));
      expect(await service.update('7', { type: 'text' })).toEqual(updated);
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: `update "custom_field_definitions" set "type" = $1, "options" = $2, "updatedAt" = $3 where "custom_field_definitions"."id" = $4 returning ${columns}`,
        }),
        ['text', null, now.toISOString(), 7],
      );
    });

    it('retains select options when only the label changes', async () => {
      const { service, query } = setup([definition]);
      await service.update('7', { label: 'Urgency' });
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: expect.stringContaining('"options" = $2'),
        }),
        ['Urgency', '["low","high"]', expect.any(String), 7],
      );
    });

    it.each<UpdateCustomFieldDto>([
      { options: null },
      { options: [] },
      { type: 'text', options: ['low'] },
    ])('rejects inconsistent merged options %j', async (dto) => {
      const { service, query } = setup([definition]);
      await expect(service.update('7', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('requires options when changing text to select', async () => {
      const { service, query } = setup([
        { ...definition, type: 'text', options: null },
      ]);
      await expect(service.update('7', { type: 'select' })).rejects.toThrow(
        BadRequestException,
      );
      expect(query).toHaveBeenCalledTimes(1);
    });

    it.each<UpdateCustomFieldDto>([{}, { label: 'Missing' }])(
      'rejects a missing definition with %j',
      async (dto) => {
        const { service } = setup();
        await expect(service.update('404', dto)).rejects.toThrow(
          NotFoundException,
        );
      },
    );

    it('rejects a definition deleted between select and update', async () => {
      const { service, query } = setup();
      query.mockImplementationOnce(async () => result([definition]));
      await expect(service.update('7', { label: 'Urgency' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes only the definition and reports success', async () => {
      const { service, query } = setup([], 1);
      expect(await service.remove('7')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "custom_field_definitions" where "custom_field_definitions"."id" = $1',
        }),
        [7],
      );
    });

    it('rejects a missing definition', async () => {
      const { service } = setup();
      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validate', () => {
    it.each(CUSTOM_FIELD_ENTITY_TYPES)(
      'validates every type with a single query scoped to %s',
      async (entityType) => {
        const records: (typeof customFieldDefinitions.$inferSelect)[] = [
          {
            ...definition,
            entityType,
            key: 'note',
            type: 'text',
            options: null,
            isRequired: true,
          },
          {
            ...definition,
            entityType,
            key: 'amount',
            type: 'number',
            options: null,
            isRequired: true,
          },
          {
            ...definition,
            entityType,
            key: 'due',
            type: 'date',
            options: null,
            isRequired: true,
          },
          {
            ...definition,
            entityType,
            key: 'active',
            type: 'boolean',
            options: null,
            isRequired: true,
          },
          { ...definition, entityType, isRequired: true },
        ];
        const { service, query } = setup(records);
        await expect(
          service.validate(entityType, {
            note: 'Test',
            amount: 0,
            due: '2024-02-29',
            active: false,
            priority: 'low',
          }),
        ).resolves.toBeUndefined();
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            text: `${selectSql} where "custom_field_definitions"."entityType" = $1 ${orderSql}`,
          }),
          [entityType],
        );
      },
    );

    it.each(['missing', 'toString', '__proto__'])(
      'rejects unknown key %s',
      async (key) => {
        const { service } = setup([definition]);
        await expect(
          service.validate('lead', { [key]: 'value' }),
        ).rejects.toThrow(
          new BadRequestException(`Unknown custom field "${key}" for lead`),
        );
      },
    );

    it('rejects a key with no definition for the requested entity', async () => {
      const { service, query } = setup();
      await expect(
        service.validate('contact', { priority: 'low' }),
      ).rejects.toThrow('Unknown custom field "priority" for contact');
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: expect.stringContaining('"entityType" = $1'),
        }),
        ['contact'],
      );
    });

    it.each<{ type: CustomFieldType; value: unknown }>([
      { type: 'text', value: 42 },
      { type: 'text', value: false },
      { type: 'text', value: {} },
      { type: 'text', value: [] },
      { type: 'text', value: null },
      { type: 'number', value: '42' },
      { type: 'number', value: true },
      { type: 'number', value: NaN },
      { type: 'number', value: Infinity },
      { type: 'number', value: -Infinity },
      { type: 'boolean', value: 'false' },
      { type: 'boolean', value: 0 },
      { type: 'date', value: 'tomorrow' },
      { type: 'date', value: '2026-02-29' },
      { type: 'date', value: '2026-04-31' },
      { type: 'date', value: '2026-13-01' },
      { type: 'date', value: 123 },
      { type: 'date', value: new Date() },
      { type: 'date', value: '2026-09-01T25:00:00Z' },
    ])(
      'rejects invalid $type value $value without coercion',
      async ({ type, value }) => {
        const { service } = setup([{ ...definition, type, options: null }]);
        await expect(
          service.validate('lead', { priority: value }),
        ).rejects.toThrow(
          new BadRequestException(
            `Custom field "priority" must have type ${type}`,
          ),
        );
      },
    );

    it.each(
      ['other', 'LOW', 1, true, ['low'], null].map((value) => ({ value })),
    )('rejects select value outside options: $value', async ({ value }) => {
      const { service } = setup([definition]);
      await expect(
        service.validate('lead', { priority: value }),
      ).rejects.toThrow(
        new BadRequestException(
          'Custom field "priority" must be one of its options: low, high',
        ),
      );
    });

    it('rejects a missing required field', async () => {
      const { service } = setup([{ ...definition, isRequired: true }]);
      await expect(service.validate('lead', {})).rejects.toThrow(
        new BadRequestException('Custom field "priority" is required'),
      );
    });

    it.each<unknown>([null, undefined, '', '  \t\n'])(
      'rejects empty required value %j',
      async (value) => {
        const { service } = setup([
          { ...definition, type: 'text', options: null, isRequired: true },
        ]);
        await expect(
          service.validate('lead', { priority: value }),
        ).rejects.toThrow(
          new BadRequestException(
            'Custom field "priority" is required and must not be empty',
          ),
        );
      },
    );

    it.each<{ type: CustomFieldType; value: unknown }>([
      { type: 'text', value: '' },
      { type: 'number', value: -1.25 },
      { type: 'boolean', value: true },
      { type: 'date', value: '2026-09-17T12:30:00Z' },
      { type: 'date', value: '2026-09-17T12:30:00+04:00' },
    ])('accepts valid optional $type value $value', async ({ type, value }) => {
      const { service } = setup([{ ...definition, type, options: null }]);
      await expect(
        service.validate('lead', { priority: value }),
      ).resolves.toBeUndefined();
    });

    it('allows omitted optional fields', async () => {
      const { service } = setup([definition]);
      await expect(service.validate('lead', {})).resolves.toBeUndefined();
    });

    it('accepts an empty object when no definitions exist', async () => {
      const { service } = setup();
      await expect(service.validate('lead', {})).resolves.toBeUndefined();
    });

    it.each(
      [null, undefined, [], 'text', 1, false, new Date()].map((payload) => ({
        payload,
      })),
    )(
      'rejects non-object payload $payload before querying',
      async ({ payload }) => {
        const { service, query } = setup();
        await expect(service.validate('lead', payload)).rejects.toThrow(
          new BadRequestException('customFields must be an object'),
        );
        expect(query).not.toHaveBeenCalled();
      },
    );
  });
});
