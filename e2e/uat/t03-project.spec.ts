import { test, expect, type Page } from '@playwright/test';
import { firstStart, seen, settle, resetRecords, as, closeAll, noteEmails, saveTeamLogin, setState, shot, signIn, sql, step, state } from './helpers/uat';
import { TEAM, TRACK_A, TRACK_B, UAT_PASSWORD } from './fixtures/data';

/** T-03 Project creation and client invite: Track A (real client) and Track B (sandbox). */
const T = 'T-03';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

async function pick(page: Page, trigger: ReturnType<Page['locator']>, option: string | RegExp) {
  await trigger.click();
  await page.getByRole('option', { name: option }).first().click();
}

async function createProject(page: Page, p: { company: string; startPhase: 'Incorporation' | 'Registration' | 'Compliance'; lead: string; client: { name: string; email: string }; track: 'A' | 'B' }) {
  const existing = await sql<{ id: string; slug: string }>(`select id, slug from engagements where company_name = $1`, [p.company]);
  if (existing.length) return existing[0];
  await page.goto('/app/admin/projects/new');
  await page.locator('#create-company-name').fill(p.company);
  await page.getByRole('radio', { name: 'Standalone' }).click();
  await page.getByRole('radio', { name: p.startPhase, exact: true }).click();
  await page.getByRole('radio', { name: 'Company (Pvt Ltd)' }).click();
  await shot(page, {
    test: T, step: p.track === 'A' ? 1 : 2, role: 'admin', status: 'pass',
    caption: `Entity details for ${p.company}: Standalone (Independent), work starts at ${p.startPhase}, Private Limited company.`,
    marks: [
      { at: page.locator('#create-company-name'), kind: 'focus', n: 1 },
      { at: page.getByRole('radio', { name: 'Standalone' }), kind: 'focus', n: 2 },
      { at: page.getByRole('radio', { name: p.startPhase, exact: true }), kind: 'focus', n: 3 },
    ],
  });
  await page.getByRole('tab', { name: 'Team' }).click();
  const mgr = page.getByRole('combobox').filter({ hasText: /manager/i }).first();
  if (await mgr.count()) await pick(page, mgr, TEAM.manager.name);
  await pick(page, page.locator('#create-intern'), p.lead);
  await shot(page, { test: T, step: 3, role: 'admin', status: 'pass', caption: `Team for ${p.company}: manager ${TEAM.manager.name}, lead ${p.lead}.`, marks: [{ at: page.locator('#create-intern'), kind: 'focus', n: 1 }] });
  await page.getByRole('tab', { name: 'Client portal' }).click();
  await page.locator('#create-client-contact').fill(p.client.name);
  await page.locator('#create-client-phone').fill('9845012345');
  await page.locator('#create-client-email').fill(p.client.email);
  await page.locator('#create-client-password').fill(UAT_PASSWORD);
  await shot(page, { test: T, step: 4, role: 'admin', status: 'pass', caption: `Client portal login for ${p.client.name} (${p.client.email}).`, marks: [{ at: page.locator('#create-client-email'), kind: 'focus', n: 1 }, { at: page.locator('#create-client-password'), kind: 'focus', n: 2 }] });
  for (let i = 0; i < 4; i++) {
    const create = page.getByRole('button', { name: 'Create project' });
    if (await create.isVisible().catch(() => false) && (await create.isEnabled())) break;
    const next = page.getByRole('button', { name: 'Next' });
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/projects/new'), { timeout: 30_000 });
  const [row] = await sql<{ id: string; slug: string }>(`select id, slug from engagements where company_name = $1`, [p.company]);
  expect(row, 'project row created').toBeTruthy();
  return row;
}

test('T-03 Project creation and client invite', async ({ browser }) => {
  const admin = await as(browser, 'admin');

  await step(admin, { test: T, step: 1, role: 'admin', caption: `Admin creates the real project (Track A): ${TRACK_A.company}.` }, async () => {
    const a = await createProject(admin, { company: TRACK_A.company, startPhase: 'Incorporation', lead: TEAM.lead.name, client: TEAM.client, track: 'A' });
    setState({ trackA: a });
    return { caption: `Project created. The page after "Create project": ${new URL(admin.url()).pathname}.` };
  });

  await step(admin, { test: T, step: 2, role: 'admin', caption: `Admin creates the sandbox project (Track B): ${TRACK_B.company}, already incorporated.` }, async () => {
    const b = await createProject(admin, { company: TRACK_B.company, startPhase: 'Registration', lead: TEAM.lead2.name, client: TEAM.clientB, track: 'B' });
    setState({ trackB: b });
    return { caption: 'Sandbox project created, starting at Registration.' };
  });

  await step(null, { test: T, step: 3, caption: 'The manager and one lead are assigned to each project.' }, async () => {
    const rows = await sql<{ company_name: string; stage: string; ownership_type: string; manager: string; lead: string }>(
      `select e.company_name, e.stage, e.ownership_type,
              (select p.email from profiles p where p.id = e.manager_id) manager,
              coalesce((select p.email from profiles p where p.intern_id = e.intern_id), '') lead
         from engagements e order by e.created_at`,
    );
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.manager === TEAM.manager.email)).toBe(true);
    expect(rows.map((r) => r.lead)).toEqual([TEAM.lead.email, TEAM.lead2.email]);
    return { detail: JSON.stringify(rows) };
  });

  // Step 4 and 5: the client logins exist and the clients sign in.
  for (const [role, who, company] of [['client', TEAM.client, TRACK_A.company], ['clientB', TEAM.clientB, TRACK_B.company]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await step(page, { test: T, step: 5, role, caption: `${who.name} signs in to the client portal and sees ${company}.` }, async () => {
      await signIn(page, { email: who.email, password: UAT_PASSWORD, name: who.name });
      saveTeamLogin(role, { email: who.email, password: UAT_PASSWORD, name: who.name });
      await settle(page, company.replace(' Private Limited', ''));
      const body = await page.locator('body').innerText();
      expect(body).toContain(company.replace(' Private Limited', ''));
      const other = company === TRACK_A.company ? TRACK_B.short : TRACK_A.short;
      expect(body).not.toContain(other);
      return { caption: `${who.name} lands on the portal home of ${company} and sees nothing of the other company.`, marks: [{ at: page.getByText(company.replace(' Private Limited', '')).first(), kind: 'ok', n: 1 }] };
    });
    await ctx.close();
  }

  await step(admin, { test: T, step: 6, role: 'admin', caption: 'The projects show on the admin, manager and lead dashboards.' }, async () => {
    await admin.goto('/app/admin/projects');
    await expect(seen(admin, TRACK_A.short)).toBeVisible();
    await expect(seen(admin, TRACK_B.short)).toBeVisible();
    return { marks: [{ at: seen(admin, TRACK_A.short), kind: 'ok', n: 1 }, { at: seen(admin, TRACK_B.short), kind: 'ok', n: 2 }] };
  });
  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 6, role: 'manager', caption: 'The manager sees both projects.' }, async () => {
    await mgr.goto('/app/manager/projects');
    await expect(seen(mgr, TRACK_A.short)).toBeVisible();
    await expect(seen(mgr, TRACK_B.short)).toBeVisible();
    return { marks: [{ at: seen(mgr, TRACK_A.short), kind: 'ok', n: 1 }, { at: seen(mgr, TRACK_B.short), kind: 'ok', n: 2 }] };
  });
  const lead = await as(browser, 'lead');
  await step(lead, { test: T, step: 6, role: 'lead', caption: 'Lata Lead sees only her own project (Track A).' }, async () => {
    await lead.goto('/app/intern/clients');
    await expect(seen(lead, TRACK_A.short)).toBeVisible();
    await expect(lead.getByText(TRACK_B.short)).toHaveCount(0);
    return { marks: [{ at: seen(lead, TRACK_A.short), kind: 'ok', n: 1 }] };
  });

  const mails = await noteEmails(T, startedAt);
  void mails;
  void state;
});
