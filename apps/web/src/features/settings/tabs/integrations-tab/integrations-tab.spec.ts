import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApi } from '../../../auth/auth-api';
import { CopilotState } from '../../../copilot/copilot-state';
import { CopilotProviderSettings, CopilotProviderSettingsInput, CopilotSettingsApi } from './copilot-settings-api';
import { IntegrationsTab } from './integrations-tab';

const savedSettings: CopilotProviderSettings = {
  enabled: false,
  apiFormat: 'responses',
  baseUrl: 'https://api.example.test/v1',
  model: 'model-with-tools',
  apiKeySet: true,
  source: 'database',
};

function setup(canManage = true, overrides: Record<string, unknown> = {}) {
  const settingsApi = {
    get: vi.fn(async () => savedSettings),
    save: vi.fn(async (value: CopilotProviderSettingsInput) => ({ ...savedSettings, ...value })),
    test: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
  const copilotStatus = signal({ enabled: false, capabilities: { conversations: true, messaging: true } });
  TestBed.configureTestingModule({
    imports: [IntegrationsTab],
    providers: [
      { provide: AuthApi, useValue: { hasPermission: () => canManage } },
      { provide: CopilotSettingsApi, useValue: settingsApi },
      { provide: CopilotState, useValue: { status: copilotStatus } },
    ],
  });
  const fixture = TestBed.createComponent(IntegrationsTab);
  fixture.detectChanges();
  return { fixture, settingsApi, copilotStatus };
}

function controls(fixture: ComponentFixture<IntegrationsTab>) {
  return fixture.componentInstance as unknown as {
    updateField: (field: 'enabled' | 'apiFormat' | 'baseUrl' | 'model' | 'apiKey' | 'clearApiKey', value: boolean | string) => void;
    updateApiKey: (value: string) => void;
    updateClearApiKey: (value: boolean) => void;
    onSubmit: (event: Event) => void;
    testSavedConnection: () => Promise<void>;
  };
}

describe('IntegrationsTab', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('does not load or expose integration settings to members', async () => {
    const { fixture, settingsApi } = setup(false);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(settingsApi.get).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('#copilotApiKey')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('do not have permission');
  });

  it('keeps the secret field blank when loading a setting that has a saved key', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#copilotApiKey').value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('A key is saved');
  });

  it('omits an untouched key, clears it with null, and replaces it with a new key', async () => {
    const { fixture, settingsApi } = setup();
    await fixture.whenStable();
    const controlsForTab = controls(fixture);

    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    expect(settingsApi.save).toHaveBeenLastCalledWith({
      enabled: false,
      apiFormat: 'responses',
      baseUrl: savedSettings.baseUrl,
      model: savedSettings.model,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Settings saved.');

    controlsForTab.updateClearApiKey(true);
    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    expect(settingsApi.save).toHaveBeenLastCalledWith({
      enabled: false,
      apiFormat: 'responses',
      baseUrl: savedSettings.baseUrl,
      model: savedSettings.model,
      apiKey: null,
    });

    controlsForTab.updateClearApiKey(true);
    controlsForTab.updateApiKey('replacement-key');
    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    expect(settingsApi.save).toHaveBeenLastCalledWith({
      enabled: false,
      apiFormat: 'responses',
      baseUrl: savedSettings.baseUrl,
      model: savedSettings.model,
      apiKey: 'replacement-key',
    });
  });

  it('warns that changing the base URL clears the saved key and requires saving before testing', async () => {
    const { fixture, settingsApi } = setup();
    await fixture.whenStable();
    const controlsForTab = controls(fixture);
    controlsForTab.updateField('baseUrl', 'https://new-provider.example.test/v1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Changing the base URL clears the saved API key');
    expect(fixture.nativeElement.querySelector('button[type="button"]').disabled).toBe(true);

    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    expect(settingsApi.save).toHaveBeenLastCalledWith({
      enabled: false,
      apiFormat: 'responses',
      baseUrl: 'https://new-provider.example.test/v1',
      model: savedSettings.model,
    });
  });

  it('clears the entered key after a successful save', async () => {
    const { fixture } = setup();
    await fixture.whenStable();
    const controlsForTab = controls(fixture);
    controlsForTab.updateApiKey('new-secret');
    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#copilotApiKey').value).toBe('');
  });

  it('shows a save error without losing form state', async () => {
    const { fixture } = setup(true, { save: vi.fn(async () => { throw new Error('network'); }) });
    await fixture.whenStable();
    const controlsForTab = controls(fixture);
    controlsForTab.updateField('model', 'edited-model');
    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not save Copilot settings');
    expect(fixture.nativeElement.querySelector('#copilotModel').value).toBe('edited-model');
  });

  it('allows saving an empty model while Copilot is disabled', async () => {
    const { fixture, settingsApi } = setup();
    await fixture.whenStable();
    const controlsForTab = controls(fixture);
    controlsForTab.updateField('model', '');
    controlsForTab.onSubmit(new Event('submit'));
    await fixture.whenStable();

    expect(settingsApi.save).toHaveBeenLastCalledWith({
      enabled: false,
      apiFormat: 'responses',
      baseUrl: savedSettings.baseUrl,
      model: '',
    });
  });

  it('shows the saved connection probe result', async () => {
    const { fixture, settingsApi } = setup(true, { test: vi.fn(async () => ({ ok: false, errorCode: 'provider_timeout' })) });
    await fixture.whenStable();
    await controls(fixture).testSavedConnection();
    fixture.detectChanges();

    expect(settingsApi.test).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Connection failed (provider_timeout).');
  });
});
