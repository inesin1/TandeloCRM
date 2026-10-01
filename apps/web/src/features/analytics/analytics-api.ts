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

@Service()
export class AnalyticsApi {
  private readonly authApi = inject(AuthApi);

  readonly pipeline = httpResource<PipelineAnalyticsRow[]>(
    () =>
      this.authApi.isAuthenticated() ? '/api/analytics/pipeline' : undefined,
    { defaultValue: [] },
  );
}
