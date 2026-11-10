import { test, expect, type Page } from '@playwright/test';
import { stepState, firstStart, seen, settle, resetRecords, as, closeAll, noteEmails, shot, sql, step, state } from './helpers/uat';
import { TRACK_A } from './fixtures/data';

/** T-04 Client questionnaire (Part A, step pre-1) on Track A. */
const T = 'T-04';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const CLIENT_URL = '/app/client/incorporation/step/name-application';
const tab = (page: Page, name: string) => page.getByRole('tab', { name }).locator('visible=true').first();

async function fill(page: Page, id: string, value: string) {
  const el = page.locator(`#pre-1-${id}`).locator('visible=true').first();
  // Some fields start with a default; clear them the way a person does, then type.
  await el.click();
  await el.press('Control+A');
  await el.press('Delete');
  if (value) await el.pressSequentially(value, { delay: 15 });
  await expect(el).toHaveValue(new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
}

test('T-04 Client questionnaire (Part A)', async ({ browser }) => {
  const { trackA } = state<{ trackA: { id: string; slug: string } }>();
  const client = await as(browser, 'client');

  await step(client, { test: T, step: 1, role: 'client', caption: 'The client opens Incorporation and fills the business description and the two proposed names.' }, async () => {
    await client.goto(CLIENT_URL);
    await settle(client, /Business Description/);
    await tab(client, 'Business Description').click();
    await fill(client, 'businessDescription', 'Software analytics for retail chains: demand forecasting, store dashboards and data engineering services.');
    await tab(client, 'Proposed Company Names').click();
    await fill(client, 'proposedName1', 'Nilgiri Analytics Private Limited');
    await fill(client, 'proposedName2', 'Nilgiri Insights Private Limited');
    return { marks: [{ at: client.locator('#pre-1-proposedName1'), kind: 'focus', n: 1 }, { at: client.locator('#pre-1-proposedName2'), kind: 'focus', n: 2 }] };
  });

  await step(client, { test: T, step: 1, role: 'client', caption: 'The client adds two proposed directors with gender and residency.' }, async () => {
    await tab(client, 'Proposed Directors').click();
    const two = client.getByRole('radio', { name: '2', exact: true }).locator('visible=true').first();
    if (await two.count()) await two.click();
    for (const [n, d] of TRACK_A.directors.entries()) {
      await fill(client, `director${n + 1}FirstName`, d.first);
      await fill(client, `director${n + 1}LastName`, d.last);
      await client.getByRole('radio', { name: n === 0 ? 'Male' : 'Female', exact: true }).locator('visible=true').nth(n).click();
      await client.getByRole('radio', { name: 'Yes', exact: true }).locator('visible=true').nth(n).click();
    }
    return { marks: [{ at: client.locator('#pre-1-director1FirstName'), kind: 'focus', n: 1 }, { at: client.locator('#pre-1-director2FirstName'), kind: 'focus', n: 2 }] };
  });

  await step(client, { test: T, step: 2, role: 'client', caption: 'With one required field empty (paid-up capital), Submit is refused.' }, async () => {
    await tab(client, 'Proposed Share Capital Structure').click();
    await fill(client, 'authorisedShareCapital', String(TRACK_A.authorisedCapital));
    await fill(client, 'paidUpShareCapital', '');
    await fill(client, 'nominalValuePerEquityShare', String(TRACK_A.faceValue));
    const submit = client.getByRole('button', { name: /^Submit/ }).locator('visible=true').first();
    if (await submit.isEnabled()) await submit.click();
    await client.waitForTimeout(1500);
    const row = await stepState(trackA.id, 'pre-1');
    expect(row?.status ?? 'not-started').not.toMatch(/completed|submitted/);
    const alert = client.getByRole('alert').locator('visible=true').first();
    return {
      caption: `Submit is refused while paid-up capital is empty (step status stays "${row?.status ?? 'not started'}").`,
      marks: [{ at: client.locator('#pre-1-paidUpShareCapital'), kind: 'bad', label: 'Required field left empty' }, { at: alert, kind: 'ok', n: 1 }],
    };
  });

  await step(client, { test: T, step: 4, role: 'client', caption: 'The client completes the capital and submits Part A.' }, async () => {
    await client.keyboard.press('Escape').catch(() => {});
    await tab(client, 'Proposed Share Capital Structure').click();
    await fill(client, 'paidUpShareCapital', String(TRACK_A.paidUpCapital));
    await client.waitForTimeout(800);
    const submit = client.getByRole('button', { name: /^Submit/ }).locator('visible=true').first();
    await submit.click();
    await client.waitForTimeout(2500);
    await shot(client, { test: T, step: 4, role: 'client', status: 'info', caption: 'The page right after the client clicks Submit.' });
    const row = await stepState(trackA.id, 'pre-1');
    expect(Boolean(row.clientSubmittedAt || row.waitingOnLeadByName)).toBe(true);
    expect(row?.status).toBe('in-progress');
    return {
      caption: `The client's part is submitted: "Details submitted. Your project lead adds the NIC codes, then this step is complete." The step stays "${row.status}" until the lead adds the NIC code.`,
      marks: [{ at: client.getByRole('dialog').locator('visible=true').first(), kind: 'ok', n: 1 }],
    };
  });

  await step(client, { test: T, step: 4, role: 'client', caption: 'The answers are still there after a page reload.' }, async () => {
    await client.goto(CLIENT_URL);
    await settle(client, /Business Description/);
    await tab(client, 'Proposed Company Names').click();
    await expect(client.locator('#pre-1-proposedName1').locator('visible=true').first()).toHaveValue('Nilgiri Analytics Private Limited');
    return { marks: [{ at: client.locator('#pre-1-proposedName1'), kind: 'ok', n: 1, label: 'Saved' }] };
  });

  const lead = await as(browser, 'lead');
  await step(lead, { test: T, step: 3, role: 'lead', caption: 'The lead opens the same step, sees the client\'s answers and adds the NIC code 62011; the business type fills in by itself.' }, async () => {
    await lead.goto(`/app/intern/engagements/${trackA.slug}/step/name-application`);
    await settle(lead, /Business Description/);
    await tab(lead, 'Proposed Company Names').click();
    await expect(seen(lead, 'Nilgiri Insights Private Limited')).toBeVisible();
    await shot(lead, { test: T, step: 3, role: 'lead', status: 'pass', caption: 'The lead sees the names the client typed, and a note: "Kiran Rao submitted their part. Fill the NIC codes, then submit to complete this step."', marks: [{ at: seen(lead, 'Kiran Rao submitted their part'), kind: 'ok', n: 1 }, { at: seen(lead, 'Nilgiri Insights Private Limited'), kind: 'ok', n: 2 }] });
    await tab(lead, 'NIC Codes').click();
    const nic = lead.locator('#pre-1-nicCode').locator('visible=true').first();
    if (await nic.isEditable()) await nic.fill(TRACK_A.nicCode);
    await lead.waitForTimeout(1500);
    const bt = lead.locator('#pre-1-nicBusinessType').locator('visible=true').first();
    const btVal = (await bt.inputValue().catch(() => '')) || (await bt.innerText().catch(() => ''));
    expect(btVal.toLowerCase()).toContain(TRACK_A.nicWords);
    return { caption: `NIC 62011 entered; business type reads "${btVal.slice(0, 80)}".`, marks: [{ at: nic, kind: 'focus', n: 1 }, { at: bt, kind: 'ok', n: 2 }] };
  });

  await step(lead, { test: T, step: 5, role: 'lead', caption: 'The lead submits the step with the NIC code, which completes it.' }, async () => {
    const submit = lead.getByRole('button', { name: /^Submit/ }).locator('visible=true').first();
    await submit.click();
    await lead.waitForTimeout(2500);
    const ok = lead.getByRole('button', { name: 'OK' }).locator('visible=true').first();
    await shot(lead, { test: T, step: 5, role: 'lead', status: 'info', caption: 'The page right after the lead clicks Submit.' });
    if (await ok.count()) await ok.click();
    const row = await stepState(trackA.id, 'pre-1');
    expect(JSON.stringify(row)).toContain(`"nicCode":"${TRACK_A.nicCode}"`);
    expect(row.status).toBe('completed');
    await lead.reload();
    await settle(lead, /Client Details/);
    return { caption: `The NIC code is saved and step 1 "Client Details" is now ${row.status}.`, marks: [{ at: seen(lead, /Completed|Done/), kind: 'ok', n: 1 }] };
  });

  await noteEmails(T, startedAt, false);
  void seen;
});
