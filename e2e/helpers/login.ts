import { expect, type Locator, type Page } from '@playwright/test';
import { Client } from 'pg';

/**
 * Demo users. `npm run db:seed` creates the `@vcfo.local` set and
 * `npm run db:seed-demo` the `@demo.vcfo.local` set (password `demo1234`);
 * the defaults below are the ones present in a demo-seeded database. Override
 * any of them with E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD.
 */
const USERS = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? 'client-kestrel@demo.vcfo.local',
    password: process.env.E2E_CLIENT_PASSWORD ?? 'demo1234',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin-nadia@demo.vcfo.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'demo1234',
  },
  super: {
    email: process.env.E2E_SUPER_EMAIL ?? 'super@vcfo.local',
    password: process.env.E2E_SUPER_PASSWORD ?? 'super123',
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL ?? 'pm-anita@demo.vcfo.local',
    password: process.env.E2E_MANAGER_PASSWORD ?? 'demo1234',
  },
  lead: {
    email: process.env.E2E_LEAD_EMAIL ?? 'lead-divya@demo.vcfo.local',
    password: process.env.E2E_LEAD_PASSWORD ?? 'demo1234',
  },
} as const;

export type DemoRole = keyof typeof USERS;

/** New items pop up over the page; a person closes those cards, so a test does too. */
export async function closeLivePopups(page: Page): Promise<void> {
  for (const kind of ['announcement', 'notification']) {
    // The next card in the queue can follow at once, so the handler does not wait for this one to go.
    await page.addLocatorHandler(page.locator(`#${kind}-live-title`), () => page.keyboard.press('Escape'), { noWaitAfter: true });
  }
}

/** Runs against the test database only when it is on this machine: no connection is made for any other host. */
export async function onLocalDb(run: (db: Client) => Promise<unknown>): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) return;
  const db = new Client({ connectionString: url });
  await db.connect();
  await run(db).finally(() => db.end());
}

/**
 * The sign-in limit counts every attempt, ten per address in fifteen minutes, and a test run signs
 * in far more often than that. So a test forgets the counts first, on a local database only.
 */
const forgetSignInCounts = (): Promise<void> =>
  onLocalDb((db) => db.query(`delete from rate_limits where key like 'sign-in:%' or key like 'two-step:%'`));

/**
 * Sign in through the login page, ending any earlier session. The page renders the form twice (one copy
 * hidden) and hydration can clear an early fill, so fill the visible inputs
 * and re-fill until the values stick.
 */
export async function login(page: Page, role: DemoRole): Promise<void> {
  const { email, password } = USERS[role];
  await forgetSignInCounts();
  await closeLivePopups(page);
  // Leave the page first: a request still running there could set the old session cookie again.
  await page.goto('about:blank');
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('#email:visible');
  const passwordInput = page.locator('#password:visible');
  await expect(async () => {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    expect(await emailInput.inputValue()).toBe(email);
    expect(await passwordInput.inputValue()).toBe(password);
  }).toPass({ timeout: 15_000 });
  await page.locator('button[type="submit"]:visible').first().click();
  await page.waitForURL(/\/app\//, { timeout: 30_000 });
}

/** The staff Ask VCFO launcher. */
export function askLauncher(page: Page) {
  return page.locator('button[aria-controls="ask-panel"]');
}

/** Open the Ask VCFO panel and wait for its suggestions. */
export async function openAsk(page: Page) {
  await expect(askLauncher(page)).toBeVisible({ timeout: 30_000 });
  await askLauncher(page).click();
  const panel = page.locator('#ask-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** The client portal's own chat window: the pill above a phone's width, and the Ask tab on a phone. */
export async function openClientChat(page: Page) {
  const pill = page.getByRole('button', { name: 'Open Ask VCFO chat' });
  const tab = page.getByRole('navigation', { name: 'Main, phone' }).getByRole('button', { name: 'Ask' });
  await pill.or(tab).first().click({ timeout: 30_000 });
  const chat = page.locator('#vp-chat');
  await expect(chat).toBeVisible();
  return chat;
}

/** Types a question into the open client chat window and sends it. */
export async function askClientChat(chat: Locator, question: string) {
  const input = chat.getByRole('textbox', { name: 'Type a question' });
  await input.fill(question);
  await input.press('Enter');
}
