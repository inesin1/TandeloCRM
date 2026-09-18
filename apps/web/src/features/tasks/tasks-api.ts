import { inject, Service } from '@angular/core';
import { httpResource } from '@angular/common/http';
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
}

@Service()
export class TasksApi {
  private readonly authApi = inject(AuthApi);

  readonly tasks = httpResource<Task[]>(
    () => (this.authApi.isAuthenticated() ? '/api/tasks' : undefined),
    { defaultValue: [] },
  );
}
