import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Plus } from '@primeicons/angular/plus';
import { PIcon } from '@primeicons/angular/p-icon';
import { Task, TasksApi } from '../tasks-api';
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
  protected readonly tasks = inject(TasksApi).tasks;
  protected readonly users = inject(UsersApi).users;
  private readonly leads = inject(LeadsApi).leads;

  protected readonly assigneeFilter = signal<number | null>(null);
  protected readonly statusFilter = signal<boolean | null>(null);
  protected readonly selectedTasks = signal<TaskRow[]>([]);

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
}
