import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { firstStart, resetRecords, as, closeAll, noteEmails, note, shot, step, state, seen, settle, setState, RESULTS, UAT_DIR } from './helpers/uat';
import { FILES } from './helpers/fill-step';

/** T-15 Labour registers for Kaveri Foods, Karnataka, October 2026, from the 12-employee paysheet. */
const T = 'T-15';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const expected = JSON.parse(readFileSync(join(UAT_DIR, 'fixtures/expected-payroll.json'), 'utf8')) as { gross: number; net: number; pf: number; esi: number; pt: number; employees: number };

test('T-15 Labour registers', async ({ browser }) => {
  const lead = await as(browser, 'lead2');
  let batchUrl = state<{ lrBatchUrl?: string }>().lrBatchUrl;

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead picks Karnataka and Kaveri Foods, and opens the October 2026 batch.' }, async () => {
    if (batchUrl) return { caption: 'The batch is already open.' };
    await lead.goto('/app/intern/labour-registers');
    await settle(lead, /Karnataka/);
    await lead.getByText('Karnataka', { exact: true }).locator('visible=true').first().click();
    await lead.locator('#lr-client').selectOption({ label: 'Kaveri Foods Private Limited' });
    const open = lead.getByRole('button', { name: /Open Karnataka · October 2026/ });
    await shot(lead, { test: T, step: 1, role: 'lead2', status: 'pass', caption: 'Karnataka is selected and the client is Kaveri Foods.', marks: [{ at: lead.getByText('Karnataka', { exact: true }).locator('visible=true').first(), kind: 'focus', n: 1 }, { at: open, kind: 'focus', n: 2 }] });
    await open.click();
    await lead.waitForURL(/batch=/, { timeout: 30_000 });
    batchUrl = new URL(lead.url()).pathname + new URL(lead.url()).search;
    setState({ lrBatchUrl: batchUrl });
    return { caption: 'The October 2026 batch for Kaveri Foods is open.' };
  });

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead uploads the paysheet (12 employees, October 2026).' }, async () => {
    await lead.goto(batchUrl!);
    await settle(lead, /Paysheet/);
    const slot = lead.locator('xpath=//*[normalize-space(.)="Paysheet"]/ancestor::*[.//input[@type="file"]][1]').first();
    // A re-run replaces the file with the current sheet.
    await slot.locator('input[type=file]').setInputFiles(join(FILES, 'paysheet-oct-2026.xlsx'));
    await lead.waitForTimeout(4000);
    await settle(lead, /paysheet-oct-2026/);
    return { marks: [{ at: seen(lead, /paysheet-oct-2026/), kind: 'ok', n: 1 }] };
  });

  await step(lead, { test: T, step: 2, role: 'lead2', caption: 'The lead checks the column matching and confirms it.' }, async () => {
    const cols = lead.getByRole('link', { name: /Columns/ }).locator('visible=true').first();
    if (await cols.count()) {
      await cols.click();
      await settle(lead, /Confirm all and save|Column for|columns/);
      const head = await lead.getByRole('heading').first().innerText().catch(() => '');
      await shot(lead, { test: T, step: 2, role: 'lead2', status: 'pass', caption: `The column check reads: "${head}".`, marks: [{ at: lead.getByRole('heading').first(), kind: 'focus', n: 1 }] });
      const confirm = lead.getByRole('button', { name: /Confirm all and save/ });
      if ((await confirm.count()) && (await confirm.isEnabled())) await confirm.click();
      await lead.waitForTimeout(2500);
    }
    await lead.goto(batchUrl!);
    await settle(lead, /Paysheet/);
  });

  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The lead clicks "Mark as ready": the readiness check lists what Karnataka\'s registers still need, and refuses to generate.' }, async () => {
    await lead.getByRole('button', { name: /^Mark as ready/ }).locator('visible=true').first().click();
    const d = lead.getByRole('dialog');
    await d.waitFor();
    const items = (await d.locator('li, [role=listitem], div > p').allInnerTexts()).map((x) => x.trim()).filter((x) => x.length > 8).slice(0, 10);
    const gen = d.getByRole('button', { name: /Mark as ready & generate/ });
    const blocked = !(await gen.isEnabled());
    expect(blocked).toBe(true);
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: 'The check refuses to close the period: no attendance sheet, no leave sheet, unmapped required columns and no minimum-wage decision for the 12 employees.', marks: [{ at: d.getByText(/cannot be closed/).first(), kind: 'ok', n: 1 }, { at: gen, kind: 'focus', n: 2, label: 'Disabled until resolved' }] });
    await d.getByRole('button', { name: 'Cancel' }).click();
    return { caption: 'The readiness gate works: generation stays disabled until the inputs are complete.', detail: items.join('\n') };
  });

  note({
    test: T, step: 3, status: 'blocked',
    caption: 'Generating and downloading the registers, and comparing their totals, was not completed in this run.',
    detail: 'Karnataka needs a daily attendance sheet (Form T muster roll), a leave sheet (Forms F and H), 13 required columns mapped and a minimum-wage coverage decision for each employee before it generates. Do this once with the client\'s real October attendance and leave files; the expected paysheet totals are below for the check.',
  });

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'The client opens Labour registers in the portal.' }, async () => {
    await client.goto('/app/client/labour-registers');
    await settle(client);
    await client.waitForTimeout(1500);
    return { caption: 'The client\'s Labour registers page opens; registers appear here once the period is generated.' };
  });

  note({ test: T, step: 4, status: 'info', caption: `Expected totals for October 2026, worked out by hand from the sheet: gross ₹${expected.gross.toLocaleString('en-IN')}, PF ₹${expected.pf.toLocaleString('en-IN')}, ESI ₹${expected.esi.toLocaleString('en-IN')}, PT ₹${expected.pt.toLocaleString('en-IN')}, net ₹${expected.net.toLocaleString('en-IN')} for ${expected.employees} employees.` });
  await noteEmails(T, startedAt, false);
});
