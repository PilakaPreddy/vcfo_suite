import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, noteEmails, shot, step, state, seen, settle } from './helpers/uat';
import { runStep } from './helpers/fill-step';
import { TRACK_A } from './fixtures/data';

/** T-05 SPICe+ checklist (Part B) on Track A: capital, office, directors, subscribers. */
const T = 'T-05';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-05 SPICe+ checklist (Part B)', async ({ browser }) => {
  const { trackA } = state<{ trackA: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead');
  const o = { test: T, role: 'lead' as const, engagement: trackA };

  await runStep(lead, { ...o, stepNo: 1, itemId: 'pre-13', slug: 'capital-structure', title: 'Capital Structure', plan: { choices: { 'Equity': 'Yes', 'Preference': 'No' } } });
  await runStep(lead, { ...o, stepNo: 2, itemId: 'pre-14', slug: 'registered-office-address', title: 'Registered Office Address', plan: { values: { addressLine1: TRACK_A.office.line1, city: TRACK_A.office.city, pincode: TRACK_A.office.pin }, file: 'office-noc.pdf' } });
  await runStep(lead, { ...o, stepNo: 3, itemId: 'pre-15', slug: 'proposed-directors', title: 'Proposed Directors', plan: { file: 'pan-kiran.pdf' } });
  await runStep(lead, { ...o, stepNo: 4, itemId: 'pre-16', slug: 'subscriber-details', title: 'Subscriber Details', plan: { file: 'address-proof-kiran.pdf' } });

  const client = await as(browser, 'client');
  await step(client, { test: T, step: 5, role: 'client', caption: 'The client opens a step that is not yet open (SPICe+ Confirmation), and it is locked.' }, async () => {
    await client.goto('/app/client/incorporation/step/spice-part-b-confirmation');
    await settle(client);
    const body = await client.locator('body').innerText();
    expect(body).toMatch(/locked|not yet|opens after|complete .* first|waiting/i);
    return { marks: [{ at: seen(client, /locked|not yet|opens after|first|waiting/i), kind: 'ok', n: 1 }] };
  });

  await step(client, { test: T, step: 6, role: 'client', caption: 'The progress value is the same for the client, the lead and the manager.' }, async () => {
    await client.goto('/app/client/incorporation');
    await settle(client);
    const c = (await client.locator('body').innerText()).match(/(\d+)\s*\/\s*14/)?.[0];
    const mgr = await as(browser, 'manager');
    await mgr.goto('/app/manager/projects');
    await settle(mgr, TRACK_A.short);
    const row = mgr.locator('tr, [role=row]').filter({ hasText: TRACK_A.short }).locator('visible=true').first();
    const m = (await row.innerText()).match(/(\d+)\s*%/)?.[0];
    await shot(mgr, { test: T, step: 6, role: 'manager', status: 'info', caption: `The manager's project list shows ${m} for ${TRACK_A.short}.`, marks: [{ at: row, kind: 'focus', n: 1 }] });
    return { caption: `The client's sidebar shows Incorporation ${c}; the manager's list shows ${m}.`, detail: 'Different units (steps done of 14 versus percent of the whole project) — compared by hand in the report.', marks: [{ at: seen(client, /\d+\s*\/\s*14/), kind: 'focus', n: 1 }] };
  });

  await noteEmails(T, startedAt, false);
});
