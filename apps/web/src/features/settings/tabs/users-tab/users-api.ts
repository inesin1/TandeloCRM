import { inject, Service } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../../auth/auth-api';

export interface Role {
  id: number;
  name: string;
}

export interface Group {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  roles: Role[];
  groups: Group[];
}

export interface UserChanges {
  name: string;
  email: string;
  roleIds: number[];
  groupIds: number[];
}

export interface CreateUserChanges extends UserChanges {
  password: string;
}

@Service()
export class UsersApi {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);

  readonly users = httpResource<User[]>(
    () => (this.authApi.isAuthenticated() ? '/api/users' : undefined),
    { defaultValue: [] },
  );

  readonly roles = httpResource<Role[]>(
    () =>
      this.authApi.hasPermission('users:write') ? '/api/roles' : undefined,
    { defaultValue: [] },
  );

  readonly groups = httpResource<Group[]>(
    () => (this.authApi.isAuthenticated() ? '/api/groups' : undefined),
    { defaultValue: [] },
  );

  create(changes: CreateUserChanges) {
    return firstValueFrom(this.http.post('/api/users', changes));
  }

  update(
    id: number,
    changes: Partial<UserChanges> & { password?: string; isActive?: boolean },
  ) {
    return firstValueFrom(this.http.put(`/api/users/${id}`, changes));
  }

  createGroup(name: string) {
    return firstValueFrom(this.http.post<Group>('/api/groups', { name }));
  }

  updateGroup(id: number, name: string) {
    return firstValueFrom(this.http.put<Group>(`/api/groups/${id}`, { name }));
  }

  removeGroup(id: number) {
    return firstValueFrom(this.http.delete(`/api/groups/${id}`));
  }
}
