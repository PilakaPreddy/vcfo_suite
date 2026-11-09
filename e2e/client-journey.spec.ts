import { expect, test } from '@playwright/test';
import { login } from './helpers/login';

/**
 * The client journey map on the client home page (docs/specs/client-journey-map/PLAN.md): the map
 * is the first card, the tracker selects a stage, a branch opens, the panel lists the checklist and
 * "Open step" goes to the step page. Needs `npm run db:seed-demo` (client kestrel is mid
 * incorporation).
 */

test.beforeEach(async ({ page }) => {
  // The portal's intro animation would cover the page on the first visit.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('vcfo.skipIntro', '1');
    } catch {
      /* storage is optional */
    }
  });
});

test('client opens the journey map, a branch and the step panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'client');
  await page.goto('/app/client/overview');

  const stages = page.getByRole('group', { name: 'Journey stages' });
  await expect(stages).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main h2, main h3').first()).toHaveText(/Your journey/);

  // Incorporation is the current stage, so it starts selected.
  const incorporation = stages.getByRole('button', { name: /^Incorporation:/ });
  await expect(incorporation).toHaveAttribute('aria-pressed', 'true');
  await stages.getByRole('button', { name: /^Post-incorporation:/ }).click();
  await incorporation.click();
  await expect(incorporation).toHaveAttribute('aria-pressed', 'true');

  // Open a closed branch of the tree.
  const canvas = page.getByRole('application');
  await expect(canvas).toBeVisible();
  const cards = canvas.locator('[role=button][aria-label*=" of "]');
  // Fit puts every card inside the canvas (the first view centres on the current step).
  await canvas.getByRole('button', { name: 'Fit' }).click();
  const before = await cards.count();
  await canvas.getByRole('button', { name: /^Open SPICe\+ Part A/ }).click();
  await expect.poll(() => cards.count()).toBeGreaterThan(before);

  // A group's panel lists its steps as a checklist.
  await canvas.getByRole('button', { name: 'Fit' }).click();
  await canvas.getByRole('button', { name: /^SPICe\+ Part B/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: /SPICe\+ Part B/ })).toBeVisible();
  const rows = panel.getByTestId('journey-checklist').locator('li');
  await expect.poll(() => rows.count()).toBeGreaterThan(3);

  // "Open step" goes to that step's page.
  await panel.getByRole('button', { name: 'Open step' }).first().click();
  await page.waitForURL(/\/app\/client\/incorporation\/step\//);
});

test('the next-step banner opens the panel with what the client owes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, 'client');
  await page.goto('/app/client/overview');

  const banner = page.getByTestId('journey-next');
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await banner.getByRole('button').click();
  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('journey-checklist').locator('li')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});
