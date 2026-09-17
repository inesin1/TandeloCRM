import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { companies } from '../companies/company.entity';
import { contacts } from '../contacts/contact.entity';
import { statuses } from '../pipelines/pipeline.entity';
import { users } from '../users/user.entity';
import { leadContacts, leads } from './lead.entity';

describe('lead schema', () => {
  it('enforces the status and pipeline pair with one composite foreign key', () => {
    const { foreignKeys } = getTableConfig(leads);
    const statusKey = foreignKeys.find(
      (key) => key.reference().foreignTable === statuses,
    );
    expect(leads.statusId.notNull).toBe(true);
    expect(leads.pipelineId.notNull).toBe(true);
    expect(statusKey?.reference().columns.map((column) => column.name)).toEqual(
      ['statusId', 'pipelineId'],
    );
    expect(statusKey?.reference().foreignColumns).toEqual([
      statuses.id,
      statuses.pipelineId,
    ]);
    expect(statusKey?.onDelete).toBe('no action');
    expect(leads.customFields.notNull).toBe(true);
    expect(leads.customFields.default).toEqual({});
  });

  it.each([
    { column: leads.companyId, target: companies.id },
    { column: leads.ownerId, target: users.id },
  ])(
    'sets optional reference $column.name to null on deletion',
    ({ column, target }) => {
      const key = getTableConfig(leads).foreignKeys.find((key) =>
        key.reference().columns.includes(column),
      );
      expect(column.notNull).toBe(false);
      expect(key?.reference().foreignColumns).toEqual([target]);
      expect(key?.onDelete).toBe('set null');
    },
  );

  it('makes contact links unique and cascades deletion from either side', () => {
    const { primaryKeys, foreignKeys } = getTableConfig(leadContacts);
    expect(primaryKeys).toHaveLength(1);
    expect(primaryKeys[0].columns.map((column) => column.name)).toEqual([
      'leadId',
      'contactId',
    ]);
    expect(
      foreignKeys.map((key) => ({
        columns: key.reference().columns,
        targets: key.reference().foreignColumns,
        onDelete: key.onDelete,
      })),
    ).toEqual([
      {
        columns: [leadContacts.leadId],
        targets: [leads.id],
        onDelete: 'cascade',
      },
      {
        columns: [leadContacts.contactId],
        targets: [contacts.id],
        onDelete: 'cascade',
      },
    ]);
  });
});
