import { expect, test } from '@playwright/test';

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('shows the desktop page with an authenticated session', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('accessToken', 'e2e-token'),
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body =
      path === '/api/auth/me'
        ? {
            user: { id: 1, name: 'E2E User', email: 'e2e@example.test' },
            permissions: ['users:read'],
          }
        : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Desktop' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'CRM summary' })).toBeVisible();
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/settings\/users$/);
  await expect(
    page.getByRole('link', { name: 'Users', exact: true }),
  ).toBeVisible();
});
