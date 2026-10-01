import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Plus } from '@primeicons/angular/plus';
import { PIcon } from '@primeicons/angular/p-icon';
import { Task, TaskInput, TaskType, TasksApi } from '../tasks-api';
import { LeadsApi } from '../../leads/leads-api';
import { UsersApi } from '../../settings/tabs/users-tab/users-api';
import { PageHeader } from '../../../shared/page-header';
import { UserChip } from '../../../shared/user-chip';

export interface TaskRow extends Task {
  icon: string;
  leadName: string;
  assigneeName: string;
  isOverdue: boolean;
}

@Component({
  templateUrl: './tasks-page.html',
  imports: [
    ButtonModule,
    InputTextModule,
    MessageModule,
    FormsModule,
    SelectModule,
    TableModule,
    TagModule,
    Plus,
    PIcon,
    DatePipe,
    PageHeader,
    UserChip,
  ],
})
export class TasksPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly tasksApi = inject(TasksApi);
  protected readonly tasks = this.tasksApi.tasks;
  protected readonly users = inject(UsersApi).users;
  protected readonly leads = inject(LeadsApi).leads;

  protected readonly assigneeFilter = signal<number | null>(null);
  protected readonly statusFilter = signal<boolean | null>(null);
  protected readonly selectedTasks = signal<TaskRow[]>([]);
  protected readonly showCreateForm = signal(false);
  protected readonly createError = signal('');
  protected readonly taskError = signal('');
  protected readonly isSavingTask = signal(false);
  protected readonly busyTaskId = signal<number | null>(null);
  protected readonly taskDraft = signal({
    leadId: null as number | null,
    type: 'call' as TaskType,
    text: '',
    dueAt: '',
    assigneeId: null as number | null,
  });

  protected readonly taskTypes: { label: string; value: TaskType }[] = [
    { label: 'Call', value: 'call' },
    { label: 'Email', value: 'email' },
    { label: 'Meeting', value: 'meeting' },
    { label: 'Document', value: 'document' },
  ];

  protected readonly statusOptions = [
    { label: 'Open', value: false },
    { label: 'Done', value: true },
  ];

  private readonly taskIcons = {
    call: 'phone',
    email: 'envelope',
    meeting: 'calendar',
    document: 'file',
  };

  protected readonly loadError = computed(
    () => this.tasks.error() ?? this.leads.error() ?? this.users.error(),
  );
  protected readonly isLoading = computed(
    () =>
      this.tasks.isLoading() ||
      this.leads.isLoading() ||
      this.users.isLoading(),
  );
  protected readonly canCreateTask = computed(() => {
    const draft = this.taskDraft();
    return (
      !this.isLoading() &&
      !this.loadError() &&
      !this.isSavingTask() &&
      draft.leadId !== null &&
      !!draft.text.trim() &&
      !!draft.dueAt &&
      !Number.isNaN(new Date(draft.dueAt).getTime())
    );
  });

  protected readonly rows = computed(() => {
    const assigneeId = this.assigneeFilter();
    const isCompleted = this.statusFilter();
    const now = Date.now();

    return this.tasks
      .value()
      .filter((task) => {
        if (assigneeId && task.assigneeId !== assigneeId) {
          return false;
        }

        if (isCompleted !== null && task.isCompleted !== isCompleted) {
          return false;
        }

        return true;
      })
      .map((task) => ({
        ...task,
        icon: this.taskIcons[task.type],
        leadName:
          this.leads.value().find((lead) => lead.id === task.leadId)?.name ??
          `id${task.leadId}`,
        assigneeName: task.assignee?.name ?? 'Unassigned',
        isOverdue: !task.isCompleted && new Date(task.dueAt).getTime() < now,
      }));
  });

  protected toggleCreateForm() {
    this.showCreateForm.update((visible) => !visible);
    this.createError.set('');
  }

  protected updateTaskDraft<K extends keyof ReturnType<typeof this.taskDraft>>(
    field: K,
    value: ReturnType<typeof this.taskDraft>[K],
  ) {
    this.taskDraft.update((draft) => ({ ...draft, [field]: value }));
    this.createError.set('');
  }

  protected retry() {
    this.tasks.reload();
    this.leads.reload();
    this.users.reload();
  }

  protected async createTask() {
    if (!this.canCreateTask()) return;
    const draft = this.taskDraft();
    if (draft.leadId === null) return;
    const dueAt = new Date(draft.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      this.createError.set('Choose a valid due date.');
      return;
    }

    const payload: TaskInput = {
      leadId: draft.leadId,
      type: draft.type,
      text: draft.text.trim(),
      dueAt: dueAt.toISOString(),
      assigneeId: draft.assigneeId,
    };
    this.isSavingTask.set(true);
    this.createError.set('');
    try {
      const created = await firstValueFrom(this.tasksApi.create(payload));
      if (this.destroyRef.destroyed) return;
      this.tasks.update((items) =>
        [...items, created].toSorted(
          (a, b) => a.dueAt.localeCompare(b.dueAt) || a.id - b.id,
        ),
      );
      this.taskDraft.set({
        leadId: null,
        type: 'call',
        text: '',
        dueAt: '',
        assigneeId: null,
      });
      this.showCreateForm.set(false);
    } catch {
      if (!this.destroyRef.destroyed)
        this.createError.set('Could not create the task. Please try again.');
    } finally {
      if (!this.destroyRef.destroyed) this.isSavingTask.set(false);
    }
  }

  protected async toggleTask(task: Task) {
    if (this.busyTaskId() !== null) return;
    this.busyTaskId.set(task.id);
    this.taskError.set('');
    try {
      const updated = await firstValueFrom(
        this.tasksApi.setCompleted(task.id, !task.isCompleted),
      );
      if (this.destroyRef.destroyed) return;
      this.tasks.update((items) =>
        items.map((item) => (item.id === task.id ? updated : item)),
      );
    } catch {
      if (!this.destroyRef.destroyed)
        this.taskError.set('Could not update the task. Please try again.');
    } finally {
      if (!this.destroyRef.destroyed) this.busyTaskId.set(null);
    }
  }
}
