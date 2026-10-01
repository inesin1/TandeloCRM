import { computed, inject, Service, signal } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthSession {
  user: {
    id: number;
    name: string;
    email: string;
  };
  permissions: string[];
}

@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly _token = signal(localStorage.getItem('accessToken'));

  readonly token = this._token.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());
  readonly session = httpResource<AuthSession>(() =>
    this.isAuthenticated() ? '/api/auth/me' : undefined,
  );
  readonly permissions = computed(() =>
    this.session.hasValue() ? this.session.value().permissions : [],
  );

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  async login(email: string, password: string) {
    const res = await firstValueFrom(
      this.http.post<{ accessToken: string }>('/api/auth/login', {
        email,
        password,
      }),
    );
    localStorage.setItem('accessToken', res.accessToken);
    this._token.set(res.accessToken);
  }

  logout() {
    localStorage.removeItem('accessToken');
    this._token.set(null);
  }
}
