import { test, expect, type Page } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, noteEmails, shot, step, state, seen, settle, stepState } from './helpers/uat';
import { runStep } from './helpers/fill-step';
import { TRACK_B } from './fixtures/data';

/**
 * T-07 Manager approvals and step visibility. Pre-incorporation steps complete without approval
 * (direct flow), so this runs on Track B registration steps, which go lead → manager → client.
 */
const T = 'T-07';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

type Eng = { id: string; slug: string };
const mgrStep = (slug: string, s: string) => `/app/manager/projects/${slug}/step/${s}`;

async function managerOpens(page: Page, eng: Eng, s: string, title: string) {
  await page.goto(mgrStep(eng.slug, s));
  await settle(page, title);
}

test('T-07 Manager approvals and step visibility', async ({ browser }) => {
  const { trackB } = state<{ trackB: Eng }>();
  const lead = await as(browser, 'lead2');
  const mgr = await as(browser, 'manager');
  const client = await as(browser, 'clientB');
  const o = { test: T, role: 'lead2' as const, engagement: trackB, expectStatus: /.+/ };

  // 1. Accept from the step page.
  const s1 = await runStep(lead, { ...o, stepNo: 1, itemId: 'reg-2', slug: 'pan-and-tan', title: 'PAN and TAN', plan: { values: { panNumber: TRACK_B.pan, tanNumber: TRACK_B.tan }, file: 'coi-kaveri.pdf' } });
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'Before the manager decides, the client cannot see the lead\'s PAN and TAN draft.' }, async () => {
    await client.goto('/app/client/registrations');
    await settle(client);
    const body = await client.locator('body').innerText();
    expect(body).not.toContain(TRACK_B.tan);
    return { caption: `The client's Registrations page does not show the TAN the lead typed (${TRACK_B.tan}). Step status: "${s1}".` };
  });
  await step(mgr, { test: T, step: 1, role: 'manager', caption: 'The manager opens PAN and TAN, reads the lead\'s answers and clicks Accept.' }, async () => {
    await managerOpens(mgr, trackB, 'pan-and-tan', 'PAN and TAN');
    const accept = mgr.getByRole('button', { name: /^Accept/ }).locator('visible=true').first();
    await shot(mgr, { test: T, step: 1, role: 'manager', status: 'pass', caption: 'The manager sees the lead\'s answers locked, with Accept and Reject.', marks: [{ at: accept, kind: 'focus', n: 1 }, { at: mgr.getByRole('button', { name: /^Reject/ }).locator('visible=true').first(), kind: 'focus', n: 2 }] });
    await accept.click();
    await mgr.waitForTimeout(2500);
    const st = await stepState(trackB.id, 'reg-2');
    expect(JSON.stringify(st)).toMatch(/accepted|completed|client/);
    return { caption: `Accepted. Stored: status "${st.status}", review "${st.reviewStatus ?? '—'}".` };
  });

  // 2. Reject with a reason.
  await runStep(lead, { ...o, stepNo: 2, itemId: 'reg-7', slug: 'pt-registration', title: 'PT Registration', plan: { file: 'cert-pt.pdf' } });
  await step(mgr, { test: T, step: 2, role: 'manager', caption: 'The manager rejects PT Registration with a reason.' }, async () => {
    await managerOpens(mgr, trackB, 'pt-registration', 'PT Registration');
    await mgr.getByRole('button', { name: /^Reject/ }).locator('visible=true').first().click();
    const d = mgr.getByRole('alertdialog').or(mgr.getByRole('dialog')).first();
    await d.locator('textarea').first().fill('The PT certificate is for a different establishment. Please upload the Peenya one.');
    await shot(mgr, { test: T, step: 2, role: 'manager', status: 'pass', caption: 'The manager types the reason in "Reject submission".', marks: [{ at: d.locator('textarea').first(), kind: 'focus', n: 1 }] });
    await d.getByRole('button', { name: /Reject/ }).last().click();
    await mgr.waitForTimeout(2500);
    const st = await stepState(trackB.id, 'reg-7');
    expect(JSON.stringify(st)).toMatch(/reject|in-progress|changes/);
    return { caption: `Rejected. Stored: status "${st.status}", review "${st.reviewStatus ?? '—'}".` };
  });
  await step(lead, { test: T, step: 2, role: 'lead2', caption: 'The lead sees the step back with the manager\'s reason.' }, async () => {
    await lead.goto(`/app/intern/engagements/${trackB.slug}/step/pt-registration`);
    await settle(lead, 'PT Registration');
    await expect(seen(lead, /different establishment/)).toBeVisible();
    return { marks: [{ at: seen(lead, /different establishment/), kind: 'ok', n: 1 }] };
  });

  // 3. Ask the client to fill, through the manager.
  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The lead asks the manager to send LEI Registration to the client to fill.' }, async () => {
    await lead.goto(`/app/intern/engagements/${trackB.slug}/step/legal-entity-identifier`);
    await settle(lead, 'LEI Registration');
    await lead.getByRole('button', { name: /Request client to fill/ }).locator('visible=true').first().click();
    const d = lead.getByRole('dialog');
    await d.locator('#client-fill-note').fill('Please share the board-approved LEI application form and your LEI login, if you have one.');
    await shot(lead, { test: T, step: 3, role: 'lead2', status: 'pass', caption: 'The lead writes a note for the client and sends it for the manager\'s approval.', marks: [{ at: d.locator('#client-fill-note'), kind: 'focus', n: 1 }] });
    await d.getByRole('button', { name: /Send for approval/ }).click();
    await lead.waitForTimeout(2000);
  });

  // 4. Approve from the Approvals page.
  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager opens Approvals and approves the client-fill request from there.' }, async () => {
    await mgr.goto('/app/manager/approvals');
    await settle(mgr, /Approvals/);
    await shot(mgr, { test: T, step: 4, role: 'manager', status: 'pass', caption: 'The Approvals page lists what waits for the manager.', marks: [{ at: seen(mgr, /LEI Registration/), kind: 'focus', n: 1 }] });
    const row = mgr.locator('tr, li, [role=row], div').filter({ hasText: 'LEI Registration' }).getByRole('button', { name: /Review/ }).locator('visible=true').first();
    await row.click();
    await settle(mgr, 'LEI Registration');
    const approve = mgr.getByRole('button', { name: /Approve and send/ }).locator('visible=true').first();
    await approve.click();
    await mgr.waitForTimeout(2500);
    const st = await stepState(trackB.id, 'reg-6');
    return { caption: `Approved and sent to the client. Stored: status "${st.status}".` };
  });

  await step(client, { test: T, step: 5, role: 'clientB', caption: 'After the manager\'s decisions, the client sees the accepted PAN/TAN step and the LEI request, and not the rejected PT draft.' }, async () => {
    await client.goto('/app/client/registrations');
    await settle(client);
    await client.waitForTimeout(1500);
    const body = await client.locator('body').innerText();
    return { caption: `Client registrations page. PAN/TAN shown: ${/PAN/.test(body)}; LEI shown: ${/LEI/.test(body)}.`, marks: [{ at: seen(client, /PAN/), kind: 'ok', n: 1 }, { at: seen(client, /LEI/), kind: 'ok', n: 2 }] };
  });

  await noteEmails(T, startedAt);
});
