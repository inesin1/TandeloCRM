import { httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { AuthApi } from '../auth/auth-api';

export interface PipelineAnalyticsRow {
  pipelineId: number;
  pipelineName: string;
  statusId: number | null;
  statusName: string | null;
  statusColor: string | null;
  leadCount: number;
  totalPrice: number;
}

export interface TeamAnalyticsRow {
  ownerId: number | null;
  ownerName: string | null;
  leadCount: number;
  totalPrice: number;
}

export interface TaskAnalyticsRow {
  id: number;
  leadId: number;
  leadName: string;
  type: 'call' | 'email' | 'meeting' | 'document';
  text: string;
  dueAt: string;
  assigneeId: number | null;
  assigneeName: string | null;
}

export interface TaskAnalyticsBreakdown {
  totalCount: number;
  openCount: number;
  completedCount: number;
  overdueCount: number;
}

export interface TaskAnalyticsReport {
  summary: TaskAnalyticsBreakdown & { dueNextWeekCount: number };
  byAssignee: (TaskAnalyticsBreakdown & {
    assigneeId: number | null;
    assigneeName: string | null;
  })[];
  byType: (Omit<TaskAnalyticsBreakdown, 'overdueCount'> & {
    type: TaskAnalyticsRow['type'];
  })[];
  overdueTasks: TaskAnalyticsRow[];
  upcomingTasks: TaskAnalyticsRow[];
}

@Service()
export class AnalyticsApi {
  private readonly authApi = inject(AuthApi);

  readonly pipeline = httpResource<PipelineAnalyticsRow[]>(
    () =>
      this.authApi.isAuthenticated() ? '/api/analytics/pipeline' : undefined,
    { defaultValue: [] },
  );
}
