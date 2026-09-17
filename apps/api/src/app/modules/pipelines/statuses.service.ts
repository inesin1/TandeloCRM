import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { statuses } from './pipeline.entity';
import { PipelinesService } from './pipelines.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class StatusesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly pipelinesService: PipelinesService,
  ) {}

  async create(pipelineId: string, dto: CreateStatusDto) {
    await this.pipelinesService.findOne(pipelineId);
    const [status] = await this.db
      .insert(statuses)
      .values({ ...dto, pipelineId: Number(pipelineId) })
      .returning();
    return status;
  }

  async findAll(pipelineId: string) {
    await this.pipelinesService.findOne(pipelineId);
    return this.db
      .select()
      .from(statuses)
      .where(eq(statuses.pipelineId, Number(pipelineId)))
      .orderBy(asc(statuses.sortOrder), asc(statuses.id));
  }

  async findOne(pipelineId: string, id: string) {
    const [status] = await this.db
      .select()
      .from(statuses)
      .where(
        and(
          eq(statuses.id, Number(id)),
          eq(statuses.pipelineId, Number(pipelineId)),
        ),
      );
    if (!status) {
      throw new NotFoundException(
        `Status ${id} in pipeline ${pipelineId} not found`,
      );
    }
    return status;
  }

  async update(pipelineId: string, id: string, dto: UpdateStatusDto) {
    const where = and(
      eq(statuses.id, Number(id)),
      eq(statuses.pipelineId, Number(pipelineId)),
    );
    const [status] = Object.keys(dto).length
      ? await this.db.update(statuses).set(dto).where(where).returning()
      : await this.db.select().from(statuses).where(where);

    if (!status) {
      throw new NotFoundException(
        `Status ${id} in pipeline ${pipelineId} not found`,
      );
    }
    return status;
  }

  async remove(pipelineId: string, id: string) {
    const result = await this.db
      .delete(statuses)
      .where(
        and(
          eq(statuses.id, Number(id)),
          eq(statuses.pipelineId, Number(pipelineId)),
        ),
      );
    if (!result.rowCount) {
      throw new NotFoundException(
        `Status ${id} in pipeline ${pipelineId} not found`,
      );
    }
    return { deleted: true };
  }
}
