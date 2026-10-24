import { Inject, Injectable } from '@nestjs/common';
import { SQL, and, asc, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { leads } from '../leads/lead.entity';
import { tasks } from '../tasks/task.entity';
import { users } from '../users/user.entity';
import { pipelines, statuses } from '../pipelines/pipeline.entity';

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getCopilotReport(
    report: 'pipeline' | 'team' | 'tasks',
    days: number | undefined,
    now: Date,
    offset: number,
    limit: number,
    includeUsers: boolean,
  ) {
    if (report === 'pipeline') {
      const rows = await this.db
        .select({
          id: statuses.id,
          label: sql<string>`concat(${pipelines.name}, ' / ', ${statuses.name})`,
          pipelineId: pipelines.id,
          statusId: statuses.id,
          leadCount: count(leads.id).mapWith(Number),
          totalPrice: sql<number>`coalesce(sum(${leads.price}), 0)`.mapWith(Number),
          pipelineOrder: pipelines.sortOrder,
          statusOrder: statuses.sortOrder,
        })
        .from(pipelines)
        .innerJoin(statuses, eq(statuses.pipelineId, pipelines.id))
        .leftJoin(
          leads,
          and(
            eq(leads.statusId, statuses.id),
            eq(leads.pipelineId, statuses.pipelineId),
          ),
        )
        .groupBy(pipelines.id, statuses.id)
        .orderBy(asc(pipelines.sortOrder), asc(statuses.sortOrder), asc(statuses.id))
        .limit(limit + 1)
        .offset(offset);
      return { records: rows.map(({ pipelineOrder: _p, statusOrder: _s, ...row }) => row), hasMore: rows.length > limit };
    }
    if (report === 'team') {
      const createdAfter = days ? new Date(now.getTime() - days * 86_400_000) : undefined;
      if (!includeUsers) {
        const [row] = await this.db
          .select({
            id: sql<string>`'team-summary'`,
            label: sql<string>`'Team summary'`,
            leadCount: count(leads.id).mapWith(Number),
            totalPrice: sql<number>`coalesce(sum(${leads.price}), 0)`.mapWith(Number),
          })
          .from(leads)
          .where(createdAfter ? gte(leads.createdAt, createdAfter) : undefined);
        return { records: offset === 0 ? [row] : [], hasMore: false };
      }
      const base = this.db
        .select({
          id: users.id,
          ownerId: users.id,
          leadCount: count(leads.id).mapWith(Number),
          totalPrice: sql<number>`coalesce(sum(${leads.price}), 0)`.mapWith(Number),
          ownerName: users.name,
        })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.ownerId))
        .where(createdAfter ? gte(leads.createdAt, createdAfter) : undefined)
        .groupBy(users.id, users.name)
        .orderBy(desc(count(leads.id)), asc(users.name), asc(users.id))
        .limit(limit + 1)
        .offset(offset);
      const rows = await base;
      return {
        records: rows.map(({ ownerName, ...row }) => ({ ...row, ownerName })),
        hasMore: rows.length > limit,
      };
    }
    const [summary] = await this.db
      .select({
        id: sql<string>`'task-summary'`,
        label: sql<string>`'Task summary'`,
        totalCount: count(tasks.id).mapWith(Number),
        openCount: sql<number>`count(*) filter (where not ${tasks.isCompleted})`.mapWith(Number),
        completedCount: sql<number>`count(*) filter (where ${tasks.isCompleted})`.mapWith(Number),
        overdueCount: sql<number>`count(*) filter (where not ${tasks.isCompleted} and ${tasks.dueAt} < ${now})`.mapWith(Number),
      })
      .from(tasks);
    const types = await this.db
      .select({ id: tasks.type, label: tasks.type, totalCount: count(tasks.id).mapWith(Number) })
      .from(tasks)
      .groupBy(tasks.type)
      .orderBy(asc(tasks.type))
      .limit(limit + 1)
      .offset(offset);
    return {
      summary,
      records: types,
      hasMore: types.length > limit,
    };
  }

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

  getTeam(days?: number) {
    const createdAfter = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;

    return this.db
      .select({
        ownerId: users.id,
        ownerName: users.name,
        leadCount: count(leads.id).mapWith(Number),
        totalPrice: sql<number>`coalesce(sum(${leads.price}), 0)`.mapWith(
          Number,
        ),
      })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.ownerId))
      .where(createdAfter ? gte(leads.createdAt, createdAfter) : undefined)
      .groupBy(users.id, users.name)
      .orderBy(desc(count(leads.id)), asc(users.name));
  }

  async getTasks() {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [summaryRows, byAssignee, byType, overdueTasks, upcomingTasks] =
      await Promise.all([
        this.db
          .select({
            totalCount: count(tasks.id).mapWith(Number),
            openCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted})`.mapWith(
                Number,
              ),
            completedCount:
              sql<number>`count(*) filter (where ${tasks.isCompleted})`.mapWith(
                Number,
              ),
            overdueCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted} and ${tasks.dueAt} < ${now})`.mapWith(
                Number,
              ),
            dueNextWeekCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted} and ${tasks.dueAt} >= ${now} and ${tasks.dueAt} <= ${nextWeek})`.mapWith(
                Number,
              ),
          })
          .from(tasks),
        this.db
          .select({
            assigneeId: tasks.assigneeId,
            assigneeName: users.name,
            totalCount: count(tasks.id).mapWith(Number),
            openCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted})`.mapWith(
                Number,
              ),
            completedCount:
              sql<number>`count(*) filter (where ${tasks.isCompleted})`.mapWith(
                Number,
              ),
            overdueCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted} and ${tasks.dueAt} < ${now})`.mapWith(
                Number,
              ),
          })
          .from(tasks)
          .leftJoin(users, eq(users.id, tasks.assigneeId))
          .groupBy(tasks.assigneeId, users.id, users.name)
          .orderBy(desc(count(tasks.id)), asc(users.name)),
        this.db
          .select({
            type: tasks.type,
            totalCount: count(tasks.id).mapWith(Number),
            openCount:
              sql<number>`count(*) filter (where not ${tasks.isCompleted})`.mapWith(
                Number,
              ),
            completedCount:
              sql<number>`count(*) filter (where ${tasks.isCompleted})`.mapWith(
                Number,
              ),
          })
          .from(tasks)
          .groupBy(tasks.type)
          .orderBy(desc(count(tasks.id))),
        this.selectTaskPreview(lt(tasks.dueAt, now)),
        this.selectTaskPreview(
          and(gte(tasks.dueAt, now), lte(tasks.dueAt, nextWeek)),
        ),
      ]);

    return {
      summary: summaryRows[0] ?? {
        totalCount: 0,
        openCount: 0,
        completedCount: 0,
        overdueCount: 0,
        dueNextWeekCount: 0,
      },
      byAssignee,
      byType,
      overdueTasks,
      upcomingTasks,
    };
  }

  private selectTaskPreview(dueAtFilter: SQL | undefined) {
    return this.db
      .select({
        id: tasks.id,
        leadId: leads.id,
        leadName: leads.name,
        type: tasks.type,
        text: tasks.text,
        dueAt: tasks.dueAt,
        assigneeId: users.id,
        assigneeName: users.name,
      })
      .from(tasks)
      .innerJoin(leads, eq(leads.id, tasks.leadId))
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.isCompleted, false), dueAtFilter))
      .orderBy(asc(tasks.dueAt), asc(tasks.id))
      .limit(10);
  }
}
