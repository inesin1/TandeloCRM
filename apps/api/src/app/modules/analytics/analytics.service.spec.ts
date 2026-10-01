import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';

function setup(rows: unknown[][] = []) {
  const pool = new Pool();
  const query = vi.spyOn(pool, 'query').mockResolvedValue({
    command: 'SELECT',
    oid: 0,
    fields: [],
    rows,
    rowCount: rows.length,
  });
  return { service: new AnalyticsService(drizzle(pool)), query };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnalyticsService', () => {
  it('aggregates lead count and price by pipeline and status, including empty statuses', async () => {
    const rows = [
      [7, 'Sales', 11, 'New', '#111111', 2, 1250],
      [7, 'Sales', 12, 'Won', '#222222', 0, 0],
    ];
    const { service, query } = setup(rows);

    expect(await service.getPipeline()).toEqual([
      {
        pipelineId: 7,
        pipelineName: 'Sales',
        statusId: 11,
        statusName: 'New',
        statusColor: '#111111',
        leadCount: 2,
        totalPrice: 1250,
      },
      {
        pipelineId: 7,
        pipelineName: 'Sales',
        statusId: 12,
        statusName: 'Won',
        statusColor: '#222222',
        leadCount: 0,
        totalPrice: 0,
      },
    ]);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'left join "statuses" on "statuses"."pipelineId" = "pipelines"."id"',
        ),
      }),
      [],
    );
    expect(query.mock.calls[0][0].text).toContain(
      'left join "leads" on ("leads"."statusId" = "statuses"."id" and "leads"."pipelineId" = "statuses"."pipelineId")',
    );
    expect(query.mock.calls[0][0].text).toContain(
      'group by "pipelines"."id", "statuses"."id"',
    );
  });

  it('returns no rows when no pipelines exist', async () => {
    const { service } = setup();

    expect(await service.getPipeline()).toEqual([]);
  });
});
