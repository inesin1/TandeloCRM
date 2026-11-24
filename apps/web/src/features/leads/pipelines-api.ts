import { inject, linkedSignal, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';

export interface Pipeline {
  id: number;
  name: string;
  sortOrder?: number;
}

export type StageOutcome = 'open' | 'won' | 'lost';

export interface Status {
  id: number;
  pipelineId: number;
  name: string;
  color: string;
  sortOrder?: number;
  outcome?: StageOutcome;
}

export type PipelineInput = Pick<Pipeline, 'name' | 'sortOrder'>;
export type StageInput = Pick<
  Status,
  'name' | 'color' | 'sortOrder' | 'outcome'
>;

@Service()
export class PipelinesApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  readonly pipelines = httpResource<Pipeline[]>(
    () => (this.authApi.isAuthenticated() ? '/api/pipelines' : undefined),
    { defaultValue: [] },
  );

  readonly selectedPipeline = linkedSignal<Pipeline[], Pipeline | undefined>({
    source: () => (this.pipelines.hasValue() ? this.pipelines.value() : []),
    computation: (pipelines, previous) =>
      pipelines.find((pipeline) => pipeline.id === previous?.value?.id) ??
      pipelines[0],
  });

  readonly statuses = httpResource<Status[]>(
    () => {
      const id = this.selectedPipeline()?.id;
      return id === undefined ? undefined : `/api/pipelines/${id}/statuses`;
    },
    { defaultValue: [] },
  );
  createPipeline(input: PipelineInput) {
    return this.http.post<Pipeline>('/api/pipelines', input);
  }

  updatePipeline(id: number, input: PipelineInput) {
    return this.http.put<Pipeline>(`/api/pipelines/${id}`, input);
  }

  removePipeline(id: number) {
    return this.http.delete(`/api/pipelines/${id}`);
  }

  createStage(pipelineId: number, input: StageInput) {
    return this.http.post<Status>(
      `/api/pipelines/${pipelineId}/statuses`,
      input,
    );
  }

  updateStage(pipelineId: number, id: number, input: StageInput) {
    return this.http.put<Status>(
      `/api/pipelines/${pipelineId}/statuses/${id}`,
      input,
    );
  }

  removeStage(pipelineId: number, id: number) {
    return this.http.delete(`/api/pipelines/${pipelineId}/statuses/${id}`);
  }
}
