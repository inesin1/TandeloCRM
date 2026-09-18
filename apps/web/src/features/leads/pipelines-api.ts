import { inject, linkedSignal, Service } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Pipeline {
  id: number;
  name: string;
}

export interface Status {
  id: number;
  pipelineId: number;
  name: string;
  color: string;
}

@Service()
export class PipelinesApi {
  private readonly authApi = inject(AuthApi);

  readonly pipelines = httpResource<Pipeline[]>(
    () => (this.authApi.isAuthenticated() ? '/api/pipelines' : undefined),
    { defaultValue: [] },
  );

  readonly selectedPipeline = linkedSignal(() => this.pipelines.value().at(0));

  readonly statuses = httpResource<Status[]>(
    () => {
      const id = this.selectedPipeline()?.id;
      return id === undefined ? undefined : `/api/pipelines/${id}/statuses`;
    },
    { defaultValue: [] },
  );
}
