import { expect, test, type Locator, type Page } from '@playwright/test';
import { askClientChat, login, openAsk, openClientChat, type DemoRole } from './helpers/login';

/**
 * Exact counts with no model. Run this against a server started with no model key: a question that
 * reached a model would then answer "unavailable", so a number on screen proves the local path.
 * The demo seed gives the firm 3 incorporations in FY 2026-27, Anita some and Divya none, so the
 * dates in `seed-demo` decide the words below and only the shape is asserted across years.
 */

test.describe.configure({ timeout: 180_000 });

const QUESTION = 'How many companies are incorporated this year?';

async function ask(root: Locator, question: string) {
  // Hydration can clear an early fill, so fill and send until the send button takes the click.
  const send = root.getByRole('button', { name: 'Send' });
  await expect(async () => {
    await root.locator('#ask-composer').fill(question);
    await send.click({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  // The newest answer is the one this question produced.
  const answer = root.locator('article').last();
  await expect(answer).toBeVisible({ timeout: 60_000 });
  return answer;
}

/** The client portal has its own chat window, with its own launcher. */
async function askInClientChat(page: Page, question: string) {
  const chat = await openClientChat(page);
  await askClientChat(chat, question);
  return chat;
}

const STAFF_CASES: Array<{ role: DemoRole; shell: string; line: RegExp; link: RegExp }> = [
  { role: 'admin', shell: '/app/admin', line: /in FY \d{4}-\d{2} across the firm/, link: /\/app\/admin\/projects/ },
  { role: 'manager', shell: '/app/manager', line: /in FY \d{4}-\d{2} on your projects/, link: /\/app\/manager\/projects/ },
  { role: 'lead', shell: '/app/intern', line: /in FY \d{4}-\d{2} on your projects/, link: /\/app\/intern\/clients/ },
];

for (const { role, shell, line, link } of STAFF_CASES) {
  test(`${role} gets the scoped count in the panel`, async ({ page }) => {
    await login(page, role);
    const panel = await openAsk(page);
    const answer = await ask(panel, QUESTION);
    await expect(answer).toContainText(line);
    await expect(answer).not.toContainText('unavailable');
    await expect(answer.getByRole('link', { name: 'Open projects' })).toHaveAttribute('href', link);
    expect(new URL(page.url()).pathname.startsWith(shell)).toBe(true);
  });

  test(`${role} has the full Ask page, and Hinglish works there`, async ({ page }) => {
    await login(page, role);
    await page.goto(`${shell}/ask`);
    const root = page.locator('main');
    await expect(root.locator('#ask-composer')).toBeVisible({ timeout: 60_000 });
    const answer = await ask(root, 'is saal kitni companies incorporate hui?');
    await expect(answer).toContainText(line);
    await expect(answer).not.toContainText('unavailable');
  });
}

test('a lead sees only their own number, and the row opens the lead page', async ({ page }) => {
  await login(page, 'lead');
  const panel = await openAsk(page);
  const answer = await ask(panel, 'How many companies are in progress?');
  await expect(answer).toContainText('on your projects');
  const row = answer.locator('[data-visual="projectRows"] a').first();
  await expect(row).toHaveAttribute('href', /^\/app\/intern\/engagements\//);
});

const COMPANY_FACT = /Your company, Kestrel.+ (was incorporated|has not been incorporated yet)/;

test('a client gets their own company, in the chat window and on the full page', async ({ page }) => {
  await login(page, 'client');
  const chat = await askInClientChat(page, QUESTION);
  await expect(chat).toContainText(COMPANY_FACT, { timeout: 60_000 });
  await page.goto('/app/client/ask');
  const answer = await ask(page.locator('main'), 'is saal kitni companies incorporate hui?');
  await expect(answer).toContainText(COMPANY_FACT);
});

test('a client asking a staff metric gets no firm number', async ({ page }) => {
  await login(page, 'client');
  const chat = await askInClientChat(page, 'How many approvals are pending?');
  await expect(chat).not.toContainText('across the firm', { timeout: 5_000 });
  await expect(chat).not.toContainText(/\d+ approvals? (is|are) pending/);
});

test('the filings card holds at phone width @mobile', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/app/admin/ask');
  const answer = await ask(page.locator('main'), 'How many filings are overdue?');
  await expect(answer).toContainText('across the firm');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
