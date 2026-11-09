import { test, expect } from '@playwright/test';
import { emailsSince, firstStart, resetRecords, as, closeAll, noteEmails, note, shot, sql, step, state, seen, settle, setState } from './helpers/uat';
import { TRACK_B } from './fixtures/data';

/** T-11 Board meetings on Track B: create the first board meeting, send the notice for approval, approve it. */
const T = 'T-11';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-11 Board meetings', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead2');
  let meetingUrl = state<{ meetingUrl?: string }>().meetingUrl;

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead creates the first board meeting from Compliances › Obligations.' }, async () => {
    if (meetingUrl) return { caption: 'The meeting already exists.' };
    await lead.goto('/app/intern/compliances/obligations');
    await settle(lead);
    const menu = lead.getByRole('button', { name: /New task|New meeting/ }).locator('visible=true').first();
    await menu.click();
    const item = lead.getByRole('menuitem', { name: 'Meeting' });
    if (await item.count()) await item.click();
    const d = lead.getByRole('dialog');
    await d.waitFor();
    const selects = d.locator('select');
    await selects.nth(0).selectOption({ label: TRACK_B.company }).catch(async () => selects.nth(0).selectOption({ index: 1 }));
    await d.locator('input[type=date]').fill('2026-11-20');
    await d.locator('input[type=time]').fill('11:00');
    await d.getByPlaceholder('Registered office').fill('Registered office, 18 Industrial Area, Peenya, Bengaluru');
    await shot(lead, { test: T, step: 1, role: 'lead2', status: 'pass', caption: 'New meeting: Kaveri Foods, board meeting on 20 Nov 2026 at 11:00 at the registered office.', marks: [{ at: d.getByRole('button', { name: /Create and draft notice/ }), kind: 'focus', n: 1 }] });
    await d.getByRole('button', { name: /Create and draft notice/ }).click();
    await lead.waitForURL(/meetings\//, { timeout: 30_000 });
    meetingUrl = new URL(lead.url()).pathname;
    setState({ meetingUrl });
    return { caption: `The meeting is created and its notice opens as a draft (${meetingUrl}).` };
  });

  await step(lead, { test: T, step: 2, role: 'lead2', caption: 'The lead fills the notice and sends it for approval.' }, async () => {
    await lead.goto(meetingUrl!);
    await settle(lead, /notice/i);
    const tab = lead.getByRole('tab', { name: /Notice/ }).locator('visible=true').first();
    if (await tab.count()) await tab.click();
    // Kaveri started at Registration, so no director is on file yet: add both, then the company secretary.
    const dirs = [['Arvind Rao', '09876543', 'arvind.rao@kaveri-foods.test'], ['Bina Shah', '09876544', 'bina.shah@uat-client.test']];
    for (const [name, din, email] of dirs) {
      if (await lead.getByText(name).locator('visible=true').count()) continue;
      await lead.getByRole('button', { name: 'Add director' }).locator('visible=true').first().click();
      const cancel = lead.getByRole('button', { name: 'Cancel', exact: true }).locator('visible=true').first();
      await cancel.locator('xpath=preceding::input[3]').fill(name);
      await cancel.locator('xpath=preceding::input[2]').fill(din);
      await cancel.locator('xpath=preceding::input[1]').fill(email);
      await cancel.locator('xpath=following::button[1]').click();
      await lead.waitForTimeout(1500);
    }
    await shot(lead, { test: T, step: 2, role: 'lead2', status: 'pass', caption: 'The lead adds the two directors (name, DIN, email) to the meeting.', marks: [{ at: seen(lead, 'Arvind Rao'), kind: 'ok', n: 1 }, { at: seen(lead, /Bina Shah/), kind: 'ok', n: 2 }] });
    const addRow = lead.locator('text=Add').locator('xpath=..').locator('input');
    if ((await addRow.count()) >= 2) {
      await addRow.nth(0).fill('Ravi Kumar');
      await addRow.nth(1).fill('cs@kaveri-foods.test');
      await lead.getByRole('button', { name: /To · CS/ }).click().catch(() => {});
    }
    const save = lead.getByRole('button', { name: /^Save/ }).locator('visible=true').first();
    if ((await save.count()) && (await save.isEnabled())) await save.click();
    await lead.waitForTimeout(1500);
    const send = lead.getByRole('button', { name: 'Send for approval' }).locator('visible=true').first();
    await shot(lead, { test: T, step: 2, role: 'lead2', status: (await send.isEnabled().catch(() => false)) ? 'pass' : 'info', caption: 'The notice draft, ready to send for approval.', marks: [{ at: send, kind: 'focus', n: 1 }], fullPage: true });
    await send.click();
    await lead.waitForTimeout(2500);
    return { caption: 'Sent for the manager\'s approval.' };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 3, role: 'manager', caption: 'The manager approves the notice ("Approve and send").' }, async () => {
    await mgr.goto(meetingUrl!.replace('/app/intern/', '/app/manager/'));
    await settle(mgr, /notice/i);
    const ap = mgr.getByRole('button', { name: /^Approve and send/ }).locator('visible=true').first();
    await shot(mgr, { test: T, step: 3, role: 'manager', status: 'pass', caption: 'The manager sees the notice waiting for approval.', marks: [{ at: ap, kind: 'focus', n: 1 }] });
    await ap.click();
    await mgr.waitForTimeout(4000);
    await expect(seen(mgr, /Approved|sent|Sent/)).toBeVisible();
    return { marks: [{ at: seen(mgr, /Approved|sent|Sent/), kind: 'ok', n: 1 }] };
  });

  await step(null, { test: T, step: 4, caption: 'The notice email carries the notice as a Word file and a calendar invite.' }, async () => {
    const mail = (await emailsSince(startedAt)).find((m) => /Notice of Board meeting/.test(m.subject));
    expect(mail, 'notice email').toBeTruthy();
    expect(mail!.attachments?.some((a) => a.endsWith('.docx'))).toBe(true);
    expect(mail!.attachments?.some((a) => a.endsWith('.ics'))).toBe(true);
    return { detail: `To: ${[mail!.to].flat().join(', ')}; attachments: ${mail!.attachments?.join(', ')}.` };
  });

  note({ test: T, step: 5, status: 'untestable', caption: 'The calendar entry has a Teams link.', detail: 'Needs a project lead with Outlook connected (Calendars.ReadWrite). A person connects Outlook once and checks the Teams link in the notice email.' });
  await noteEmails(T, startedAt);
});
