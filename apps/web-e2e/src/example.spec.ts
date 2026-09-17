import { test, expect } from '@playwright/test';

test('shows the desktop page', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Desktop' })).toBeVisible();
});
