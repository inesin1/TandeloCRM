import { Component, computed, inject } from '@angular/core';
import { PageHeader } from '../../../shared/page-header';
import { AnalyticsApi } from '../analytics-api';
import { PipelinesApi } from '../../leads/pipelines-api';

@Component({
  templateUrl: './analytics-page.html',
  imports: [PageHeader],
})
export class AnalyticsPage {
  private readonly analyticsApi = inject(AnalyticsApi);
  private readonly pipelinesApi = inject(PipelinesApi);

  protected readonly pipelines = this.pipelinesApi.pipelines;
  protected readonly selectedPipeline = this.pipelinesApi.selectedPipeline;
  protected readonly pipeline = this.analyticsApi.pipeline;
  protected readonly selectedPipelineId = computed(() =>
    String(this.selectedPipeline()?.id ?? ''),
  );
  protected readonly loadError = computed(
    () => this.pipelines.error() ?? this.pipeline.error(),
  );
  protected readonly isLoading = computed(
    () => this.pipelines.isLoading() || this.pipeline.isLoading(),
  );
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
  protected readonly totals = computed(() => {
    const stages = this.stages();
    const leadCount = stages.reduce(
      (total, stage) => total + stage.leadCount,
      0,
    );
    const totalPrice = stages.reduce(
      (total, stage) => total + stage.totalPrice,
      0,
    );

    return {
      leadCount,
      totalPriceLabel: this.priceFormat.format(totalPrice),
    };
  });
  protected readonly hasLeads = computed(() =>
    this.stages().some((stage) => stage.leadCount > 0),
  );

  private readonly priceFormat = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  protected selectPipeline(event: Event) {
    const pipelineId = Number((event.target as HTMLSelectElement).value);
    this.selectedPipeline.set(
      this.pipelines.value().find((pipeline) => pipeline.id === pipelineId),
    );
  }
}
