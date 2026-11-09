import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, noteEmails, sql, step, state, seen, settle } from './helpers/uat';
import { runStep } from './helpers/fill-step';
import { TRACK_B } from './fixtures/data';

/**
 * T-10 Incorporation close (CIN) and stage change, on Track B: the lead records the certificate of
 * incorporation (CIN U15400KA2026PTC123456, 1 Aug 2026). The app copies the date to the project.
 */
const T = 'T-10';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-10 Incorporation close (CIN) and stage change', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead2');

  await runStep(lead, {
    test: T, stepNo: 1, role: 'lead2', engagement: trackB, itemId: 'pre-12', slug: 'certificate-of-incorporation-sharing', title: 'Certificate of Incorporation',
    plan: {
      file: 'coi-kaveri.pdf',
      values: { incorporatedCompanyName: TRACK_B.company, dateOfIncorporation: TRACK_B.incorporatedOn, cin: TRACK_B.cin, pan: TRACK_B.pan, tan: TRACK_B.tan, pfCode: 'KNBNG2654321000', esiCode: '53000123450001001' },
      choices: { 'signature': 'Yes', 'verified': 'Yes' },
    },
  });

  await step(null, { test: T, step: 2, caption: 'The project now carries the incorporation date and CIN from the certificate.' }, async () => {
    const [row] = await sql<{ incorporation_date: string | null; stage: string }>(`select incorporation_date::text, stage from engagements where id = $1`, [trackB.id]);
    expect(row.incorporation_date).toBe(TRACK_B.incorporatedOn);
    return { detail: `incorporation_date = ${row.incorporation_date}; stage = ${row.stage}.` };
  });

  const admin = await as(browser, 'admin');
  await step(admin, { test: T, step: 3, role: 'admin', caption: 'The admin\'s project list shows Kaveri Foods as incorporated (Compliance stage word), Nilgiri as Incorporating.' }, async () => {
    await admin.goto('/app/admin/projects');
    await settle(admin, TRACK_B.short);
    const row = admin.locator('tr, [role=row]').filter({ hasText: TRACK_B.short }).locator('visible=true').first();
    await expect(row).toContainText(/Compliance|Registration|Incorporated/);
    return { marks: [{ at: row, kind: 'ok', n: 1 }] };
  });

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'The client\'s compliance calendar no longer shows the "before incorporation" notice.' }, async () => {
    await client.goto('/app/client/compliances/calendar');
    await settle(client);
    await client.waitForTimeout(1500);
    const body = await client.locator('body').innerText();
    expect(body).not.toMatch(/before (the company is )?incorporat|not incorporated yet|once the company is incorporated/i);
    return { marks: [{ at: seen(client, /Calendar|November|2026/), kind: 'ok', n: 1 }] };
  });

  await noteEmails(T, startedAt, false);
});
