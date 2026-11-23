import { expect, test } from '@playwright/test';

const lead = {
  id: 7,
  name: 'Portfolio lead',
  price: 2500,
  source: null,
  pipelineId: 1,
  statusId: 11,
  ownerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  customFields: {},
  status: { id: 11, name: 'New', color: '#123456' },
  company: null,
  owner: null,
  contacts: [],
};

test('shows leads on the board and in the list', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('accessToken', 'e2e-token'),
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === '/api/auth/me'
        ? {
            user: { id: 1, name: 'E2E User', email: 'e2e@example.test' },
            permissions: ['leads:read'],
          }
        : path === '/api/leads'
          ? [lead]
          : path === '/api/pipelines'
            ? [{ id: 1, name: 'Sales' }]
            : path === '/api/pipelines/1/statuses'
              ? [lead.status]
              : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/leads');
  await expect(
    page.getByRole('link', { name: 'Portfolio lead' }),
  ).toBeVisible();
  await expect(page.getByText('No next action')).toBeVisible();

  await page.getByRole('button', { name: 'List' }).click();
  await expect(
    page.getByRole('link', { name: 'Portfolio lead' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});
