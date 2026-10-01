import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthApi } from '../../auth/auth-api';
import { PipelinesApi } from '../../leads/pipelines-api';
import {
  AnalyticsApi,
  TaskAnalyticsReport,
  TaskAnalyticsRow,
  TeamAnalyticsRow,
} from '../analytics-api';

type AnalyticsTab = 'pipeline' | 'team' | 'tasks';
type TeamPeriod = '7' | '30' | '90' | 'all';

const EMPTY_TASK_REPORT: TaskAnalyticsReport = {
  summary: {
    totalCount: 0,
    openCount: 0,
    completedCount: 0,
    overdueCount: 0,
    dueNextWeekCount: 0,
  },
  byAssignee: [],
  byType: [],
  overdueTasks: [],
  upcomingTasks: [],
};

@Component({
  templateUrl: './analytics-page.html',
  imports: [DatePipe, RouterLink],
})
export class AnalyticsPage {
  private readonly analyticsApi = inject(AnalyticsApi);
  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute, { optional: true });

  protected readonly activeTab =
    (this.route?.snapshot.data['report'] as AnalyticsTab | undefined) ??
    'pipeline';
  protected readonly selectedTeamPeriod = signal<TeamPeriod>('30');
  protected readonly pipelines = this.pipelinesApi.pipelines;
  protected readonly selectedPipeline = this.pipelinesApi.selectedPipeline;
  protected readonly pipeline = this.analyticsApi.pipeline;
  protected readonly selectedPipelineId = computed(() =>
    String(this.selectedPipeline()?.id ?? ''),
  );
  protected readonly teamReport = httpResource<TeamAnalyticsRow[]>(
    () =>
      this.authApi.isAuthenticated() && this.activeTab === 'team'
        ? `/api/analytics/team?days=${this.selectedTeamPeriod()}`
        : undefined,
    { defaultValue: [] },
  );
  protected readonly taskReport = httpResource<TaskAnalyticsReport>(
    () =>
      this.authApi.isAuthenticated() && this.activeTab === 'tasks'
        ? '/api/analytics/tasks'
        : undefined,
    { defaultValue: EMPTY_TASK_REPORT },
  );
  protected readonly loadError = computed(() => {
    switch (this.activeTab) {
      case 'pipeline':
        return this.pipelines.error() ?? this.pipeline.error();
      case 'team':
        return this.teamReport.error();
      case 'tasks':
        return this.taskReport.error();
    }
  });
  protected readonly isLoading = computed(() => {
    switch (this.activeTab) {
      case 'pipeline':
        return this.pipelines.isLoading() || this.pipeline.isLoading();
      case 'team':
        return this.teamReport.isLoading();
      case 'tasks':
        return this.taskReport.isLoading();
    }
  });
  protected readonly stages = computed(() => {
    const pipelineId = this.selectedPipeline()?.id;
    if (pipelineId === undefined) return [];

    return this.pipeline
      .value()
      .filter((row) => row.pipelineId === pipelineId && row.statusId !== null)
      .map((row) => ({
        ...row,
        statusName: row.statusName ?? 'Unknown stage',
        statusColor: row.statusColor ?? '#94a3b8',
        totalPriceLabel: this.priceFormat.format(row.totalPrice),
      }));
  });
  protected readonly pipelineTotals = computed(() => {
    const stages = this.stages();
    return {
      leadCount: stages.reduce((total, stage) => total + stage.leadCount, 0),
      totalPriceLabel: this.priceFormat.format(
        stages.reduce((total, stage) => total + stage.totalPrice, 0),
      ),
    };
  });
  protected readonly hasLeads = computed(() =>
    this.stages().some((stage) => stage.leadCount > 0),
  );
  protected readonly teamTotals = computed(() => {
    const rows = this.teamReport.value();
    return {
      leadCount: rows.reduce((total, row) => total + row.leadCount, 0),
      totalPrice: rows.reduce((total, row) => total + row.totalPrice, 0),
      unassignedCount: rows
        .filter((row) => row.ownerId === null)
        .reduce((total, row) => total + row.leadCount, 0),
    };
  });
  protected readonly teamRows = computed(() => {
    const rows = this.teamReport.value();
    const totalCount = this.teamTotals().leadCount;
    return rows.map((row) => ({
      ...row,
      ownerLabel: row.ownerName ?? 'Unassigned',
      totalPriceLabel: this.priceFormat.format(row.totalPrice),
      sharePercent:
        totalCount === 0 ? 0 : Math.round((row.leadCount / totalCount) * 100),
    }));
  });
  protected readonly taskTypes = {
    call: 'Calls',
    email: 'Emails',
    meeting: 'Meetings',
    document: 'Documents',
  } satisfies Record<TaskAnalyticsRow['type'], string>;

  private readonly priceFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  private readonly numberFormat = new Intl.NumberFormat('en-US');

  protected selectPipeline(event: Event) {
    const pipelineId = Number((event.target as HTMLSelectElement).value);
    this.selectedPipeline.set(
      this.pipelines.value().find((pipeline) => pipeline.id === pipelineId),
    );
  }

  protected selectTeamPeriod(event: Event) {
    this.selectedTeamPeriod.set(
      (event.target as HTMLSelectElement).value as TeamPeriod,
    );
  }

  protected refresh() {
    switch (this.activeTab) {
      case 'pipeline':
        this.pipelines.reload();
        this.pipeline.reload();
        break;
      case 'team':
        this.teamReport.reload();
        break;
      case 'tasks':
        this.taskReport.reload();
        break;
    }
  }

  protected formatPrice(value: number) {
    return this.priceFormat.format(value);
  }

  protected formatNumber(value: number) {
    return this.numberFormat.format(value);
  }
}
