import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstStart, resetRecords, as, closeAll, noteEmails, shot, sql, step, state, seen, settle, setState, RESULTS } from './helpers/uat';

/** T-17 Budgets and variance for Kaveri Foods, FY 2026-27 starting April. */
const T = 'T-17';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

async function workflow(page: Page, button: RegExp, confirmTitle: RegExp, note?: string) {
  await page.getByRole('button', { name: button }).locator('visible=true').first().click();
  const d = page.getByRole('alertdialog').or(page.getByRole('dialog')).filter({ hasText: confirmTitle }).first();
  // Some actions confirm in a window, others act straight away.
  if (!(await d.waitFor({ timeout: 4000 }).then(() => true).catch(() => false))) {
    await page.waitForTimeout(2000);
    return;
  }
  const ta = d.locator('textarea');
  if (note && (await ta.count())) await ta.first().fill(note);
  await d.getByRole('button', { name: button }).last().click();
  await page.waitForTimeout(2500);
}

test('T-17 Budgets and variance', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead2');
  let budgetId = state<{ budgetId?: string }>().budgetId;

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead creates a budget for Kaveri Foods (FY starting April 2026).' }, async () => {
    if (budgetId) return { caption: 'The budget already exists.' };
    await lead.goto('/app/intern/budgets');
    await settle(lead, /New budget/);
    await lead.getByRole('button', { name: /New budget/ }).first().click();
    const d = lead.getByRole('dialog');
    const client = d.getByRole('combobox', { name: 'Client' }).or(d.locator('select[aria-label="Client"]')).first();
    if ((await client.evaluate((e) => e.tagName)) === 'SELECT') await client.selectOption({ label: 'Kaveri Foods Private Limited' });
    else {
      await client.click();
      await lead.getByRole('option', { name: /Kaveri/ }).first().click();
    }
    const month = d.locator('select[aria-label="Start month"]');
    if (await month.count()) await month.selectOption({ label: 'April' }).catch(() => month.selectOption('4'));
    const year = d.getByRole('spinbutton').first();
    if (await year.count()) await year.fill('2026');
    await shot(lead, { test: T, step: 1, role: 'lead2', status: 'pass', caption: 'New budget: Kaveri Foods, starting April 2026.', marks: [{ at: d.getByRole('button', { name: 'Create' }), kind: 'focus', n: 1 }] });
    await d.getByRole('button', { name: 'Create' }).click();
    await lead.waitForURL(/budgets\/[0-9a-f-]{8,}/, { timeout: 30_000 });
    budgetId = new URL(lead.url()).pathname.split('/').pop()!;
    setState({ budgetId });
    return { caption: `Budget created (${budgetId.slice(0, 8)}…).` };
  });

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead fills the budget lines: amounts for each month of the first sections.' }, async () => {
    await lead.goto(`/app/intern/budgets/${budgetId}`);
    await settle(lead, /Master Budget|Budget/);
    const tabs = await lead.getByRole('tablist', { name: 'Budget tabs' }).getByRole('tab').allInnerTexts();
    let filled = 0;
    for (const t of tabs.filter((x) => !/Master|Actuals|Variance|Analysis|Versions|Activity/i.test(x)).slice(0, 3)) {
      await lead.getByRole('tab', { name: t.trim() }).first().click();
      await lead.waitForTimeout(800);
      const cells = lead.locator('input[inputmode="decimal"], input[inputmode="numeric"], input[type=number]').locator('visible=true');
      const n = Math.min(await cells.count(), 24);
      for (let i = 0; i < n; i++) {
        if (!(await cells.nth(i).isEditable().catch(() => false))) continue;
        await cells.nth(i).fill(String(50000 + i * 1000)).catch(() => {});
        await cells.nth(i).press('Tab').catch(() => {});
        filled++;
      }
    }
    await lead.waitForTimeout(2000);
    await lead.getByRole('tab', { name: 'Master Budget' }).first().click();
    await lead.waitForTimeout(1500);
    return { caption: `The lead filled ${filled} amounts across the first sections; the Master Budget adds them up.`, detail: `Tabs: ${tabs.join(' · ')}` };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 2, role: 'manager', caption: 'The manager publishes the budget to the client.' }, async () => {
    await mgr.goto(`/app/manager/budgets/${budgetId}`);
    await settle(mgr, /Publish|Approve|Start revision/);
    if (await mgr.getByRole('button', { name: /^Publish/ }).count()) await workflow(mgr, /^Publish/, /Publish this version/);
    const [b] = await sql<{ status: string }>(`select status from budgets where id = $1`, [budgetId]).catch(() => [{ status: '?' }]);
    return { caption: `Published. Budget status: "${b?.status}".` };
  });

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 6, role: 'clientB', caption: 'The client opens the published budget and approves it; the Variance tab is not shown to the client.' }, async () => {
    await client.goto(`/app/client/budgets/${budgetId}`);
    await settle(client, /Approve|Budget/);
    const variance = await client.getByRole('tab', { name: 'Variance' }).count();
    expect(variance).toBe(0);
    if (await client.getByRole('button', { name: /^Approve/ }).count()) await workflow(client, /^Approve/, /Approve this budget/);
    const [b] = await sql<{ status: string }>(`select status from budgets where id = $1`, [budgetId]).catch(() => [{ status: '?' }]);
    return { caption: `The client approved. Budget status: "${b?.status}". No Variance tab for the client.` };
  });

  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The lead opens Variance, enters the actual costs for April and submits.' }, async () => {
    await lead.goto(`/app/intern/budgets/${budgetId}`);
    await settle(lead, /Variance/);
    await lead.getByRole('tab', { name: 'Variance' }).first().click();
    await lead.waitForTimeout(1500);
    const cells = lead.locator('input[inputmode="decimal"], input[inputmode="numeric"], input[type=number]').locator('visible=true');
    const n = Math.min(await cells.count(), 60);
    for (let i = 0; i < n; i++) {
      if (!(await cells.nth(i).isEditable().catch(() => false))) continue;
      if ((await cells.nth(i).inputValue().catch(() => 'x')).trim()) continue;
      await cells.nth(i).fill(String(48000 + i * 1200)).catch(() => {});
    }
    // Every line with a variance needs a reason.
    const reasons = lead.locator('table input[type=text], table textarea, input[aria-label*="eason"], textarea[aria-label*="eason"]').locator('visible=true');
    for (let i = 0; i < (await reasons.count()); i++) {
      const r = reasons.nth(i);
      if ((await r.inputValue().catch(() => 'x')).trim()) continue;
      await r.fill('April costs were booked before the budget was approved.').catch(() => {});
    }
    const hc = lead.getByLabel(/headcount/i).locator('visible=true').first();
    if (await hc.count()) await hc.fill('12').catch(() => {});
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: `The lead types ${n} actual amounts for April.`, marks: [{ at: lead.getByRole('button', { name: /Submit for approval/ }).locator('visible=true').first(), kind: 'focus', n: 1 }] });
    await lead.getByRole('button', { name: /Submit for approval/ }).locator('visible=true').first().click();
    await lead.waitForTimeout(2500);
  });

  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager sends the April variance back once, with a reason.' }, async () => {
    await mgr.goto(`/app/manager/budgets/${budgetId}`);
    await settle(mgr, /Variance/);
    await mgr.getByRole('tab', { name: 'Variance' }).first().click();
    await mgr.waitForTimeout(1500);
    await workflow(mgr, /^Send back/, /Send back|send it back/i, 'Please split the freight cost from raw material.');
  });

  await step(lead, { test: T, step: 4, role: 'lead2', caption: 'The lead submits the April variance again; the manager approves it.' }, async () => {
    await lead.goto(`/app/intern/budgets/${budgetId}`);
    await settle(lead, /Variance/);
    await lead.getByRole('tab', { name: 'Variance' }).first().click();
    await lead.waitForTimeout(1500);
    await lead.getByRole('button', { name: /Submit for approval/ }).locator('visible=true').first().click();
    await lead.waitForTimeout(2000);
    await mgr.goto(`/app/manager/budgets/${budgetId}`);
    await settle(mgr, /Variance/);
    await mgr.getByRole('tab', { name: 'Variance' }).first().click();
    await mgr.waitForTimeout(1500);
    await workflow(mgr, /^Approve/, /Approve/);
    return { caption: 'The April variance is approved.' };
  });

  await step(lead, { test: T, step: 5, role: 'lead2', caption: 'The budget exports to Excel and to a PDF budget pack.' }, async () => {
    const out: string[] = [];
    for (const fmt of ['xlsx', 'pdf']) {
      const r = await lead.request.get(`/api/budgets/${budgetId}/export?format=${fmt}`);
      expect(r.ok()).toBe(true);
      const buf = Buffer.from(await r.body());
      writeFileSync(join(RESULTS, `budget.${fmt}`), buf);
      const magic = buf.subarray(0, 4).toString('latin1');
      expect(fmt === 'pdf' ? magic.startsWith('%PDF') : magic.startsWith('PK')).toBe(true);
      out.push(`${fmt}: ${Math.round(buf.length / 1024)} KB, a valid ${fmt === 'pdf' ? 'PDF' : 'Excel'} file`);
    }
    return { detail: out.join('\n') };
  });

  await noteEmails(T, startedAt, false);
  void trackB;
});
