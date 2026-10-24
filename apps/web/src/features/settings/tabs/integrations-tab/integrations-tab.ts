import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { AuthApi } from '../../../auth/auth-api';
import { CopilotState } from '../../../copilot/copilot-state';
import { CopilotProviderSettings, CopilotProviderSettingsInput, CopilotSettingsApi } from './copilot-settings-api';

interface CopilotSettingsForm {
  enabled: boolean;
  apiFormat: CopilotProviderSettings['apiFormat'];
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
}

const DEFAULT_SETTINGS: CopilotSettingsForm = {
  enabled: false,
  apiFormat: 'responses',
  baseUrl: '',
  model: '',
  apiKey: '',
  clearApiKey: false,
};

@Component({
  templateUrl: './integrations-tab.html',
  host: { class: 'block' },
  imports: [ButtonModule, CheckboxModule, FormField, FormsModule, InputTextModule, MessageModule, SelectModule],
})
export class IntegrationsTab {
  private readonly authApi = inject(AuthApi);
  private readonly settingsApi = inject(CopilotSettingsApi);
  private readonly copilotState = inject(CopilotState);

  protected readonly canManageCopilot = computed(() => this.authApi.hasPermission('users:write'));
  protected readonly settings = signal<CopilotProviderSettings | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly loadError = signal('');
  protected readonly saveError = signal('');
  protected readonly saveSuccess = signal(false);
  protected readonly testResult = signal<{ ok: boolean; message: string } | null>(null);
  protected readonly formats: Array<{ label: string; value: CopilotProviderSettings['apiFormat'] }> = [
    { label: 'Responses API', value: 'responses' },
    { label: 'Chat Completions', value: 'chat-completions' },
  ];

  protected readonly model = signal<CopilotSettingsForm>(DEFAULT_SETTINGS);
  protected readonly settingsForm = form(this.model, (path) => {
    required(path.baseUrl, { message: 'Base URL is required' });
    required(path.model, { when: () => this.model().enabled, message: 'Model is required when Copilot is enabled' });
  });

  protected readonly hasUnsavedChanges = computed(() => {
    const saved = this.settings();
    if (!saved) return true;
    const form = this.model();
    return form.enabled !== saved.enabled || form.apiFormat !== saved.apiFormat ||
      form.baseUrl.trim() !== saved.baseUrl || form.model.trim() !== saved.model ||
      !!form.apiKey || form.clearApiKey;
  });

  protected readonly baseUrlChanged = computed(() => {
    const saved = this.settings();
    return !!saved && this.model().baseUrl.trim() !== saved.baseUrl;
  });

  constructor() {
    effect(() => {
      if (this.canManageCopilot() && !this.settings() && !this.loading() && !this.loadError()) {
        void this.loadSettings();
      }
    });
  }

  protected async loadSettings() {
    if (!this.canManageCopilot() || this.loading()) return;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const settings = await this.settingsApi.get();
      this.settings.set(settings);
      this.model.set({
        enabled: settings.enabled,
        apiFormat: settings.apiFormat,
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: '',
        clearApiKey: false,
      });
    } catch {
      this.loadError.set('Could not load Copilot settings. Try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onSubmit(event: Event) {
    event.preventDefault();
    if (!this.canManageCopilot()) return;
    this.saveError.set('');
    this.saveSuccess.set(false);
    this.settingsForm.baseUrl().markAsTouched();
    this.settingsForm.model().markAsTouched();
    submit(this.settingsForm, async () => {
      const values = this.model();
      const baseUrl = values.baseUrl.trim();
      const model = values.model.trim();
      if (!this.isHttpUrl(baseUrl) || (values.enabled && !model)) {
        this.saveError.set(values.enabled
          ? 'Enter a valid HTTP or HTTPS base URL and model.'
          : 'Enter a valid HTTP or HTTPS base URL.');
        return;
      }
      this.saving.set(true);
      this.testResult.set(null);
      try {
        const payload: CopilotProviderSettingsInput = {
          enabled: values.enabled,
          apiFormat: values.apiFormat,
          baseUrl,
          model,
          ...(values.apiKey ? { apiKey: values.apiKey } : values.clearApiKey ? { apiKey: null } : {}),
        };
        const saved = await this.settingsApi.save(payload);
        this.settings.set(saved);
        this.model.set({
          enabled: saved.enabled,
          apiFormat: saved.apiFormat,
          baseUrl: saved.baseUrl,
          model: saved.model,
          apiKey: '',
          clearApiKey: false,
        });
        const status = this.copilotState.status();
        if (status) this.copilotState.status.set({ ...status, enabled: saved.enabled });
        this.saveSuccess.set(true);
      } catch {
        this.saveError.set('Could not save Copilot settings. Check the values and try again.');
      } finally {
        this.saving.set(false);
      }
    });
  }

  protected async testSavedConnection() {
    if (!this.canManageCopilot() || !this.settings() || this.hasUnsavedChanges() || this.testing()) return;
    this.testing.set(true);
    this.testResult.set(null);
    try {
      const result = await this.settingsApi.test();
      this.testResult.set({
        ok: result.ok,
        message: result.ok ? 'Connection successful.' : `Connection failed (${result.errorCode ?? 'unknown_error'}).`,
      });
    } catch {
      this.testResult.set({ ok: false, message: 'Could not test the saved connection.' });
    } finally {
      this.testing.set(false);
    }
  }

  protected updateField<K extends keyof CopilotSettingsForm>(field: K, value: CopilotSettingsForm[K]) {
    this.model.update((current) => ({ ...current, [field]: value }));
    this.saveError.set('');
    this.saveSuccess.set(false);
    this.testResult.set(null);
  }

  protected updateApiKey(value: string) {
    this.model.update((current) => ({ ...current, apiKey: value, clearApiKey: value ? false : current.clearApiKey }));
    this.fieldsChanged();
  }

  protected updateClearApiKey(value: boolean) {
    this.model.update((current) => ({ ...current, clearApiKey: value, apiKey: value ? '' : current.apiKey }));
    this.fieldsChanged();
  }

  protected fieldsChanged() {
    this.saveError.set('');
    this.saveSuccess.set(false);
    this.testResult.set(null);
  }

  protected isHttpUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }
}
