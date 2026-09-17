import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { customFieldDefinitions } from './custom-field.entity';

describe('custom field schema', () => {
  it('makes the key unique within its entity type', () => {
    const { uniqueConstraints } = getTableConfig(customFieldDefinitions);
    expect(uniqueConstraints).toHaveLength(1);
    expect(uniqueConstraints[0].columns.map((column) => column.name)).toEqual([
      'entityType',
      'key',
    ]);
  });

  it('stores nullable JSONB options and defaults required and ordering', () => {
    expect(customFieldDefinitions.options.getSQLType()).toBe('jsonb');
    expect(customFieldDefinitions.options.notNull).toBe(false);
    expect(customFieldDefinitions.isRequired.default).toBe(false);
    expect(customFieldDefinitions.sortOrder.default).toBe(0);
  });
});
