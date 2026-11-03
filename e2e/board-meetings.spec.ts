import { expect, test } from '@playwright/test';
import { login } from './helpers/login';

/**
 * Board meetings (docs/specs/board-meetings/PLAN.md): the lead starts a meeting from
 * Obligations, the meeting page opens on the Notice tab, and the other tabs render.
 * Needs `npm run db:seed-demo`. Each run creates one draft meeting for the lead's first client.
 */
test('the lead creates a meeting and walks its tabs', async ({ page }) => {
  await login(page, 'lead');
  await page.goto('/app/intern/compliances/obligations?cat=ns');
  await page.getByRole('button', { name: 'New meeting' }).click();
  await page.getByRole('button', { name: /Create and draft notice/ }).click();
  await page.waitForURL(/\/obligations\/meetings\//, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Meeting details' })).toBeVisible();
  await page.getByRole('button', { name: /Pick from library/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Agenda library');
  await page.keyboard.press('Escape');
  for (const [tab, text] of [
    ['Replies', 'Replies open once the notice is sent'],
    ['MoM', 'Minutes of meeting'],
    ['Resolutions', 'Resolutions after the meeting'],
  ] as const) {
    await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByText(text).first()).toBeVisible();
  }
});
