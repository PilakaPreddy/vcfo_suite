import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resetRecords, as, closeAll, RESULTS, shot, sql, step } from './helpers/uat';

/**
 * T-01 Data reset and deploy, done on the private copy (production is not touched).
 * Steps 1 to 5 are shell and database checks; step 6 opens each sidebar page as super_admin.
 */
const T = 'T-01';

test.afterAll(closeAll);
test.beforeAll(() => resetRecords(T));

test('T-01 Data reset and deploy', async ({ browser }) => {
  await step(null, { test: T, step: 1, caption: 'A backup of the database is made before anything is deleted (pg_dump on the private copy; on AWS this is the RDS snapshot).' }, async () => {
    const file = join(RESULTS, 'backup-before-reset.sql');
    execFileSync('pg_dump', ['--no-owner', '-f', file, process.env.DATABASE_URL!]);
    const kb = Math.round(statSync(file).size / 1024);
    expect(kb).toBeGreaterThan(10);
    return { detail: `Backup written: ${kb} KB.` };
  });

  await step(null, { test: T, step: 2, caption: 'All data rows are deleted. Only the super_admin login is kept.' }, async () => {
    const [p] = await sql<{ n: number; emails: string }>(`select count(*)::int n, string_agg(email, ', ') emails from profiles`);
    const [e] = await sql<{ n: number }>(`select count(*)::int n from engagements`);
    expect(p.n).toBe(1);
    expect(p.emails).toBe('super@vcfo.local');
    expect(e.n).toBe(0);
    return { detail: `profiles: ${p.n} (${p.emails}); projects: ${e.n}.` };
  });

  await step(null, { test: T, step: 3, caption: 'All 50 database migrations (0000 to 0049) are applied.' }, async () => {
    const [m] = await sql<{ n: number }>(`select count(*)::int n from drizzle.__drizzle_migrations`);
    expect(m.n).toBe(50);
    return { detail: `${m.n} migrations applied.` };
  });

  await step(null, { test: T, step: 4, caption: 'CREDENTIALS_ENCRYPTION_KEY and ASK_VCFO_ENABLED=true are set.' }, async () => {
    const env = readFileSync('.env.local', 'utf8');
    expect(env).toMatch(/^CREDENTIALS_ENCRYPTION_KEY="?[A-Za-z0-9+/=]{40,}/m);
    expect(env).toMatch(/^ASK_VCFO_ENABLED=true/m);
    return { detail: 'Both values are present in the environment of the private copy.' };
  });

  await step(null, { test: T, step: 5, caption: 'The production build of main succeeds and the app starts (next build, next start).' }, async () => {
    expect(existsSync('.next/BUILD_ID')).toBe(true);
    const res = await fetch(`${process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'}/login`);
    expect(res.status).toBe(200);
    return { detail: `Build ${readFileSync('.next/BUILD_ID', 'utf8').trim()} is serving /login with HTTP 200.` };
  });

  const page = await as(browser, 'super');
  const hrefs = await page.locator('nav a[href^="/app/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))]);
  const broken: string[] = [];
  for (const href of hrefs) {
    const resp = await page.goto(href);
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = await page.locator('body').innerText();
    const bad = (resp?.status() ?? 200) >= 400 || /Application error|Something went wrong|Internal Server Error/i.test(body);
    if (bad) broken.push(href);
    await shot(page, {
      test: T, step: 6, role: 'super', status: bad ? 'fail' : 'pass',
      caption: bad ? `${href} shows an error.` : `${href} opens with no error and no old data.`,
    });
  }
  await step(page, { test: T, step: 6, role: 'super', caption: `Each sidebar page opens as super_admin (${hrefs.length} pages).` }, async () => {
    expect(broken, `Pages with an error: ${broken.join(', ')}`).toEqual([]);
    await page.goto('/app/super');
  });
});
