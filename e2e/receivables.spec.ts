import { expect, test, type Page } from '@playwright/test';

/**
 * Receivables (docs/specs/receivables/PLAN.md): the manager signs in and sees the sheet; a
 * client partner signs in and sees only their own invoices; a signed-out visitor of /receivables
 * goes to the partner login; a partner is kept out of the manager area.
 *
 * Needs `npm run db:seed` with the receivables demo sheet (`manager@vcfo.local`, partners
 * `priya.partner@vcfo.local` with Duravant and Northwind, and `rahul.partner@vcfo.local` with
 * Bonterra), and at least one published version. Override the logins with E2E_RCV_* variables.
 */

const MANAGER = { email: process.env.E2E_RCV_MANAGER_EMAIL ?? 'manager@vcfo.local', password: process.env.E2E_RCV_MANAGER_PASSWORD ?? 'manager123' };
const PRIYA = { email: process.env.E2E_RCV_PARTNER_EMAIL ?? 'priya.partner@vcfo.local', password: process.env.E2E_RCV_PARTNER_PASSWORD ?? 'partner123' };
/** A client of the other partner, which Priya must never see. */
const OTHER_CLIENT = process.env.E2E_RCV_OTHER_CLIENT ?? 'Bonterra';
const OWN_CLIENT = process.env.E2E_RCV_OWN_CLIENT ?? 'Duravant';

// The dev server compiles each route on first visit.
test.describe.configure({ timeout: 120_000 });

/** Fill the visible sign-in form until the values stick (hydration can clear an early fill), then submit. */
async function signIn(page: Page, path: string, who: { email: string; password: string }, landing: (pathname: string) => boolean) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const email = page.locator('input[type="email"]:visible').first();
  const password = page.locator('input[type="password"]:visible').first();
  await expect(async () => {
    await email.fill(who.email);
    await password.fill(who.password);
    expect(await email.inputValue()).toBe(who.email);
    expect(await password.inputValue()).toBe(who.password);
  }).toPass({ timeout: 15_000 });
  await page.locator('button[type="submit"]:visible').first().click();
  await page.waitForURL((u) => landing(u.pathname), { timeout: 60_000 });
}

test('the manager signs in and sees the sheet', async ({ page }) => {
  await signIn(page, '/login?next=/receivables/manager', MANAGER, (p) => p.startsWith('/receivables/manager'));
  await page.goto('/receivables/manager');
  await expect(page.getByRole('tab', { name: 'Sheet' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tab', { name: 'Sheet' })).toHaveAttribute('aria-selected', 'true');
  // The sheet holds every partner's invoices, the own client and the other partner's alike.
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText('Open receivables', { timeout: 60_000 });
  const list = (await (await page.request.get('/api/receivables/sheets')).json()) as { sheets: Array<{ id: string }> };
  expect(list.sheets.length).toBeGreaterThan(0);
  const sheet = (await (await page.request.get(`/api/receivables/sheets/${list.sheets[0].id}`)).json()) as { invoices: Array<{ clientName: string }> };
  const names = new Set(sheet.invoices.map((i) => i.clientName));
  expect(names.has(OWN_CLIENT) && names.has(OTHER_CLIENT)).toBe(true);
});

test('a client partner signs in and sees only their own invoices', async ({ page }) => {
  await signIn(page, '/receivables/login', PRIYA, (p) => p === '/receivables');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/, { timeout: 60_000 });
  await expect(page.getByRole('cell', { name: OWN_CLIENT, exact: true }).first()).toBeVisible();
  await expect(page.getByText(OTHER_CLIENT)).toHaveCount(0);
  // The API answers with the partner's own rows only.
  const me = await page.request.get('/api/receivables/partner/me');
  expect(me.ok()).toBe(true);
  const body = (await me.json()) as { rows: Array<{ clientName: string }> };
  expect(body.rows.length).toBeGreaterThan(0);
  expect(body.rows.some((r) => r.clientName === OTHER_CLIENT)).toBe(false);
});

test('a signed-out visitor of /receivables goes to the partner login', async ({ page }) => {
  await page.goto('/receivables');
  await expect(page).toHaveURL(/\/receivables\/login/);
});

test('a client partner is kept out of the manager area', async ({ page }) => {
  await signIn(page, '/receivables/login', PRIYA, (p) => p === '/receivables');
  await page.goto('/receivables/manager');
  await expect(page).not.toHaveURL(/\/receivables\/manager/);
  const api = await page.request.get('/api/receivables/sheets');
  expect(api.status()).toBeGreaterThanOrEqual(401);
});
