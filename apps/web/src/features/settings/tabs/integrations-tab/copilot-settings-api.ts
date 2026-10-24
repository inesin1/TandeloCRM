import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface CopilotProviderSettings {
  enabled: boolean;
  apiFormat: 'responses' | 'chat-completions';
  baseUrl: string;
  model: string;
  apiKeySet: boolean;
  source: 'environment' | 'database';
}

export interface CopilotProviderSettingsInput {
  enabled: boolean;
  apiFormat: CopilotProviderSettings['apiFormat'];
  baseUrl: string;
  model: string;
  apiKey?: string | null;
}

export interface CopilotProviderTestResult {
  ok: boolean;
  errorCode?: string;
}

@Service()
export class CopilotSettingsApi {
  private readonly http = inject(HttpClient);

  get() {
    return firstValueFrom(this.http.get<CopilotProviderSettings>('/api/copilot/settings'));
  }

  save(settings: CopilotProviderSettingsInput) {
    return firstValueFrom(this.http.put<CopilotProviderSettings>('/api/copilot/settings', settings));
  }

  test() {
    return firstValueFrom(this.http.post<CopilotProviderTestResult>('/api/copilot/settings/test', {}));
  }
}
