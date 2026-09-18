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
  roles: Role[];
  groups: Group[];
}

export interface UserChanges {
  name: string;
  email: string;
  roleIds: number[];
  groupIds: number[];
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
    () => (this.authApi.isAuthenticated() ? '/api/roles' : undefined),
    { defaultValue: [] },
  );

  readonly groups = httpResource<Group[]>(
    () => (this.authApi.isAuthenticated() ? '/api/groups' : undefined),
    { defaultValue: [] },
  );

  update(id: number, changes: UserChanges) {
    return firstValueFrom(this.http.put(`/api/users/${id}`, changes));
  }
}
