import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database, DatabaseExecutor } from '../database/database.module';
import { pipelines, statuses } from './pipeline.entity';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@Injectable()
export class PipelinesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  findCopilotStatus(pipelineId: number, statusId: number, executor: DatabaseExecutor = this.db) {
    return executor
      .select({ pipelineId: pipelines.id, pipelineName: pipelines.name, statusId: statuses.id, statusName: statuses.name, color: statuses.color })
      .from(pipelines)
      .innerJoin(statuses, eq(statuses.pipelineId, pipelines.id))
      .where(and(eq(pipelines.id, pipelineId), eq(statuses.id, statusId)))
      .limit(1);
  }

  findCopilotReferencePage(cursorId: number | null, limit: number) {
    return this.db
      .select({ id: statuses.id, name: statuses.name, color: statuses.color, pipelineId: pipelines.id, pipelineName: pipelines.name })
      .from(statuses)
      .innerJoin(pipelines, eq(statuses.pipelineId, pipelines.id))
      .where(cursorId ? lt(statuses.id, cursorId) : undefined)
      .orderBy(desc(statuses.id))
      .limit(limit);
  }

  async create(dto: CreatePipelineDto) {
    const [pipeline] = await this.db.insert(pipelines).values(dto).returning();
    return pipeline;
  }

  findAll() {
    return this.db
      .select()
      .from(pipelines)
      .orderBy(asc(pipelines.sortOrder), asc(pipelines.id));
  }

  async findOne(id: string) {
    const [pipeline] = await this.db
      .select()
      .from(pipelines)
      .where(eq(pipelines.id, Number(id)));
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${id} not found`);
    }
    return pipeline;
  }

  async update(id: string, dto: UpdatePipelineDto) {
    const pipelineId = Number(id);
    const [pipeline] = Object.keys(dto).length
      ? await this.db
          .update(pipelines)
          .set(dto)
          .where(eq(pipelines.id, pipelineId))
          .returning()
      : await this.db
          .select()
          .from(pipelines)
          .where(eq(pipelines.id, pipelineId));

    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${id} not found`);
    }
    return pipeline;
  }

  async remove(id: string) {
    const result = await this.db
      .delete(pipelines)
      .where(eq(pipelines.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Pipeline ${id} not found`);
    }
    return { deleted: true };
  }
}
