import { expect, test } from '@playwright/test';
import { login } from './helpers/login';

test('a lead sees their manager in the sidebar with a mail link', async ({ page }) => {
  await login(page, 'lead');
  const fold = page.getByText('Your manager', { exact: true }).locator('..');
  await expect(fold).toBeVisible({ timeout: 30_000 });
  await expect(fold.getByRole('link', { name: /^Email / })).toHaveAttribute('href', /^mailto:.+@/);
});
