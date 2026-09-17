import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCustomFieldDto } from './create-custom-field.dto';
import { UpdateCustomFieldDto } from './update-custom-field.dto';
import { FindCustomFieldsDto } from './find-custom-fields.dto';

const valid = {
  entityType: 'lead',
  key: 'priority',
  label: 'Priority',
  type: 'select',
  options: ['low', 'high'],
};

describe('custom field DTOs', () => {
  it('accepts a complete definition', async () => {
    expect(
      await validate(plainToInstance(CreateCustomFieldDto, valid)),
    ).toEqual([]);
  });

  it.each([
    { entityType: 'task' },
    { entityType: null },
    { type: 'object' },
    { key: '' },
    { key: '  ' },
    { label: false },
    { label: ' ' },
    { options: 'low' },
    { options: [] },
    { options: [1] },
    { options: [' '] },
    { options: ['low', 'low'] },
    { isRequired: 'true' },
    { isRequired: null },
    { sortOrder: 1.5 },
    { sortOrder: null },
  ])(
    'rejects invalid properties on create and update: %j',
    async (properties) => {
      expect(
        await validate(
          plainToInstance(CreateCustomFieldDto, { ...valid, ...properties }),
        ),
      ).not.toHaveLength(0);
      expect(
        await validate(plainToInstance(UpdateCustomFieldDto, properties)),
      ).not.toHaveLength(0);
    },
  );

  it('requires the mandatory properties on create', async () => {
    const errors = await validate(new CreateCustomFieldDto());
    expect(errors.map((error) => error.property).sort()).toEqual([
      'entityType',
      'key',
      'label',
      'type',
    ]);
  });

  it('makes all properties optional on update', async () => {
    expect(await validate(new UpdateCustomFieldDto())).toEqual([]);
    expect(
      await validate(
        plainToInstance(UpdateCustomFieldDto, { label: 'Urgency' }),
      ),
    ).toEqual([]);
  });

  it('accepts false, zero and null options for a non-select definition', async () => {
    expect(
      await validate(
        plainToInstance(CreateCustomFieldDto, {
          ...valid,
          type: 'text',
          options: null,
          isRequired: false,
          sortOrder: 0,
        }),
      ),
    ).toEqual([]);
  });

  it.each([
    {},
    { entityType: 'lead' },
    { entityType: 'company' },
    { entityType: 'contact' },
  ])('accepts list filter %j', async (properties) => {
    expect(
      await validate(plainToInstance(FindCustomFieldsDto, properties)),
    ).toEqual([]);
  });

  it.each([
    { entityType: 'task' },
    { entityType: '' },
    { entityType: ['lead'] },
    { entityType: null },
  ])('rejects invalid list filter %j', async (properties) => {
    expect(
      await validate(plainToInstance(FindCustomFieldsDto, properties)),
    ).not.toHaveLength(0);
  });
});
