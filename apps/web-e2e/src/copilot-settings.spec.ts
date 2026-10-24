import { expect, test, type Page } from '@playwright/test';

const initialSettings = {
  enabled: false,
  apiFormat: 'responses',
  baseUrl: 'https://old-provider.example.test/v1',
  model: 'old-model',
  apiKeySet: true,
  source: 'database',
};

async function mockSettingsApi(page: Page, permissions = ['users:write']) {
  let savedBody: Record<string, unknown> | undefined;
  let testBody: unknown;

  await page.addInitScript(() => localStorage.setItem('accessToken', 'e2e-token'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body: unknown = {};

    if (url.pathname === '/api/auth/me') {
      body = { user: { id: 1, name: 'E2E Admin', email: 'admin@example.test' }, permissions };
    } else if (url.pathname === '/api/copilot/settings' && request.method() === 'GET') {
      body = initialSettings;
    } else if (url.pathname === '/api/copilot/settings' && request.method() === 'PUT') {
      savedBody = request.postDataJSON() as Record<string, unknown>;
      body = {
        ...initialSettings,
        ...savedBody,
        apiKeySet: typeof savedBody['apiKey'] === 'string' || savedBody['baseUrl'] === initialSettings.baseUrl,
        source: 'database',
      };
    } else if (url.pathname === '/api/copilot/settings/test' && request.method() === 'POST') {
      testBody = request.postDataJSON();
      body = { ok: true };
    } else if (url.pathname === '/api/copilot/status') {
      body = { enabled: false, capabilities: { conversations: true, messaging: true } };
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  return { getSavedBody: () => savedBody, getTestBody: () => testBody };
}

test('admin can save and test a custom Copilot provider without exposing the saved key', async ({ page }) => {
  const api = await mockSettingsApi(page);
  await page.goto('/settings/integrations');

  await expect(page.getByRole('textbox', { name: 'API key' })).toHaveValue('');
  await page.getByLabel('Base URL').fill('https://new-provider.example.test/v1');
  await page.getByRole('textbox', { name: 'Model', exact: true }).fill('new-tool-model');
  await page.getByRole('textbox', { name: 'API key' }).fill('e2e-secret-key');
  await page.getByLabel('API format').click();
  await page.getByRole('option', { name: 'Chat Completions' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'API key' })).toHaveValue('');
  expect(api.getSavedBody()).toEqual({
    enabled: false,
    apiFormat: 'chat-completions',
    baseUrl: 'https://new-provider.example.test/v1',
    model: 'new-tool-model',
    apiKey: 'e2e-secret-key',
  });

  await page.getByRole('button', { name: 'Test saved connection' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Connection successful.' })).toBeVisible();
  expect(api.getTestBody()).toEqual({});
});

test('member cannot load or edit Copilot provider settings', async ({ page }) => {
  const api = await mockSettingsApi(page, ['leads:read']);
  let settingsRequested = false;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/copilot/settings')) settingsRequested = true;
  });

  await page.goto('/settings/integrations');

  await expect(page.getByText('You do not have permission to manage integrations.')).toBeVisible();
  await expect(page.getByLabel('Base URL')).toHaveCount(0);
  expect(settingsRequested).toBe(false);
  expect(api.getSavedBody()).toBeUndefined();
});
