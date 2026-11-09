import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { firstStart, resetRecords, as, closeAll, noteEmails, saveTeamLogin, setState, shot, signIn, sql, step, state, seen, settle, stepState, RESULTS } from './helpers/uat';
import { fillStep, submitStep } from './helpers/fill-step';
import { TEAM, UAT_PASSWORD } from './fixtures/data';

/**
 * T-09 Board resolutions. A board resolution exists only for a subsidiary, so this test makes a
 * third project, Track C: Sahyadri Robotics India, a foreign subsidiary of Sahyadri Robotics GmbH.
 */
const T = 'T-09';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const C = {
  company: 'Sahyadri Robotics India Private Limited',
  short: 'Sahyadri Robotics',
  parent: 'Sahyadri Robotics GmbH',
  parentAddress: 'Leopoldstrasse 120, 80802 Munich, Germany',
  client: { name: 'Anika Weber', email: 'anika.weber@uat-client.test' },
};

async function pick(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click();
  await page.getByRole('option', { name: option }).first().click();
}

function docxText(buf: Buffer) {
  const xml = new PizZip(buf).file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
}

test('T-09 Board resolutions', async ({ browser }) => {
  const admin = await as(browser, 'admin');
  let eng = state<{ trackC?: { id: string; slug: string } }>().trackC;

  await step(admin, { test: T, step: 0, role: 'admin', caption: `Admin creates a foreign-subsidiary project (Track C): ${C.company}, parent ${C.parent}.` }, async () => {
    const found = await sql<{ id: string; slug: string }>(`select id, slug from engagements where company_name = $1`, [C.company]);
    if (!found.length) {
      await admin.goto('/app/admin/projects/new');
      await admin.locator('#create-company-name').fill(C.company);
      await admin.getByRole('radio', { name: 'Subsidiary', exact: true }).click();
      await admin.getByRole('radio', { name: 'Foreign subsidiary' }).click();
      await admin.getByRole('radio', { name: 'Incorporation', exact: true }).click();
      await admin.getByRole('radio', { name: 'Company (Pvt Ltd)' }).click();
      await admin.locator('#create-parent-entity-name').fill(C.parent);
      await admin.locator('#create-parent-entity-address').fill(C.parentAddress);
      await shot(admin, { test: T, step: 0, role: 'admin', status: 'pass', caption: 'Subsidiary → Foreign subsidiary, with the parent company\'s name and address.', marks: [{ at: admin.getByRole('radio', { name: 'Foreign subsidiary' }), kind: 'focus', n: 1 }, { at: admin.locator('#create-parent-entity-name'), kind: 'focus', n: 2 }] });
      await admin.getByRole('tab', { name: 'Team' }).click();
      const mgr = admin.getByRole('combobox').filter({ hasText: /manager/i }).first();
      if (await mgr.count()) await pick(admin, mgr, TEAM.manager.name);
      await pick(admin, admin.locator('#create-intern'), TEAM.lead.name);
      await admin.getByRole('tab', { name: 'Client portal' }).click();
      await admin.locator('#create-client-contact').fill(C.client.name);
      await admin.locator('#create-client-email').fill(C.client.email);
      await admin.locator('#create-client-password').fill(UAT_PASSWORD);
      for (let i = 0; i < 4; i++) {
        const create = admin.getByRole('button', { name: 'Create project' });
        if ((await create.isVisible().catch(() => false)) && (await create.isEnabled())) break;
        const next = admin.getByRole('button', { name: 'Next' });
        if (await next.isVisible().catch(() => false)) await next.click();
      }
      await admin.getByRole('button', { name: 'Create project' }).click();
      await admin.waitForURL((u) => !u.pathname.endsWith('/projects/new'), { timeout: 30_000 });
    }
    [eng] = await sql<{ id: string; slug: string }>(`select id, slug from engagements where company_name = $1`, [C.company]);
    setState({ trackC: eng });
    saveTeamLogin('clientC' as never, { email: C.client.email, password: UAT_PASSWORD, name: C.client.name });
    const st = await stepState(eng!.id, 'pre-2');
    return { caption: `Project created. The board resolution step applies here (pre-2 status "${st.status ?? 'not-started'}").` };
  });

  // The client fills Part A, with the parent entity and the person who signs the resolution.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const client = await ctx.newPage();
  await step(client, { test: T, step: 0, role: 'client', caption: 'The client fills Part A for the subsidiary: parent entity, directors, capital and the person who signs the resolution.' }, async () => {
    await signIn(client, { email: C.client.email, password: UAT_PASSWORD, name: C.client.name });
    const st = await stepState(eng!.id, 'pre-1');
    if (st.clientSubmittedAt || st.status === 'completed') return { caption: 'Part A is already submitted.' };
    await client.goto('/app/client/incorporation/step/name-application');
    await settle(client, /Business Description/);
    const did = await fillStep(client, {
      itemId: 'pre-1',
      file: 'coi-kaveri.pdf',
      values: {
        businessDescription: 'Industrial robot integration and after-sales service for manufacturers in India.',
        proposedName1: 'Sahyadri Robotics India Private Limited', proposedName2: 'Sahyadri Automation India Private Limited',
        parentEntityName: C.parent, parentEntityAddress: C.parentAddress, parentEntityState: 'Bavaria', parentEntityCountry: 'Germany',
        director1FirstName: 'Anika', director1LastName: 'Weber', director2FirstName: 'Rohan', director2LastName: 'Kulkarni',
        authorisedShareCapital: '1000000', paidUpShareCapital: '100000', nominalValuePerEquityShare: '10',
        signatoryFirstName: 'Anika', signatoryLastName: 'Weber', signatoryDesignation: 'Managing Director', boardResolutionDate: '2026-11-03',
      },
      choices: { 'resident': 'Yes', 'gender': 'Female' },
    });
    await shot(client, { test: T, step: 0, role: 'client', status: 'info', caption: `The client's Part A, filled (${did.length} answers).`, detail: did.join('\n').slice(0, 1500) });
    await submitStep(client);
    const after = await stepState(eng!.id, 'pre-1');
    expect(['in-progress', 'completed']).toContain(after.status);
    return { caption: `The client submitted Part A (step "${after.status}", waiting for the lead's NIC code).` };
  });
  await ctx.close();

  const lead = await as(browser, 'lead');
  await step(lead, { test: T, step: 0, role: 'lead', caption: 'The lead adds the NIC code and completes Part A.' }, async () => {
    if ((await stepState(eng!.id, 'pre-1')).status === 'completed') return { caption: 'Part A is already complete.' };
    await lead.goto(`/app/intern/engagements/${eng!.slug}/step/name-application`);
    await settle(lead, /Business Description/);
    await lead.getByRole('tab', { name: 'NIC Codes' }).locator('visible=true').first().click();
    await lead.locator('#pre-1-nicCode').locator('visible=true').first().fill('28220');
    await submitStep(lead);
    expect((await stepState(eng!.id, 'pre-1')).status).toBe('completed');
  });

  const brPath = `/app/intern/engagements/${eng!.slug}/board-resolution`;
  let text = '';
  await step(lead, { test: T, step: 1, role: 'lead', caption: 'The lead generates the board resolution from Part A.' }, async () => {
    await lead.goto(brPath);
    await settle(lead, /Board resolution|Re-generate/i);
    const gen = lead.getByRole('button', { name: /Re-generate from Pre-1|Generate/ }).locator('visible=true').first();
    if (await gen.count()) {
      await gen.click();
      await lead.waitForTimeout(4000);
    }
    const res = await lead.request.get(`/api/engagements/${eng!.id}/board-resolution/download`);
    expect(res.ok()).toBe(true);
    const buf = Buffer.from(await res.body());
    writeFileSync(join(RESULTS, 'board-resolution.docx'), buf);
    text = docxText(buf);
    const checks = { parent: text.includes(C.parent), company: /Sahyadri Robotics India/i.test(text), signatory: /Anika\s+Weber/i.test(text), designation: /Managing Director/i.test(text) };
    expect(checks.parent && checks.company).toBe(true);
    return { caption: `The resolution opens as a Word file (${Math.round(buf.length / 1024)} KB). Parent named: ${checks.parent}; company named: ${checks.company}; signatory Anika Weber: ${checks.signatory}; designation: ${checks.designation}.`, detail: text.slice(0, 1500), marks: [{ at: gen, kind: 'focus', n: 1 }] };
  });

  await step(lead, { test: T, step: 3, role: 'lead', caption: 'The lead sends the resolution for the manager\'s approval.' }, async () => {
    await lead.goto(brPath);
    await settle(lead, /Board resolution|manager approval/i);
    const send = lead.getByRole('button', { name: /^Send for manager approval/ }).locator('visible=true').first();
    await send.click();
    const confirm = lead.getByRole('alertdialog').getByRole('button', { name: /Send for manager approval|Send|Confirm/ }).last();
    if (await confirm.count()) await confirm.click();
    await lead.waitForTimeout(2500);
    const st = await stepState(eng!.id, 'pre-2');
    return { caption: `Sent. The board resolution step is now "${st.status}" (review "${st.reviewStatus ?? '—'}").`, marks: [{ at: seen(lead, /Sent for manager approval/), kind: 'ok', n: 1 }] };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager reads the resolution and clicks "Approve and send to client".' }, async () => {
    await mgr.goto(`/app/manager/projects/${eng!.slug}/board-resolution`);
    await settle(mgr, /Approve and send to client|Board resolution/i);
    const approve = mgr.getByRole('button', { name: /Approve and send to client/ }).locator('visible=true').first();
    await shot(mgr, { test: T, step: 4, role: 'manager', status: 'pass', caption: 'The manager sees the resolution with "Approve and send to client" and "Send back".', marks: [{ at: approve, kind: 'focus', n: 1 }] });
    await approve.click();
    const confirm = mgr.getByRole('alertdialog').getByRole('button').last();
    if (await confirm.count()) await confirm.click();
    await mgr.waitForTimeout(3000);
    const st = await stepState(eng!.id, 'pre-2');
    expect(st.status).toBe('completed');
    return { caption: `Approved. The board resolution step is "${st.status}".` };
  });

  await noteEmails(T, startedAt);
});
