import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { login, openAsk, openClientChat, type DemoRole } from './helpers/login';

/**
 * Screenshots for human review — no pixel assertions. Files land in
 * test-results/ask-vcfo/{role}-{screen}-{width}-{theme}.png.
 */

const OUT = path.join('test-results', 'ask-vcfo');
const WIDTHS = [1440, 1280, 390] as const;
const THEMES = ['light', 'dark'] as const;

// The dev server compiles each route on first visit.
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  // The shell's own theme control: its label names the theme it switches to.
  const toggle = page.getByRole('button', { name: new RegExp(`Switch to ${theme} (mode|theme)`) });
  if (await toggle.first().isVisible().catch(() => false)) await toggle.first().click();
}

async function shot(page: Page, role: DemoRole, screen: string, width: number, theme: string) {
  await page.waitForTimeout(400); // let the panel slide and fonts settle
  await page.screenshot({ path: path.join(OUT, `${role}-${screen}-${width}-${theme}.png`) });
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`client chat window ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await login(page, 'client');
      await setTheme(page, theme);
      const chat = await openClientChat(page);
      await expect(chat.getByRole('button', { name: 'What is my next step?' })).toBeVisible();
      await shot(page, 'client', 'home', width, theme);
      await chat.getByRole('button', { name: 'Where is my incorporation now?' }).click();
      await expect(chat.getByRole('group', { name: 'Was this helpful?' })).toBeVisible({ timeout: 60_000 });
      await shot(page, 'client', 'answer', width, theme);
    });
  }
}

test('client full page answer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'client');
  await setTheme(page, 'light');
  await page.goto('/app/client/ask');
  await page.getByRole('button', { name: 'Where is my incorporation now?' }).click();
  await expect(page.locator('[data-visual="flow"]')).toBeVisible({ timeout: 60_000 });
  await shot(page, 'client', 'full-page', 1440, 'light');
});

test('client library', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'client');
  await setTheme(page, 'light');
  await page.goto('/app/client/library');
  await page.waitForLoadState('networkidle');
  await shot(page, 'client', 'library', 1440, 'light');
});

test('admin answer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'admin');
  await setTheme(page, 'light');
  const panel = await openAsk(page);
  await panel.getByRole('button', { name: 'Which projects are waiting on clients?' }).click();
  await expect(panel.locator('[data-visual="projectRows"]').or(panel.getByText('No projects are waiting'))).toBeVisible({ timeout: 60_000 });
  await shot(page, 'admin', 'answer', 1440, 'light');
});

test('super admin preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'super');
  await setTheme(page, 'light');
  const panel = await openAsk(page);
  await panel.getByRole('button', { name: 'Preview Ask VCFO as a client' }).click();
  await panel.locator('ul li button').first().click();
  await expect(page.locator('#ask-panel').getByText(/^Client view · /)).toBeVisible();
  await shot(page, 'super', 'preview', 1440, 'light');
});
