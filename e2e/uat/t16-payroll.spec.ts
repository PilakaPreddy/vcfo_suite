import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstStart, resetRecords, as, closeAll, noteEmails, note, step, state, seen, settle, UAT_DIR } from './helpers/uat';
import { FILES } from './helpers/fill-step';

/** T-16 Payroll for Kaveri Foods, October 2026. */
const T = 'T-16';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const exp = JSON.parse(readFileSync(join(UAT_DIR, 'fixtures/expected-payroll-app.json'), 'utf8')) as { gross: number; pf: number; esi: number; pt: number; net: number; workers: number };
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

test('T-16 Payroll', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();
  const q = `company=${trackB.id}&cycle=2026-10`;
  const lead = await as(browser, 'lead2');

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead imports the October salary sheet (12 workers) on Salary updates.' }, async () => {
    await lead.goto(`/app/intern/payroll?${q}&tab=salary-updates`);
    await settle(lead, /Salary|Import/);
    await lead.locator('input[aria-label="Import salaries CSV"]').setInputFiles(join(FILES, 'payroll-oct-2026.csv'));
    await lead.waitForTimeout(1500);
    await expect(seen(lead, /Imported payroll-oct-2026\.csv/)).toBeVisible();
    return { marks: [{ at: seen(lead, /Imported payroll-oct-2026/), kind: 'ok', n: 1 }] };
  });

  let csvTotals = '';
  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The payroll summary totals are compared with the totals worked out by hand.' }, async () => {
    await lead.goto(`/app/intern/payroll?${q}&tab=payroll-summary`);
    await settle(lead, /Download summary|Gross|Net/);
    const [dl] = await Promise.all([lead.waitForEvent('download'), lead.getByRole('button', { name: /Download summary/ }).locator('visible=true').first().click()]);
    const path = await dl.path();
    const csv = readFileSync(path!, 'utf8').trim().split('\n');
    csvTotals = csv[csv.length - 1];
    const cells = csvTotals.split(',').map((c) => c.replace(/"/g, ''));
    // Total row: Total, N workers, '', '', gross, pf, esi, pt, tds, deductions, net, employer cost
    const got = { gross: Number(cells[4]), pf: Number(cells[5]), esi: Number(cells[6]), pt: Number(cells[7]), net: Number(cells[10]) };
    const lines = (['gross', 'pf', 'esi', 'pt', 'net'] as const).map((k) => `${got[k] === exp[k] ? '✓' : '✗'} ${k.toUpperCase()}: expected ${inr(exp[k])}, the app shows ${inr(got[k])}`);
    const ok = (['gross', 'pf', 'esi', 'pt', 'net'] as const).every((k) => got[k] === exp[k]);
    expect(ok, lines.join('; ')).toBe(true);
    return { caption: 'The payroll summary totals match the totals worked out by hand.', detail: lines.join('\n'), marks: [{ at: seen(lead, /Net/), kind: 'ok', n: 1 }] };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 3, role: 'manager', caption: 'The manager opens the same client and cycle to check the lead\'s payroll.' }, async () => {
    await mgr.goto(`/app/manager/payroll?${q}&tab=salary-updates`);
    await settle(mgr, /Salary|Import/);
    const sees = await seen(mgr, 'Arjun Kumar').isVisible().catch(() => false);
    expect(sees, 'The manager cannot see the salaries the lead imported: payroll is kept only in the lead\'s own browser.').toBe(true);
    return { marks: [{ at: seen(mgr, 'Arjun Kumar'), kind: 'ok', n: 1 }] };
  });

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'The client opens Payroll in the portal.' }, async () => {
    await client.goto('/app/client/payroll');
    await settle(client);
    const sees = await seen(client, 'Arjun Kumar').isVisible().catch(() => false);
    return { caption: sees ? 'The client sees the October payroll.' : 'The client\'s Payroll page opens empty: the payroll the lead entered is not visible to the client.', status: sees ? 'pass' : 'fail' };
  });

  note({ test: T, step: 4, status: 'info', caption: 'Payroll and the wage register use different day bases.', detail: 'Payroll prorates monthly rates over the 31 calendar days (paid days include weekly offs and the holiday). The paysheet for the registers carried earned amounts over 26 working days. Both are common practice; the totals differ by design (payroll gross ₹2,45,485, paysheet gross ₹2,37,653) because the sheets were built on different bases.' });
  await noteEmails(T, startedAt, false);
});
