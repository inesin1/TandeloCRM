import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { leads } from '../leads/lead.entity';
import { pipelines, statuses } from '../pipelines/pipeline.entity';

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  getPipeline() {
    return this.db
      .select({
        pipelineId: pipelines.id,
        pipelineName: pipelines.name,
        statusId: statuses.id,
        statusName: statuses.name,
        statusColor: statuses.color,
        leadCount: count(leads.id).mapWith(Number),
        totalPrice: sql<number>`coalesce(sum(${leads.price}), 0)`.mapWith(
          Number,
        ),
      })
      .from(pipelines)
      .leftJoin(statuses, eq(statuses.pipelineId, pipelines.id))
      .leftJoin(
        leads,
        and(
          eq(leads.statusId, statuses.id),
          eq(leads.pipelineId, statuses.pipelineId),
        ),
      )
      .groupBy(pipelines.id, statuses.id)
      .orderBy(
        asc(pipelines.sortOrder),
        asc(pipelines.id),
        asc(statuses.sortOrder),
        asc(statuses.id),
      );
  }
}
