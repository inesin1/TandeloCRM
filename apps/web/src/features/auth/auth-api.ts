import {
  computed,
  inject,
  InjectionToken,
  Service,
  signal,
} from '@angular/core';
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

export const AUTH_STORAGE_KEY = new InjectionToken<string>('Auth storage key', {
  factory: () => 'accessToken',
});

@Service()
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly storageKey = inject(AUTH_STORAGE_KEY);
  private readonly _token = signal(localStorage.getItem(this.storageKey));

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
    localStorage.setItem(this.storageKey, res.accessToken);
    this._token.set(res.accessToken);
  }

  logout() {
    localStorage.removeItem(this.storageKey);
    this._token.set(null);
  }
}
