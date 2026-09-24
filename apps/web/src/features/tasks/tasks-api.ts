import { inject, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { AuthApi } from '../auth/auth-api';
import { User } from '../settings/tabs/users-tab/users-api';

export type TaskType = 'call' | 'email' | 'meeting' | 'document';

export interface Task {
  id: number;
  leadId: number;
  type: TaskType;
  text: string;
  dueAt: string;
  isCompleted: boolean;
  assigneeId: number | null;
  assignee: Pick<User, 'id' | 'name' | 'email'> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  leadId: number;
  type: TaskType;
  text: string;
  dueAt: string;
  assigneeId: number | null;
}

@Service()
export class TasksApi {
  private readonly authApi = inject(AuthApi);
  private readonly http = inject(HttpClient);

  readonly tasks = httpResource<Task[]>(
    () => (this.authApi.isAuthenticated() ? '/api/tasks' : undefined),
    { defaultValue: [] },
  );

  readonly create = (task: TaskInput) =>
    this.http.post<Task>('/api/tasks', task);

  readonly setCompleted = (id: number, isCompleted: boolean) =>
    this.http.put<Task>(`/api/tasks/${id}`, { isCompleted });
}
