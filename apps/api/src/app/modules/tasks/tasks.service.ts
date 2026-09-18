import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { Database, DATABASE_CONNECTION } from '../database/database.module';
import { users } from '../users/user.entity';
import { tasks } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksDto } from './dto/find-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateTaskDto) {
    const [task] = await this.db.insert(tasks).values(dto).returning();
    return this.findOne(String(task.id));
  }

  findAll(filters: FindTasksDto = {}) {
    return this.selectTasks()
      .where(
        and(
          filters.leadId !== undefined
            ? eq(tasks.leadId, filters.leadId)
            : undefined,
          filters.assigneeId !== undefined
            ? eq(tasks.assigneeId, filters.assigneeId)
            : undefined,
          filters.isCompleted !== undefined
            ? eq(tasks.isCompleted, filters.isCompleted)
            : undefined,
        ),
      )
      .orderBy(asc(tasks.dueAt), asc(tasks.id));
  }

  async findOne(id: string) {
    const [task] = await this.selectTasks().where(eq(tasks.id, Number(id)));
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      return this.findOne(id);
    }
    const [task] = await this.db
      .update(tasks)
      .set(dto)
      .where(eq(tasks.id, Number(id)))
      .returning();
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.db.delete(tasks).where(eq(tasks.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return { deleted: true };
  }

  private selectTasks() {
    return this.db
      .select({
        ...getTableColumns(tasks),
        assignee: { id: users.id, name: users.name, email: users.email },
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id));
  }
}
