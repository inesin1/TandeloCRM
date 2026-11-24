import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthApi } from '../../../auth/auth-api';
import {
  Pipeline,
  PipelinesApi,
  StageOutcome,
  Status,
} from '../../../leads/pipelines-api';

interface PipelineDraft {
  name: string;
  sortOrder: number;
}

interface StageDraft {
  name: string;
  color: string;
  sortOrder: number;
  outcome: StageOutcome;
}

const EMPTY_PIPELINE: PipelineDraft = { name: '', sortOrder: 0 };
const EMPTY_STAGE: StageDraft = {
  name: '',
  color: '#2563eb',
  sortOrder: 0,
  outcome: 'open',
};

@Component({
  selector: 'app-pipelines-tab',
  templateUrl: './pipelines-tab.html',
  host: { class: 'block' },
  imports: [
    ButtonModule,
    FormsModule,
    InputTextModule,
    MessageModule,
    NgTemplateOutlet,
  ],
})
export class PipelinesTab {
  private readonly api = inject(PipelinesApi);
  private readonly auth = inject(AuthApi);

  protected readonly pipelines = this.api.pipelines;
  protected readonly selectedPipeline = this.api.selectedPipeline;
  protected readonly stages = this.api.statuses;
  protected readonly canManage = computed(() =>
    this.auth.hasPermission('pipelines:write'),
  );
  protected readonly editingStageId = signal<number | 'new' | null>(null);
  protected readonly pipelineDraft = linkedSignal<PipelineDraft>(() => {
    const pipeline = this.selectedPipeline();
    return pipeline
      ? { name: pipeline.name, sortOrder: pipeline.sortOrder ?? 0 }
      : EMPTY_PIPELINE;
  });
  protected readonly creatingPipeline = signal(false);
  protected readonly stageDraft = signal<StageDraft>(EMPTY_STAGE);
  protected readonly error = signal('');
  protected readonly saving = signal(false);

  protected selectPipeline(pipeline: Pipeline) {
    this.creatingPipeline.set(false);
    this.error.set('');
    this.api.selectedPipeline.set(pipeline);
    this.pipelineDraft.set({
      name: pipeline.name,
      sortOrder: pipeline.sortOrder ?? 0,
    });
    this.cancelStageEdit();
  }

  protected updatePipelineDraft(
    field: keyof PipelineDraft,
    value: string | number,
  ) {
    this.pipelineDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected async savePipeline(event: Event) {
    event.preventDefault();
    const name = this.pipelineDraft().name.trim();
    if (!this.canManage() || !name || this.saving()) return;

    this.saving.set(true);
    this.error.set('');
    try {
      const selected = this.selectedPipeline();
      if (selected) {
        await firstValueFrom(
          this.api.updatePipeline(selected.id, {
            name,
            sortOrder: this.pipelineDraft().sortOrder,
          }),
        );
        this.api.pipelines.reload();
        this.error.set('Pipeline saved.');
      } else {
        const pipeline = await firstValueFrom(
          this.api.createPipeline({
            name,
            sortOrder: this.pipelineDraft().sortOrder,
          }),
        );
        this.api.pipelines.reload();
        this.api.selectedPipeline.set(pipeline);
        this.creatingPipeline.set(false);
        this.pipelineDraft.set({
          name: pipeline.name,
          sortOrder: pipeline.sortOrder ?? 0,
        });
        this.error.set(
          'Pipeline created. Add its first stage to start creating leads.',
        );
      }
    } catch (cause) {
      this.error.set(
        this.messageFor(cause, 'Could not save the pipeline. Try again.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected startCreatePipeline() {
    this.creatingPipeline.set(true);
    this.api.selectedPipeline.set(undefined);
    this.pipelineDraft.set({
      ...EMPTY_PIPELINE,
      sortOrder: this.pipelines.value().length,
    });
    this.cancelStageEdit();
    this.error.set('');
  }

  protected async deletePipeline(pipeline: Pipeline) {
    if (
      !this.canManage() ||
      this.saving() ||
      !window.confirm(
        `Delete “${pipeline.name}”? This removes its stages and cannot be undone.`,
      )
    )
      return;

    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.removePipeline(pipeline.id));
      this.api.selectedPipeline.set(undefined);
      this.creatingPipeline.set(false);
      this.pipelineDraft.set({ ...EMPTY_PIPELINE, sortOrder: 0 });
      this.api.pipelines.reload();
      this.api.statuses.reload();
      this.error.set('Pipeline deleted.');
    } catch (cause) {
      this.error.set(
        this.messageFor(
          cause,
          'Could not delete the pipeline. Reassign or remove its leads, then try again.',
        ),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected updateStageDraft(field: keyof StageDraft, value: string | number) {
    this.stageDraft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected editStage(stage: Status) {
    this.editingStageId.set(stage.id);
    this.stageDraft.set({
      name: stage.name,
      color: stage.color,
      sortOrder: stage.sortOrder ?? 0,
      outcome: stage.outcome ?? 'open',
    });
    this.error.set('');
  }

  protected startAddStage() {
    const stages = this.stages.hasValue() ? this.stages.value() : [];
    this.stageDraft.set({
      ...EMPTY_STAGE,
      sortOrder: (stages.at(-1)?.sortOrder ?? 0) + 10,
    });
    this.editingStageId.set('new');
    this.error.set('');
  }

  protected cancelStageEdit() {
    this.editingStageId.set(null);
  }

  protected async saveStage(event: Event) {
    event.preventDefault();
    const pipeline = this.selectedPipeline();
    const draft = this.stageDraft();
    const name = draft.name.trim();
    const stageId = this.editingStageId();
    if (
      !this.canManage() ||
      !pipeline ||
      !name ||
      stageId === null ||
      this.saving()
    )
      return;

    this.saving.set(true);
    this.error.set('');
    try {
      const input = { ...draft, name };
      if (stageId === 'new') {
        await firstValueFrom(this.api.createStage(pipeline.id, input));
      } else {
        await firstValueFrom(this.api.updateStage(pipeline.id, stageId, input));
      }
      this.api.statuses.reload();
      this.cancelStageEdit();
      this.error.set(stageId === 'new' ? 'Stage created.' : 'Stage saved.');
    } catch (cause) {
      this.error.set(
        this.messageFor(cause, 'Could not save the stage. Try again.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteStage(stage: Status) {
    const pipeline = this.selectedPipeline();
    if (!pipeline || !this.canManage() || this.saving()) return;
    if (
      !window.confirm(
        `Delete the “${stage.name}” stage? Reassign its leads first.`,
      )
    )
      return;

    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.removeStage(pipeline.id, stage.id));
      this.api.statuses.reload();
      if (this.editingStageId() === stage.id) this.cancelStageEdit();
      this.error.set('Stage deleted.');
    } catch (cause) {
      this.error.set(
        this.messageFor(
          cause,
          'Could not delete the stage. Reassign its leads to another stage, then try again.',
        ),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected outcomeLabel(outcome: StageOutcome | undefined) {
    switch (outcome ?? 'open') {
      case 'won':
        return 'Won';
      case 'lost':
        return 'Lost';
      default:
        return 'Open';
    }
  }

  protected retry() {
    this.pipelines.reload();
    this.stages.reload();
  }

  private messageFor(error: unknown, fallback: string) {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      return 'This pipeline or stage still has leads. Reassign those leads, then try again.';
    }
    return error instanceof HttpErrorResponse &&
      typeof error.error?.message === 'string'
      ? error.error.message
      : fallback;
  }
}
