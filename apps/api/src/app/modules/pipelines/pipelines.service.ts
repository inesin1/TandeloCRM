import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { pipelines } from './pipeline.entity';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdatePipelineDto } from './dto/update-pipeline.dto';

@Injectable()
export class PipelinesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

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
