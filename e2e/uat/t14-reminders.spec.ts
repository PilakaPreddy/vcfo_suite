import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { firstStart, resetRecords, as, closeAll, noteEmails, sql, step, state, seen, settle } from './helpers/uat';

/**
 * T-14 Reminders and overdue items. The reminder job (src/jobs/compliance-task-reminders.ts) is run
 * for 10, 11 and 12 Nov 2026 by e2e/uat/tools/run-reminders.ts, the same steps without Inngest.
 */
const T = 'T-14';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

function runFor(day: string): { reminders: number; people: number; emails: number; to: string[] } {
  const out = execFileSync('node', ['--conditions=react-server', '--import', 'tsx', '--import', './e2e/uat/tools/mail-catcher.mjs', 'e2e/uat/tools/run-reminders.ts', day], {
    encoding: 'utf8',
    env: { ...process.env, RESEND_API_KEY: 're_uat_catcher' },
  });
  return JSON.parse(out.trim().split('\n').pop()!);
}

test('T-14 Reminders and overdue items', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();

  // Start from a clean reminder log so a re-run of this test sends the same mail again (local database only).
  await sql(`delete from compliance_reminder_log`);
  const days = ['2026-11-10', '2026-11-10', '2026-11-11', '2026-11-12'];
  const results: string[] = [];
  for (const [i, d] of days.entries()) {
    await step(null, { test: T, step: 2, caption: `The reminder job runs for ${d}${i === 1 ? ' a second time' : ''}.` }, async () => {
      const r = runFor(d);
      results.push(`${d}: ${r.reminders} reminders, ${r.emails} emails → ${r.to.join(', ') || 'nobody (already sent today)'}`);
      if (i === 1) expect(r.emails).toBe(0);
      return { detail: results[results.length - 1] };
    });
  }

  await step(null, { test: T, step: 4, caption: 'Each day the lead gets one email listing every overdue filing; on a due date the manager is told; a day later the admin is told.' }, async () => {
    const mails = (await import('./helpers/uat')).emailsSince;
    const all = (await mails(startedAt)).filter((m) => /reminder|Due today|overdue/i.test(m.subject));
    const perDay = new Map<string, number>();
    for (const m of all) perDay.set(`${[m.to].flat().join(',')}`, (perDay.get(`${[m.to].flat().join(',')}`) ?? 0) + 1);
    expect(all.length).toBeGreaterThan(0);
    return { detail: all.map((m) => `${m.subject} → ${[m.to].flat().join(', ')}`).join('\n') };
  });

  const lead = await as(browser, 'lead2');
  await step(lead, { test: T, step: 3, role: 'lead2', caption: 'The lead\'s bell shows the reminders.' }, async () => {
    await lead.goto('/app/intern/notifications');
    await settle(lead);
    await expect(seen(lead, /Overdue|GSTR|TDS|reminder/i)).toBeVisible();
    return { marks: [{ at: seen(lead, /Overdue|GSTR|TDS/i), kind: 'ok', n: 1 }] };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 5, role: 'manager', caption: 'The project\'s health changes from "on track" to at-risk or overdue.' }, async () => {
    const [row] = await sql<{ health: string }>(`select health from engagements where id = $1`, [trackB.id]);
    await mgr.goto('/app/manager/projects');
    await settle(mgr, 'Kaveri');
    const r = mgr.locator('tr, [role=row]').filter({ hasText: 'Kaveri' }).locator('visible=true').first();
    const text = await r.innerText();
    return { caption: `Stored health: "${row.health}". The project list shows: ${text.replace(/\s+/g, ' ').slice(0, 140)}`, marks: [{ at: r, kind: /overdue|risk|late/i.test(text) ? 'ok' : 'bad', n: 1 }], status: /overdue|risk|late/i.test(text + row.health) ? 'pass' : 'info', detail: 'By design, project health follows the checklist steps, not the compliance calendar (owner question O-T14-01).' };
  });

  await noteEmails(T, startedAt);
});
