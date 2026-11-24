import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Service } from '@angular/core';
import { tap } from 'rxjs';
import { AuthApi } from '../auth/auth-api';

interface WorkspacePreferences {
  currency: string;
}

@Service()
export class WorkspaceSettings {
  private readonly auth = inject(AuthApi);
  private readonly http = inject(HttpClient);

  readonly preferences = httpResource<WorkspacePreferences>(() =>
    this.auth.isAuthenticated() ? '/api/workspace-settings' : undefined,
  );

  readonly currency = computed(() =>
    this.preferences.hasValue()
      ? (this.preferences.value().currency ?? 'USD')
      : 'USD',
  );

  private readonly moneyFormat = computed(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: this.currency(),
        maximumFractionDigits: 0,
      }),
  );

  formatMoney(value: number) {
    return this.moneyFormat().format(value);
  }

  saveCurrency(currency: string) {
    return this.http
      .put<WorkspacePreferences>('/api/workspace-settings', { currency })
      .pipe(tap((preferences) => this.preferences.set(preferences)));
  }
}
