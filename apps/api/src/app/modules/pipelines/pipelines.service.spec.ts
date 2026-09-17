import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatePipelineDto } from './dto/create-pipeline.dto';
import type { UpdatePipelineDto } from './dto/update-pipeline.dto';
import { pipelines } from './pipeline.entity';
import { PipelinesService } from './pipelines.service';

const pipeline: typeof pipelines.$inferSelect = {
  id: 7,
  name: 'Sales',
  sortOrder: 2,
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  updatedAt: new Date('2026-09-02T10:00:00.000Z'),
};
const columns = '"id", "name", "sortOrder", "createdAt", "updatedAt"';
const selectSql = `select ${columns} from "pipelines"`;

function toRow(value: typeof pipelines.$inferSelect): unknown[] {
  return [
    value.id,
    value.name,
    value.sortOrder,
    value.createdAt.toISOString().replace('T', ' ').slice(0, -1),
    value.updatedAt.toISOString().replace('T', ' ').slice(0, -1),
  ];
}

function setup(
  records: (typeof pipelines.$inferSelect)[] = [],
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
  const service = new PipelinesService(drizzle(pool));
  return { service, query };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PipelinesService', () => {
  describe('findAll', () => {
    it('returns all pipelines ordered by sortOrder and id', async () => {
      const records = [pipeline, { ...pipeline, id: 8 }];
      const { service, query } = setup(records);

      expect(await service.findAll()).toEqual(records);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} order by "pipelines"."sortOrder" asc, "pipelines"."id" asc`,
        }),
        [],
      );
    });
  });

  describe('findOne', () => {
    it('selects the numeric id and returns the pipeline', async () => {
      const { service, query } = setup([pipeline]);

      expect(await service.findOne('7')).toEqual(pipeline);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "pipelines"."id" = $1`,
        }),
        [7],
      );
    });

    it('throws NotFoundException for a missing pipeline', async () => {
      const { service, query } = setup();

      await expect(service.findOne('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "pipelines"."id" = $1`,
        }),
        [404],
      );
    });
  });

  describe('create', () => {
    it('inserts the DTO and returns generated fields', async () => {
      const dto: CreatePipelineDto = { name: pipeline.name, sortOrder: 2 };
      const { service, query } = setup([pipeline]);

      expect(await service.create(dto)).toEqual(pipeline);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "pipelines" (${columns}) values (default, $1, $2, default, default) returning ${columns}`,
        }),
        ['Sales', 2],
      );
    });

    it('uses the database default when sortOrder is omitted', async () => {
      const record = { ...pipeline, sortOrder: 0 };
      const { service, query } = setup([record]);

      expect(await service.create({ name: 'Sales' })).toEqual(record);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `insert into "pipelines" (${columns}) values (default, $1, default, default, default) returning ${columns}`,
        }),
        ['Sales'],
      );
    });
  });

  describe('update', () => {
    it('only selects the existing pipeline for an empty DTO', async () => {
      const { service, query } = setup([pipeline]);

      expect(await service.update('7', {})).toEqual(pipeline);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `${selectSql} where "pipelines"."id" = $1`,
        }),
        [7],
      );
    });

    it('updates the requested pipeline including zero sortOrder', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-09-17T12:00:00.000Z');
      vi.setSystemTime(now);
      const dto: UpdatePipelineDto = { name: 'Renewals', sortOrder: 0 };
      const updated = { ...pipeline, ...dto, updatedAt: now };
      const { service, query } = setup([updated]);

      expect(await service.update('7', dto)).toEqual(updated);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: `update "pipelines" set "name" = $1, "sortOrder" = $2, "updatedAt" = $3 where "pipelines"."id" = $4 returning ${columns}`,
        }),
        ['Renewals', 0, now.toISOString(), 7],
      );
    });

    it.each<UpdatePipelineDto>([{}, { name: 'Missing' }])(
      'throws NotFoundException for a missing pipeline with DTO %j',
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
          text: 'delete from "pipelines" where "pipelines"."id" = $1',
        }),
        [7],
      );
    });

    it('throws NotFoundException when no row was deleted', async () => {
      const { service, query } = setup();

      await expect(service.remove('404')).rejects.toThrow(NotFoundException);
      expect(query).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          text: 'delete from "pipelines" where "pipelines"."id" = $1',
        }),
        [404],
      );
    });
  });
});
