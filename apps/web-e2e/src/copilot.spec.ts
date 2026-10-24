import { expect, test, type Page } from '@playwright/test';

const lead = {
  id: 1,
  name: 'Saved Lead',
  price: 1000,
  source: null,
  pipelineId: 1,
  statusId: 1,
  ownerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  customFields: {},
  status: { id: 1, name: 'New', color: '#123456' },
  company: null,
  owner: null,
  contacts: [],
};

const conversation = {
  id: 1,
  title: 'Private chat',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function mockApi(page: Page) {
  const conversations: Array<Record<string, unknown>> = [];
  const messages: Array<Record<string, unknown>> = [];
  let sentBody: Record<string, unknown> | undefined;

  await page.addInitScript(() => localStorage.setItem('accessToken', 'e2e-token'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body: unknown = {};

    if (path === '/api/auth/me') {
      body = { user: { id: 1, name: 'E2E User', email: 'e2e@example.test' }, permissions: ['leads:read'] };
    } else if (path === '/api/leads/1') {
      body = lead;
    } else if (path === '/api/pipelines') {
      body = [{ id: 1, name: 'Sales' }];
    } else if (path === '/api/pipelines/1/statuses') {
      body = [lead.status];
    } else if (path === '/api/copilot/status') {
      body = { enabled: true, capabilities: { conversations: true, messaging: true } };
    } else if (path === '/api/copilot/conversations' && request.method() === 'GET') {
      body = { items: conversations, nextCursor: null };
    } else if (path === '/api/copilot/conversations' && request.method() === 'POST') {
      conversations.unshift(conversation);
      body = conversation;
    } else if (path === '/api/copilot/conversations/1/messages' && request.method() === 'GET') {
      body = { items: messages, nextCursor: null };
    } else if (path === '/api/copilot/conversations/1/messages' && request.method() === 'POST') {
      sentBody = request.postDataJSON() as Record<string, unknown>;
      const runId = 'run-1';
      messages.push(
        { id: 1, conversationId: 1, runId, role: 'user', text: sentBody['text'], sources: [], createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 2, conversationId: 1, runId, role: 'assistant', text: 'Saved lead summary.', sources: [], createdAt: '2026-01-01T00:00:01.000Z' },
      );
      body = { runId, status: 'completed' };
    } else if (path === '/api/copilot/runs/run-1') {
      body = { runId: 'run-1', status: 'completed', context: { kind: 'lead', id: 1 }, messages: [], actions: [] };
    } else if (path.startsWith('/api/copilot/')) {
      body = { items: [], nextCursor: null };
    } else if (path.startsWith('/api/')) {
      body = [];
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  return { getSentBody: () => sentBody };
}

test('keeps saved-record context separate from an unsaved lead draft and shares chat state', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/copilot');
  await page.getByRole('button', { name: 'Start a chat' }).click();
  await expect(page.getByRole('textbox', { name: 'Message Copilot' })).toBeVisible();

  await page.goto('/leads/1');
  await page.getByRole('button', { name: 'Edit lead name' }).click();
  await page.getByRole('textbox', { name: 'Lead name' }).fill('Unsaved Draft Secret');
  await page.getByRole('button', { name: 'Discuss in Copilot' }).click();
  await expect(page.getByText('Discussing Saved Lead')).toBeVisible();

  await page.getByRole('textbox', { name: 'Message Copilot' }).fill('Summarize this lead');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Saved lead summary.')).toBeVisible();

  const sent = api.getSentBody();
  expect(sent?.['context']).toEqual({ kind: 'lead', id: 1 });
  expect(JSON.stringify(sent)).not.toContain('Unsaved Draft Secret');

  await page.getByRole('button', { name: 'Close Copilot' }).click();
  await expect(page.getByRole('button', { name: 'Edit lead name' })).toContainText('Unsaved Draft Secret');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Copilot', exact: true }).click();
  await expect(page).toHaveURL(/\/copilot$/);
  await expect(page.locator('.copilot-page').getByText('Saved lead summary.')).toBeVisible();
});

test('mobile Copilot drawer stays within the viewport and Escape restores trigger focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/leads/1');

  const trigger = page.getByRole('button', { name: 'Open Copilot panel' });
  await trigger.click();
  const closeButton = page.getByRole('button', { name: 'Close Copilot' });
  await expect(closeButton).toBeVisible();
  const drawer = page.locator('.p-drawer:visible');
  await expect.poll(async () => {
    const bounds = await drawer.boundingBox();
    return bounds && bounds.x + bounds.width;
  }).toBeLessThanOrEqual(390);
  const bounds = await drawer.boundingBox();
  if (!bounds) throw new Error('Copilot drawer has no visible bounds');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);

  await page.keyboard.press('Escape');
  await expect(closeButton).toBeHidden();
  await expect(trigger).toBeFocused();
});
