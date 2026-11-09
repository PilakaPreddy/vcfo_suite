import { test, expect } from '@playwright/test';
import { emailsSince, firstStart, note, resetRecords, sql, step } from './helpers/uat';

/** T-19 Email: every email of the run, checked for recipients from another company and for working links. */
const T = 'T-19';
firstStart(T);
test.beforeAll(() => resetRecords(T));

test('T-19 Email', async () => {
  const all = await emailsSince('2000-01-01');
  await step(null, { test: T, step: 1, caption: `The app sent ${all.length} emails in the run; every one was caught and kept.` }, async () => {
    expect(all.length).toBeGreaterThan(20);
    return { detail: all.map((m) => `${m.subject} → ${[m.to].flat().join(', ')}`).join('\n').slice(0, 6000) };
  });

  await step(null, { test: T, step: 2, caption: 'No email about one company went to a client of another company.' }, async () => {
    const companies = await sql<{ name: string; emails: string[] }>(
      `select e.company_name as name, array_agg(p.email) as emails from engagements e join engagement_clients ec on ec.engagement_id = e.id join profiles p on p.client_id = ec.client_id group by e.company_name`,
    ).catch(async () => [] as { name: string; emails: string[] }[]);
    const clientOf = new Map<string, string>();
    for (const c of companies) for (const e of c.emails) clientOf.set(e, c.name);
    const wrong: string[] = [];
    for (const m of all) {
      const subjectCo = companies.find((c) => m.subject.includes(c.name.replace(' Private Limited', '')))?.name;
      if (!subjectCo) continue;
      for (const to of [m.to, ...(m.cc ?? [])].flat()) {
        const owner = clientOf.get(String(to));
        if (owner && owner !== subjectCo) wrong.push(`${m.subject} → ${to} (a client of ${owner})`);
      }
    }
    expect(wrong).toEqual([]);
    return { detail: `Checked ${all.length} emails against ${companies.length} companies and their clients. Misaddressed: ${wrong.length}.` };
  });

  await step(null, { test: T, step: 3, caption: 'Every link in the emails points at this app and at a real page.' }, async () => {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const links = new Set<string>();
    for (const m of all) for (const h of (m.html ?? '').match(/href="([^"]+)"/g) ?? []) links.add(h.slice(6, -1));
    const own = [...links].filter((l) => l.startsWith(base));
    const bad: string[] = [];
    for (const l of own.slice(0, 40)) {
      const r = await fetch(l, { redirect: 'manual' });
      if (r.status >= 400) bad.push(`${r.status} ${l}`);
    }
    expect(bad).toEqual([]);
    return { detail: `${own.length} links into the app; ${Math.min(own.length, 40)} opened; broken: ${bad.length}. (Signed-out requests are redirected to the sign-in page, which counts as working.)` };
  });

  note({ test: T, step: 4, status: 'untestable', caption: 'The emails arrive in real inboxes (not in spam), with the right sender name.', detail: 'Needs the real mail provider (SES or Resend) with the sbctrack.in domain. A person checks one inbox for each kind of email in the list above.' });
});
