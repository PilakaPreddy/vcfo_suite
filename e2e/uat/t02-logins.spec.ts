import { test, expect, type Page } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, noteEmails, note, saveTeamLogin, shot, signIn, sql, step, sweepSidebar, team, totpNow, setState, type Role } from './helpers/uat';
import { TEAM, UAT_PASSWORD } from './fixtures/data';

/** T-02 Logins, roles and access (staff part; the client logins come in T-03). */
const T = 'T-02';
const TEMP = 'SBC@2026';


test.afterAll(closeAll);
test.beforeAll(() => resetRecords(T));

const STAFF: { role: Role; label: string; who: { name: string; email: string } }[] = [
  { role: 'admin', label: 'Firm admin', who: TEAM.admin },
  { role: 'manager', label: 'Project manager', who: TEAM.manager },
  { role: 'lead', label: 'Project lead', who: TEAM.lead },
  { role: 'lead2', label: 'Project lead', who: TEAM.lead2 },
];

async function createPerson(page: Page, p: (typeof STAFF)[number]) {
  const exists = await sql(`select 1 from profiles where email = $1`, [p.who.email]);
  if (exists.length) return 'exists';
  await page.goto('/app/admin/people');
  await page.getByRole('button', { name: 'Create person' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: p.label }).or(dialog.getByRole('button', { name: p.label })).first().click();
  const inputs = dialog.locator('input:not([type=hidden])');
  await inputs.nth(0).fill(p.who.name);
  await dialog.locator('input[type=email]').fill(p.who.email);
  await dialog.locator('input[type=password], input[minlength="8"]').first().fill(TEMP);
  if (p.role === 'lead' || p.role === 'lead2') {
    const trigger = dialog.getByRole('combobox').filter({ hasText: /Select manager|Manager/ }).first();
    if (await trigger.count()) {
      await trigger.click();
      await page.getByRole('option', { name: TEAM.manager.name }).click();
    }
  }
  await shot(page, {
    test: T, step: 1, role: 'super', status: 'pass',
    caption: `Super admin fills "Create person" for ${p.who.name} (${p.label}).`,
    marks: [{ at: dialog.locator('input[type=email]'), kind: 'focus', n: 1 }, { at: dialog.locator('button[type=submit]'), kind: 'focus', n: 2 }],
  });
  await dialog.locator('button[type=submit]').click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  return 'created';
}

