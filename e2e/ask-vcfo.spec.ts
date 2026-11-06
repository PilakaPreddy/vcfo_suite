import { expect, test } from '@playwright/test';
import { askClientChat, login, openAsk, openClientChat } from './helpers/login';

/**
 * Ask VCFO end to end. Suggestions are deterministic, so none of this needs an API key. Clients have
 * their own chat window and a full page; staff have the panel.
 */

const WHERE_NOW = 'Where is my incorporation now?';

// The dev server compiles each route on first visit.
test.describe.configure({ timeout: 180_000 });
/** First answers and first page visits wait on the dev server compiling the route. */
const ANSWER = { timeout: 60_000 };

test.describe('client chat window', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'client');
  });

  test('the pill, the slash key and Esc', async ({ page }) => {
    const pill = page.getByRole('button', { name: 'Open Ask VCFO chat' });
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    const chat = page.getByRole('dialog', { name: 'Ask VCFO chat' });
    await expect(chat).toBeHidden();
    await page.keyboard.press('/');
    await expect(chat.getByRole('textbox', { name: 'Type a question' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(chat).toBeHidden();
    await expect(pill).toBeFocused();
  });

  test('a suggested question answers from the project with no model', async ({ page }) => {
    const chat = await openClientChat(page);
    await expect(chat.getByRole('button', { name: 'What is my next step?' })).toBeVisible();
    await chat.getByRole('button', { name: WHERE_NOW }).click();
    await expect(chat.getByRole('group', { name: 'Was this helpful?' })).toBeVisible(ANSWER);
    await expect(chat).not.toContainText('unavailable');
  });

  test('an off-topic question is never answered', async ({ page }) => {
    const chat = await openClientChat(page);
    await askClientChat(chat, 'write me a python script');
    // With a model key the guard refuses; without one Ask VCFO says it is unavailable.
    await expect(chat.getByText(/only help with your company setup|unavailable right now/)).toBeVisible({ timeout: 45_000 });
  });

  test('opens from the Ask tab as a bottom sheet on a phone @mobile', async ({ page }) => {
    const chat = await openClientChat(page);
    await expect(chat.getByRole('button', { name: WHERE_NOW })).toBeVisible();
    const box = await chat.boundingBox();
    expect(box!.width).toBe(page.viewportSize()!.width);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('client full page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'client');
    await page.goto('/app/client/ask');
  });

  test('where-now answer and its go-there link', async ({ page }) => {
    const main = page.locator('main');
    await main.getByRole('list', { name: 'Quick start' }).getByRole('button', { name: WHERE_NOW }).click(ANSWER);
    await expect(main.locator('[data-visual="flow"]')).toBeVisible(ANSWER);
    // Built from the project's own gate, so it carries the firm badge; topic answers carry
    // "Not yet reviewed" while topics are drafts (next test).
    await expect(main.getByText(/Reviewed by/)).toBeVisible();
    // The chat keeps its first question as its name in the list of past chats.
    await page.reload();
    await expect(main.getByRole('navigation', { name: 'Past chats' }).getByRole('button', { name: new RegExp(WHERE_NOW) }).first()).toBeVisible(ANSWER);
    await expect(main.locator('[data-visual="flow"]')).toBeVisible(ANSWER);
    await main.getByRole('link', { name: 'Open Incorporation' }).click();
    await expect(page).toHaveURL(/\/app\/client\/incorporation/, ANSWER);
  });

  test('topic answer saves to the library', async ({ page }) => {
    const main = page.locator('main');
    await main.getByRole('list', { name: 'Quick start' }).getByRole('button', { name: 'What is GST, and do we need it?' }).click(ANSWER);
    await expect(main.getByText('Not yet reviewed')).toBeVisible(ANSWER);
    await main.getByRole('button', { name: 'Save to library' }).click();
    await expect(main.getByText('Saved to library')).toBeVisible();
    await page.goto('/app/client/library');
    await expect(page.getByRole('link', { name: 'Open GST basics' })).toBeVisible(ANSWER);
  });
});

test('admin: waiting-on-clients rows link into a project', async ({ page }) => {
  await login(page, 'admin');
  const panel = await openAsk(page);
  await panel.getByRole('button', { name: 'Which projects are waiting on clients?' }).click();
  const rows = panel.locator('[data-visual="projectRows"] a');
  await expect(rows.first()).toBeVisible(ANSWER);
  await rows.first().click();
  await expect(page).toHaveURL(/\/app\/admin\/projects\//, ANSWER);
});

test('super admin: preview Ask VCFO as a client', async ({ page }) => {
  await login(page, 'super');
  const panel = await openAsk(page);
  await panel.getByRole('button', { name: 'Preview Ask VCFO as a client' }).click();
  await expect(panel.getByLabel('Find a client')).toBeVisible(ANSWER);
  await panel.locator('ul li button').first().click();
  await expect(page.locator('#ask-panel').getByText(/^Client view · /)).toBeVisible();
  await expect(page.locator('#ask-panel').getByRole('button', { name: 'Exit preview' })).toBeVisible();
});

for (const role of ['manager', 'lead'] as const) {
  test(`${role}: the launcher opens the panel and the client shell is refused`, async ({ page }) => {
    await login(page, role);
    await openAsk(page);
    const res = await page.request.get('/api/ask/suggestions?shell=client');
    expect(res.status()).toBe(403);
  });
}
