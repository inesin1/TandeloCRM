import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateStatusDto } from './dto/create-status.dto';
import type { UpdateStatusDto } from './dto/update-status.dto';
import { statuses } from './pipeline.entity';
import { PipelinesService } from './pipelines.service';
import { StatusesService } from './statuses.service';

const status: typeof statuses.$inferSelect = {
  id: 42,
  pipelineId: 7,
  name: 'New',
  color: '#123456',
  sortOrder: 2,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const columns =
  '"id", "pipelineId", "name", "color", "sortOrder", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "statuses"`;
const scope = '("statuses"."id" = $1 and "statuses"."pipelineId" = $2)';
const parentSql =
  'select "id", "name", "sortOrder", "createdAt", "updatedAt" from "pipelines" where "pipelines"."id" = $1';

function toRow(value: typeof statuses.$inferSelect): unknown[] {
  return [
    value.id,
    value.pipelineId,
    value.name,
    value.color,
    value.sortOrder,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof statuses.$inferSelect)[] = [],
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
  const service = new StatusesService(db, new PipelinesService(db));
  return { service, query };
}

const parentResult = {
  command: 'SELECT',
  oid: 0,
  fields: [],
  rows: [[7, 'Sales', 0, '2026-09-01 10:00:00.000', '2026-09-02 10:00:00.000']],
  rowCount: 1,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StatusesService', () => {
  describe('findAll', () => {
    it.each([{ records: [] }, { records: [status, { ...status, id: 43 }] }])(
      'returns stages only from the requested pipeline in sortOrder: %j',
      async ({ records }) => {
        const { service, query } = setup(records);
        query.mockImplementationOnce(async () => parentResult);

        expect(await service.findAll('7')).toEqual(records);
        expect(query).toHaveBeenCalledTimes(2);
        expect(query).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ text: parentSql }),
          [7],
        );
        expect(query).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            text: `${selectSql} where "statuses"."pipelineId" = $1 order by "statuses"."sortOrder" asc, "statuses"."id" asc`,
          }),
          [7],
        );
      },
    );

    it('throws NotFoundException instead of listing stages for a missing pipeline', async () => {
      const { service, query } = setup();

      await expect(service.findAll('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: parentSql }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('checks the parent and inserts the stage with the pipeline from the path', async () => {
      const dto: CreateStatusDto = {
        name: 'New',
        color: '#123456',
        sortOrder: 2,
      };
      const { service, query } = setup([status]);
      query.mockImplementationOnce(async () => parentResult);

      expect(await service.create('7', dto)).toEqual(status);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ text: parentSql }),
        [7],
      );
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: `insert into "statuses" (${columns}) values (default, $1, $2, $3, $4, default, default) returning ${columns}`,
        }),
        [7, 'New', '#123456', 2],
      );
    });

    it('uses the database default for omitted sortOrder', async () => {
      const record = { ...status, sortOrder: 0 };
      const { service, query } = setup([record]);
      query.mockImplementationOnce(async () => parentResult);

      expect(
        await service.create('7', { name: 'New', color: '#123456' }),
      ).toEqual(record);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          text: `insert into "statuses" (${columns}) values (default, $1, $2, $3, default, default, default) returning ${columns}`,
        }),
        [7, 'New', '#123456'],
      );
    });

    it('does not insert a stage when its pipeline is missing', async () => {
      const { service, query } = setup();

      await expect(
        service.create('404', { name: 'New', color: '#123456' }),
      ).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: parentSql }),
        [404],
      );
    });
  });

  describe('findOne', () => {
    it('selects by both numeric stage and pipeline ids', async () => {
      const { service, query } = setup([status]);

      expect(await service.findOne('7', '42')).toEqual(status);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} where ${scope}` }),
        [42, 7],
      );
    });

    it('throws NotFoundException when the stage does not belong to the pipeline', async () => {
      const { service, query } = setup();

      await expect(service.findOne('8', '42')).rejects.toThrow(
        NotFoundException,
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} where ${scope}` }),
        [42, 8],
      );
    });
  });

  describe('update', () => {
    it('only selects within the pipeline when the DTO is empty', async () => {
      const { service, query } = setup([status]);

      expect(await service.update('7', '42', {})).toEqual(status);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ text: `${selectSql} where ${scope}` }),
        [42, 7],
      );
    });

    it('updates the scoped stage including color and zero sortOrder', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdateStatusDto = {
        name: 'Won',
        color: '#00ff00',
        sortOrder: 0,
      };
      const updated = { ...status, ...dto, updatedAt: now };
      const { service, query } = setup([updated]);

      expect(await service.update('7', '42', dto)).toEqual(updated);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "statuses" set "name" = $1, "color" = $2, "sortOrder" = $3, "updatedAt" = $4 where ("statuses"."id" = $5 and "statuses"."pipelineId" = $6) returning ${columns}`,
        }),
        ['Won', '#00ff00', 0, now.toISOString(), 42, 7],
      );
    });

    it.each<UpdateStatusDto>([{}, { name: 'Missing' }])(
      'throws NotFoundException for a missing scoped stage with DTO %j',
      async (dto) => {
        vi.useFakeTimers();
        const now = new Date('2026-09-17T12:00:00.000Z');
        vi.setSystemTime(now);
        const { service, query } = setup();

        await expect(service.update('8', '42', dto)).rejects.toThrow(
          NotFoundException,
        );
        expect(query).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            text: Object.keys(dto).length
              ? `update "statuses" set "name" = $1, "updatedAt" = $2 where ("statuses"."id" = $3 and "statuses"."pipelineId" = $4) returning ${columns}`
              : `${selectSql} where ${scope}`,
          }),
          Object.keys(dto).length
            ? ['Missing', now.toISOString(), 42, 8]
            : [42, 8],
        );
      },
    );
  });

  describe('remove', () => {
    it('deletes only the stage belonging to the requested pipeline', async () => {
      const { service, query } = setup([], 1);

      expect(await service.remove('7', '42')).toEqual({ deleted: true });
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `delete from "statuses" where ${scope}`,
        }),
        [42, 7],
      );
    });

    it('throws NotFoundException when no stage in this pipeline was deleted', async () => {
      const { service, query } = setup();

      await expect(service.remove('8', '42')).rejects.toThrow(
        NotFoundException,
      );
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `delete from "statuses" where ${scope}`,
        }),
        [42, 8],
      );
    });
  });
});
