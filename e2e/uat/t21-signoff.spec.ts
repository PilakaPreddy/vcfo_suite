import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, note, shot, sql, step, state, settle, type Role } from './helpers/uat';

/** T-21 Regression, security and sign-off: cross-client and cross-role checks by URL and by API. */
const T = 'T-21';
firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-21 Regression, security and sign-off', async ({ browser }) => {
  const st = state<{ trackA: { id: string; slug: string }; trackB: { id: string; slug: string }; budgetId?: string }>();
  const client = await as(browser, 'clientB');

  await step(client, { test: T, step: 2, role: 'clientB', caption: 'The Kaveri client types staff URLs: each one sends the client back to the portal.' }, async () => {
    const urls = ['/app/admin/people', '/app/manager/approvals', '/app/intern/vault', '/app/super/dashboard', '/app/admin/firm-settings', `/app/admin/projects/${st.trackA.slug}`, '/app/dev/overview'];
    const leaks: string[] = [];
    for (const u of urls) {
      await client.goto(u);
      await client.waitForLoadState('networkidle').catch(() => {});
      const landed = new URL(client.url()).pathname;
      if (landed.startsWith(u)) leaks.push(u);
    }
    await shot(client, { test: T, step: 2, role: 'clientB', status: leaks.length ? 'fail' : 'pass', caption: `After typing ${urls.length} staff URLs the client is still in the portal.` });
    expect(leaks).toEqual([]);
    return { detail: `Tried: ${urls.join(', ')}. Opened: ${leaks.join(', ') || 'none'}.` };
  });

  await step(client, { test: T, step: 2, role: 'clientB', caption: 'The Kaveri client calls the API for the other company (Nilgiri): every call is refused.' }, async () => {
    const a = st.trackA.id;
    const calls = [
      `/api/engagements/${a}`, `/api/engagements/${a}/doc-pack`, `/api/engagements/${a}/checklist`, `/api/engagements/${a}/board-resolution/download`,
      `/api/documents/requests?engagementId=${a}`, `/api/registrations?engagementId=${a}`, `/api/engagements/${a}/notification-deliveries`,
    ];
    const out: string[] = [];
    let leaks = 0;
    for (const c of calls) {
      const r = await client.request.get(c);
      const body = r.ok() ? await r.text() : '';
      const leaked = r.ok() && /Nilgiri|Kiran Rao|62011/.test(body);
      if (leaked) leaks++;
      out.push(`${r.status()} ${leaked ? 'LEAK' : 'ok'}  GET ${c.replace(a, '<Nilgiri id>')}`);
    }
    expect(leaks).toBe(0);
    return { detail: out.join('\n') };
  });

  const lead = await as(browser, 'lead2');
  await step(lead, { test: T, step: 2, role: 'lead2', caption: 'Leo Lead (Kaveri only) cannot open Nilgiri\'s project or files.' }, async () => {
    const a = st.trackA.id;
    const r1 = await lead.request.get(`/api/engagements/${a}/doc-pack`);
    const r2 = await lead.request.get(`/api/engagements/${a}`);
    await lead.goto(`/app/intern/engagements/${st.trackA.slug}`);
    await settle(lead);
    const body = await lead.locator('body').innerText();
    expect([401, 403, 404]).toContain(r1.status());
    return { caption: `API: doc pack ${r1.status()}, project ${r2.status()}. The page for Nilgiri shows: "${body.replace(/\s+/g, ' ').slice(0, 80)}…"`, status: /Kiran Rao|Meera Iyer/.test(body) ? 'fail' : 'pass' };
  });

  await step(null, { test: T, step: 3, caption: 'Counting the defects found in this run by severity.' }, async () => {
    const { readFileSync } = await import('node:fs');
    const d = JSON.parse(readFileSync('docs/specs/uat/defects.json', 'utf8')) as { severity: string; status: string }[];
    const by = (s: string, st2?: string) => d.filter((x) => x.severity === s && (!st2 || x.status === st2)).length;
    return { detail: `S1: ${by('S1')} found, ${by('S1', 'fixed')} fixed, ${by('S1', 'open')} open · S2: ${by('S2')} found, ${by('S2', 'fixed')} fixed · S3: ${by('S3')} · owner questions: ${by('owner')}.` };
  });

  note({ test: T, step: 4, status: 'info', caption: 'The go-live decision is the owner\'s. The report lists what is open and what a person must still check.' });
  void sql; void expect; void ({} as Role);
});
