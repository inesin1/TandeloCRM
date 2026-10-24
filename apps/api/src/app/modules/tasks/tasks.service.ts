import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, getTableColumns, gte, lt, lte } from 'drizzle-orm';
import { Database, DATABASE_CONNECTION, DatabaseExecutor } from '../database/database.module';
import { users } from '../users/user.entity';
import { tasks } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { FindTasksDto } from './dto/find-tasks.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  findCopilotPage(
    filters: { leadId: number | null; assigneeId: number; completion: string | null; dueStatus: string | null; dueFrom: Date | null; dueTo: Date | null },
    cursorId: number | null,
    limit: number,
    now: Date,
  ) {
    return this.db
      .select({ id: tasks.id, leadId: tasks.leadId, type: tasks.type, text: tasks.text, dueAt: tasks.dueAt, isCompleted: tasks.isCompleted, assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(and(
        filters.leadId === null ? undefined : eq(tasks.leadId, filters.leadId),
        eq(tasks.assigneeId, filters.assigneeId),
        filters.completion === 'open' ? eq(tasks.isCompleted, false) : filters.completion === 'completed' ? eq(tasks.isCompleted, true) : undefined,
        filters.dueStatus === 'overdue' ? and(eq(tasks.isCompleted, false), lt(tasks.dueAt, now)) : filters.dueStatus === 'upcoming' ? and(eq(tasks.isCompleted, false), gte(tasks.dueAt, now)) : undefined,
        filters.dueFrom ? gte(tasks.dueAt, filters.dueFrom) : undefined,
        filters.dueTo ? lte(tasks.dueAt, filters.dueTo) : undefined,
        cursorId ? lt(tasks.id, cursorId) : undefined,
      ))
      .orderBy(desc(tasks.id))
      .limit(limit);
  }

  findCopilotRecord(id: number, executor: DatabaseExecutor = this.db, forUpdate = false) {
    const query = executor
      .select({ id: tasks.id, leadId: tasks.leadId, type: tasks.type, text: tasks.text, dueAt: tasks.dueAt, isCompleted: tasks.isCompleted, assigneeId: tasks.assigneeId })
      .from(tasks)
      .where(eq(tasks.id, id));
    return (forUpdate ? query.for('update') : query).limit(1);
  }

  async create(dto: CreateTaskDto, executor: DatabaseExecutor = this.db) {
    const [task] = await executor.insert(tasks).values(dto).returning();
    return this.findOne(String(task.id), executor);
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

  async findOne(id: string, executor: DatabaseExecutor = this.db) {
    const [task] = await executor
      .select({ ...getTableColumns(tasks), assignee: { id: users.id, name: users.name, email: users.email } })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.id, Number(id)));
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, executor: DatabaseExecutor = this.db) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      return this.findOne(id, executor);
    }
    const [task] = await executor
      .update(tasks)
      .set(dto)
      .where(eq(tasks.id, Number(id)))
      .returning();
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return this.findOne(id, executor);
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
