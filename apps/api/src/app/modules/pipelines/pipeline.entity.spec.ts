import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { pipelines, statuses } from './pipeline.entity';

describe('pipeline schema', () => {
  it('exposes the composite unique key required by the leads foreign key', () => {
    const { uniqueConstraints } = getTableConfig(statuses);
    const key = uniqueConstraints.find(
      (constraint) => constraint.name === 'statuses_id_pipeline_key',
    );

    expect(key?.columns.map((column) => column.name)).toEqual([
      'id',
      'pipelineId',
    ]);
  });

  it('cascades pipeline deletion to its required stages', () => {
    const { foreignKeys } = getTableConfig(statuses);

    expect(statuses.pipelineId.notNull).toBe(true);
    expect(foreignKeys).toHaveLength(1);
    expect(foreignKeys[0].onDelete).toBe('cascade');
    expect(foreignKeys[0].reference().columns).toEqual([statuses.pipelineId]);
    expect(foreignKeys[0].reference().foreignColumns).toEqual([pipelines.id]);
  });
});
