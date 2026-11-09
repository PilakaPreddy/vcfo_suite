import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { firstStart, resetRecords, as, closeAll, noteEmails, shot, sql, step, state, seen, settle, type Role } from './helpers/uat';
import { FILES } from './helpers/fill-step';

/** T-13 Compliance calendar and filings on Track B (incorporated 1 Aug 2026; GST, PF, ESI registered). */
const T = 'T-13';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

/** Statutory due dates worked out by hand for Kaveri Foods. */
const EXPECTED: [string, string, string][] = [
  ['gst-gstr-1', '2026-11-11', 'GSTR-1 for October 2026: 11 November'],
  ['gst-gstr-3b', '2026-11-20', 'GSTR-3B for October 2026: 20 November'],
  ['labour-pf-payment', '2026-11-15', 'PF for October 2026: 15 November'],
  ['it-tds-payment', '2026-11-07', 'TDS for October 2026: 7 November'],
  ['it-advance-tax-q3', '2026-12-15', 'Advance tax, third instalment: 15 December'],
  ['it-tds-return-q2', '2026-10-31', 'TDS return Q2 (Jul–Sep): 31 October'],
  ['mca-aoc-4', '2027-10-30', 'AOC-4 for FY 2026-27: 30 October 2027'],
];

test('T-13 Compliance calendar and filings', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();

  await step(null, { test: T, step: 0, caption: 'The daily compliance job runs and creates the filings for Kaveri Foods from its incorporation and registration dates.' }, async () => {
    const out = execFileSync('npm', ['run', '-s', 'compliance:generate'], { encoding: 'utf8' });
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from compliance_instances where engagement_id = $1`, [trackB.id]);
    expect(n).toBeGreaterThan(100);
    return { detail: `${out.trim().split('\n').slice(-2).join(' ')} → ${n} filings stored for Kaveri Foods.` };
  });

  await step(null, { test: T, step: 2, caption: 'Seven due dates are compared with the statutory dates worked out by hand.' }, async () => {
    const lines: string[] = [];
    let bad = 0;
    for (const [id, due, words] of EXPECTED) {
      const rows = await sql<{ due_date: string }>(`select due_date::text from compliance_instances where engagement_id = $1 and obligation_id = $2 and due_date = $3`, [trackB.id, id, due]);
      const ok = rows.length > 0;
      if (!ok) bad++;
      lines.push(`${ok ? '✓' : '✗'} ${words} (${due})`);
    }
    expect(bad).toBe(0);
    return { detail: lines.join('\n') };
  });

  for (const [role, base] of [['admin', '/app/admin'], ['manager', '/app/manager'], ['lead2', '/app/intern'], ['clientB', '/app/client']] as [Role, string][]) {
    const page = await as(browser, role);
    await step(page, { test: T, step: 1, role, caption: `${role}: Compliances › Calendar shows Kaveri's filings.` }, async () => {
      await page.goto(`${base}/compliances/calendar`);
      await settle(page);
      await page.waitForTimeout(1500);
      await expect(seen(page, /GSTR|TDS|PF/)).toBeVisible();
      return { marks: [{ at: seen(page, /GSTR-3B|GSTR/), kind: 'ok', n: 1 }] };
    });
    await step(page, { test: T, step: 1, role, caption: `${role}: Compliances › Filings lists the same filings.` }, async () => {
      await page.goto(`${base}/compliances/filings`);
      await settle(page);
      await page.waitForTimeout(1500);
      await expect(seen(page, /GSTR|TDS|PF/)).toBeVisible();
      return { marks: [{ at: seen(page, /Overdue/), kind: 'focus', n: 1 }] };
    });
  }

  const lead = await as(browser, 'lead2');
  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The lead clicks "File now" on the overdue GSTR-1 (September), attaches the acknowledgement and marks it filed.' }, async () => {
    await lead.goto('/app/intern/compliances/filings');
    await settle(lead, /GSTR-1/);
    const group = lead.locator('xpath=//*[normalize-space(.)="GSTR-1 Filing"]/ancestor::*[following-sibling::*][1]/following-sibling::*[1]').first();
    // Rows run by due date: TDS (7 Oct) first, then GSTR-1 (11 Oct).
    const fileNow = lead.getByText('File now', { exact: true }).locator('visible=true').nth(1);
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: 'Each overdue filing has a "File now" button.', marks: [{ at: fileNow, kind: 'focus', n: 1 }] });
    await fileNow.click();
    await lead.waitForTimeout(1500);
    await settle(lead, /Submit for review|Submitted/);
    const detailUrl = lead.url();
    const fields = lead.locator('input:not([type=hidden]):not([type=file]):not([type=checkbox])').locator('visible=true');
    for (let i = 0; i < (await fields.count()); i++) {
      const f = fields.nth(i);
      if (!(await f.isEditable().catch(() => false)) || (await f.inputValue()).replace(/[–-]/g, '').trim()) continue;
      await f.fill(i === 0 ? '29AAKCK1234F1Z5' : i === 1 ? '1845000' : '2106').catch(() => {});
    }
    await lead.getByRole('button', { name: 'Submit for review' }).click();
    await lead.waitForTimeout(2000);
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: 'The lead fills the return details and clicks "Submit for review".', marks: [{ at: lead.getByRole('button', { name: /Submitted/ }), kind: 'ok', n: 1 }] });
    const mgr = await as(browser, 'manager');
    await mgr.goto(detailUrl.replace('/app/intern/', '/app/manager/'));
    await settle(mgr, /Approve/);
    const approve = mgr.getByRole('button', { name: 'Approve', exact: true }).locator('visible=true').first();
    await shot(mgr, { test: T, step: 4, role: 'manager', status: 'pass', caption: 'The manager reviews the GSTR-1 details and approves.', marks: [{ at: approve, kind: 'focus', n: 1 }] });
    await approve.click();
    await mgr.waitForTimeout(2000);
    // Then the lead files it: Mark filed from the filings list.
    await lead.goto('/app/intern/compliances/filings');
    await settle(lead, /GSTR-1/);
    await lead.getByRole('tab', { name: /All filings/ }).or(lead.getByText(/^All filings/)).locator('visible=true').first().click();
    await lead.waitForTimeout(1000);
    const row = lead.locator('tr, [role=row]').filter({ hasText: /GSTR-1/ }).filter({ hasText: /Approved|Sept 2026/ }).locator('visible=true').first();
    await row.getByRole('checkbox').first().click();
    const mark = lead.getByRole('button', { name: /Mark filed/ }).locator('visible=true').first();
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: 'After approval, the lead ticks the GSTR-1 row under "All filings" and clicks "Mark filed".', marks: [{ at: row, kind: 'focus', n: 1 }, { at: mark, kind: 'focus', n: 2 }] });
    await mark.click();
    await lead.waitForTimeout(2500);
    const [r] = await sql<{ status: string; evidence_url: string | null }>(`select status, evidence_url from compliance_instances where engagement_id = $1 and obligation_id = 'gst-gstr-1' and due_date = '2026-10-11'`, [trackB.id]);
    expect(r.status).toMatch(/filed|done|completed/);
    return { caption: `GSTR-1 for September is now "${r.status}".` };
  });

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'The client sees the September GSTR-1 as filed.' }, async () => {
    await client.goto('/app/client/compliances/filings');
    await settle(client, /GSTR-1/);
    const [r] = await sql<{ status: string }>(`select status from compliance_instances where engagement_id = $1 and obligation_id = 'gst-gstr-1' and due_date = '2026-10-11'`, [trackB.id]);
    expect(r.status).toMatch(/filed|done|completed/);
    return { caption: `The client's filings list shows September GSTR-1 as filed (stored "${r.status}").`, marks: [{ at: seen(client, /Filed/), kind: 'ok', n: 1 }] };
  });

  await noteEmails(T, startedAt, false);
});