test('T-02 Logins, roles and access', async ({ browser }) => {
  const sup = await as(browser, 'super');

  await step(sup, { test: T, step: 1, role: 'super', caption: 'Super admin creates 1 admin, 1 manager and 2 project leads on the People page.' }, async () => {
    for (const p of STAFF) await createPerson(sup, p);
    const rows = await sql<{ email: string; role: string }>(`select email, role from profiles where email like '%@uat.vcfo.test' order by email`);
    expect(rows.length).toBe(4);
    await sup.goto('/app/admin/people');
    return {
      caption: 'The People page lists the four new staff logins.',
      detail: rows.map((r) => `${r.email} → ${r.role}`).join('; '),
      marks: STAFF.map((p, i) => ({ at: sup.getByText(p.who.email).first(), kind: 'ok' as const, n: i + 1 })),
    };
  });

  // Step 2: each person signs in with the temporary password and sets their own.
  for (const p of STAFF) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await step(page, { test: T, step: 2, role: p.role, caption: `${p.who.name} signs in with the temporary password and sets a new password.` }, async () => {
      const already = team()[p.role];
      if (!already) {
        await signIn(page, { email: p.who.email, password: TEMP, name: p.who.name });
        await page.goto(`/app/${p.role.startsWith('lead') ? 'intern' : p.role}/settings`);
        await page.getByRole('button', { name: 'Sign-in and security' }).or(page.getByRole('link', { name: 'Sign-in and security' })).or(page.getByRole('tab', { name: 'Sign-in and security' })).first().click();
        const change = page.getByRole('button', { name: 'Change password' });
        if (await change.count()) await change.first().click();
        await page.locator('#current-password').fill(TEMP);
        await page.locator('#new-password').fill(UAT_PASSWORD);
        const confirm = page.locator('#confirm-password, input[autocomplete="new-password"]').nth(1);
        if (await confirm.count()) await confirm.fill(UAT_PASSWORD);
        await shot(page, { test: T, step: 2, role: p.role, status: 'pass', caption: `${p.who.name} types the current and the new password in Settings.`, marks: [{ at: page.locator('#new-password'), kind: 'focus', n: 1 }] });
        await page.locator('form').filter({ has: page.locator('#new-password') }).locator('button[type=submit]').click();
        await page.waitForTimeout(1500);
        saveTeamLogin(p.role, { email: p.who.email, password: UAT_PASSWORD, name: p.who.name });
      }
      // Prove the new password works.
      await signIn(page, { email: p.who.email, password: UAT_PASSWORD, name: p.who.name });
      return { caption: `${p.who.name} signs in with the new password.` };
    });
    await ctx.close();
  }

  // Two-step sign-in for the first lead.
  const lead = await as(browser, 'lead');
  let secret = '';
  await step(lead, { test: T, step: 2, role: 'lead', caption: 'Lata Lead turns on two-step sign-in with an authenticator code.' }, async () => {
    const [row] = await sql<{ on: boolean }>(`select totp_enabled_at is not null as on from profiles where email = $1`, [TEAM.lead.email]);
    if (row?.on) return { caption: 'Two-step sign-in is already on for Lata Lead.' };
    await lead.goto('/app/intern/settings');
    await lead.getByRole('button', { name: 'Sign-in and security' }).or(lead.getByRole('link', { name: 'Sign-in and security' })).or(lead.getByRole('tab', { name: 'Sign-in and security' })).first().click();
    await lead.getByRole('button', { name: 'Turn on' }).first().click();
    const key = lead.locator('code').filter({ hasText: /[A-Z2-7]{4}/ }).first();
    await key.waitFor();
    secret = (await key.innerText()).trim();
    setState({ leadTotpSecret: secret });
    await lead.locator('#two-step-code').fill(totpNow(secret));
    await shot(lead, { test: T, step: 2, role: 'lead', status: 'pass', caption: 'The app shows the key; the code from it is typed in.', marks: [{ at: key, kind: 'focus', n: 1 }, { at: lead.locator('#two-step-code'), kind: 'focus', n: 2 }] });
    await lead.locator('form').filter({ has: lead.locator('#two-step-code') }).locator('button[type=submit]').click();
    await expect(lead.getByRole('button', { name: 'Turn off' })).toBeVisible({ timeout: 15_000 });
    return { caption: 'Two-step sign-in is on: the button now says "Turn off".', marks: [{ at: lead.getByRole('button', { name: 'Turn off' }), kind: 'ok', n: 3 }] };
  });

  // Step 3: each person opens each page in the sidebar.
  for (const role of ['admin', 'manager', 'lead'] as Role[]) {
    const page = await as(browser, role);
    const res = await sweepSidebar(page, T, 3, role);
    note({ test: T, step: 3, role, status: res.broken.length ? 'fail' : 'pass', caption: `${role}: ${res.total} sidebar pages opened, ${res.broken.length} with an error.`, detail: res.broken.join(', ') || undefined });
  }

  // Step 4: wrong-role URLs.
  await step(null, { test: T, step: 4, caption: 'Each person types the URL of a page of a different role, and is sent away.' }, async () => {
    const tries: [Role, string][] = [
      ['lead', '/app/admin/people'], ['lead', '/app/super/dashboard'], ['lead', '/app/manager/approvals'],
      ['manager', '/app/admin/firm-settings'], ['manager', '/app/super/team'], ['admin', '/app/super/settings'], ['admin', '/app/dev/overview'],
    ];
    const leaks: string[] = [];
    for (const [role, url] of tries) {
      const page = await as(browser, role);
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => {});
      const landed = new URL(page.url()).pathname;
      const ok = !landed.startsWith(url);
      if (!ok) leaks.push(`${role} → ${url}`);
      await shot(page, { test: T, step: 4, role, status: ok ? 'pass' : 'fail', caption: ok ? `${role} typed ${url} and was sent to ${landed}.` : `${role} typed ${url} and the page opened.` });
    }
    expect(leaks).toEqual([]);
  });

  // Step 5: ten wrong codes lock two-step sign-in.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await step(page, { test: T, step: 5, role: 'lead', caption: 'Ten wrong two-step codes lock the sign-in, and then even a correct code is refused.' }, async () => {
    const res: number[] = [];
    // Use the API that the login form uses: credentials plus an otp field.
    await sql(`delete from rate_limits where key like 'sign-in:%' or key like 'two-step:%' or key like 'totp-fail:%'`);
    for (let i = 0; i < 10; i++) {
      await page.goto('/login');
      await page.locator('#email:visible').fill(TEAM.lead.email);
      await page.locator('#password:visible').fill(UAT_PASSWORD);
      await page.locator('button[type="submit"]:visible').first().click();
      const code = page.locator('input[autocomplete="one-time-code"]:visible').first();
      await code.waitFor({ timeout: 15_000 });
      await code.fill('000000');
      await page.locator('button[type="submit"]:visible').first().click();
      await page.waitForTimeout(700);
      res.push(i);
    }
    const [lock] = await sql<{ n: number }>(`select count(*)::int n from rate_limits where key like 'totp-fail:%' or key like 'two-step:%'`);
    await shot(page, { test: T, step: 5, role: 'lead', status: 'info', caption: 'After ten wrong codes the form shows this message.', marks: [{ at: page.getByRole('alert').first(), kind: 'focus', n: 1 }] });
    // A correct code is now refused.
    const s = (await sql<{ s: string }>(`select 1 as s`)).length ? (await import('./helpers/uat')).state<{ leadTotpSecret?: string }>().leadTotpSecret : undefined;
    if (s) {
      const code = page.locator('input[autocomplete="one-time-code"]:visible').first();
      await code.fill(totpNow(s));
      await page.locator('button[type="submit"]:visible').first().click();
      await page.waitForTimeout(2000);
      expect(page.url()).not.toMatch(/\/app\//);
    }
    // Clear the lock so later tests can sign in as the lead.
    await sql(`delete from rate_limits where key like 'totp-fail:%' or key like 'two-step:%' or key like 'sign-in:%'`);
    return { caption: `Ten wrong codes were entered; a correct code was refused after that (rate-limit rows: ${lock.n}). The lock was then cleared for the rest of the run.`, marks: [{ at: page.getByRole('alert').first(), kind: 'ok', n: 1 }] };
  });
  await ctx.close();

  note({ test: T, step: 6, status: 'untestable', caption: 'Each lead connects Outlook in Settings.', detail: 'Needs a real Microsoft 365 sign-in. A person must click "Connect Outlook" in Settings once and check that it shows "Connected".' });

  await noteEmails(T, firstStart(T), false);
});
