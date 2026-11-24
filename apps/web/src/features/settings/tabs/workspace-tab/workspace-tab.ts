import {
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../../auth/auth-api';
import { WorkspaceSettings } from '../../workspace-settings';

@Component({
  templateUrl: './workspace-tab.html',
  imports: [ButtonModule, FormField],
})
export class WorkspaceTab {
  private readonly auth = inject(AuthApi);
  private readonly settings = inject(WorkspaceSettings);
  private readonly model = linkedSignal(() => ({
    currency: this.settings.currency(),
  }));
  protected readonly preferences = this.settings.preferences;
  protected readonly changed = computed(
    () => this.model().currency !== this.settings.currency(),
  );
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly saved = signal(false);
  protected readonly canManage = computed(() =>
    this.auth.hasPermission('pipelines:write'),
  );
  protected readonly currencyForm = form(this.model, (path) => {
    disabled(path.currency, { when: () => this.saving() || !this.canManage() });
  });

  private readonly currencyNames = new Intl.DisplayNames('en', {
    type: 'currency',
  });
  protected readonly currencies = Intl.supportedValuesOf('currency').map(
    (code) => ({
      code,
      name: this.currencyNames.of(code),
    }),
  );

  protected async save(event: Event) {
    event.preventDefault();
    if (!this.canManage() || this.saving() || !this.changed()) return;

    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    try {
      await firstValueFrom(this.settings.saveCurrency(this.model().currency));
      this.saved.set(true);
    } catch {
      this.error.set('Currency could not be saved. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
