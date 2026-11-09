import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { Client } from 'pg';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

/**
 * The toolkit for the user acceptance run (docs/specs/uat/TEST-PLAN.md).
 *
 * Every step of the plan ends in `shot()` or `note()`. Both append one record to
 * `e2e/uat/results/records.jsonl`; `scripts/build-uat-report.mjs` turns those records into the
 * illustrated report. `shot()` first draws the marks (numbered circles, green and red boxes) on
 * the page itself, so they are part of the image and print as they look.
 */

export const UAT_DIR = join(process.cwd(), 'e2e/uat');
export const RESULTS = join(UAT_DIR, 'results');
const SHOTS = join(RESULTS, 'shots');
const AUTH = join(UAT_DIR, '.auth');
const TEAM_FILE = join(UAT_DIR, '.auth', 'team.json');
for (const d of [RESULTS, SHOTS, AUTH]) mkdirSync(d, { recursive: true });

export type Role = 'super' | 'admin' | 'manager' | 'lead' | 'lead2' | 'client' | 'clientB';
export type Status = 'pass' | 'fail' | 'fixed' | 'blocked' | 'untestable' | 'info';

export type Mark = {
  /** The element to mark. A missing element is skipped, not an error. */
  at: Locator;
  /** ok = green box, bad = red box, focus = blue numbered circle only. */
  kind?: 'ok' | 'bad' | 'focus';
  /** The number in the circle. */
  n?: number;
  /** A short label beside the box. */
  label?: string;
};

export type StepRecord = {
  test: string;
  step: number | string;
  role?: Role | string;
  status: Status;
  caption: string;
  shot?: string;
  detail?: string;
  defect?: string;
  at: string;
};

/** The logins the run made in T-02. Each test reads them from here. */
export type TeamLogin = { email: string; password: string; name: string };
export function team(): Partial<Record<Role, TeamLogin>> {
  return existsSync(TEAM_FILE) ? JSON.parse(readFileSync(TEAM_FILE, 'utf8')) : {};
}
export function saveTeamLogin(role: Role, login: TeamLogin) {
  const t = team();
  t[role] = login;
  writeFileSync(TEAM_FILE, JSON.stringify(t, null, 2));
}
export const SUPER: TeamLogin = { email: 'super@vcfo.local', password: 'super123', name: 'Super Admin' };
export function loginOf(role: Role): TeamLogin {
  if (role === 'super') return SUPER;
  const l = team()[role];
  if (!l) throw new Error(`No login for ${role} yet. Run T-02 first.`);
  return l;
}

/** Shared state between tests (project ids, slugs and the like). */
const STATE_FILE = join(AUTH, 'state.json');
export function state<T = Record<string, unknown>>(): T {
  return (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}) as T;
}
export function setState(patch: Record<string, unknown>) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...state(), ...patch }, null, 2));
}

// ------------------------------------------------------------------ database (local only)

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('The UAT run reads only a database on this machine.');
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    return (await db.query(text, params)).rows as T[];
  } finally {
    await db.end();
  }
}

// ------------------------------------------------------------------ sign-in

async function forgetSignInCounts() {
  await sql(`delete from rate_limits where key like 'sign-in:%' or key like 'two-step:%' or key like 'totp-fail:%'`);
}

/** Close the live announcement and notification cards that pop up over a page. */
export async function closePopups(page: Page) {
  for (const kind of ['announcement', 'notification']) {
    await page.addLocatorHandler(page.locator(`#${kind}-live-title`), () => page.keyboard.press('Escape'), { noWaitAfter: true });
  }
}

export async function signIn(page: Page, login: TeamLogin, otp?: string) {
  await forgetSignInCounts();
  await page.goto('about:blank');
  await page.context().clearCookies();
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const email = page.locator('#email:visible');
  const password = page.locator('#password:visible');
  await expect(async () => {
    await email.fill(login.email);
    await password.fill(login.password);
    expect(await email.inputValue()).toBe(login.email);
    expect(await password.inputValue()).toBe(login.password);
  }).toPass({ timeout: 15_000 });
  await page.locator('button[type="submit"]:visible').first().click();
  if (otp) {
    const code = page.locator('input[autocomplete="one-time-code"]:visible, #otp:visible').first();
    await code.waitFor({ timeout: 15_000 });
    await code.fill(otp);
    await page.locator('button[type="submit"]:visible').first().click();
  }
  await page.waitForURL(/\/app\//, { timeout: 45_000 });
}

/** One browser context for each role, signed in once and kept for the run. */
const contexts = new Map<string, BrowserContext>();
export async function as(browser: Browser, role: Role): Promise<Page> {
  let ctx = contexts.get(role);
  if (!ctx || ctx.pages().length === 0) {
    const file = join(AUTH, `${role}.state.json`);
    ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: existsSync(file) ? file : undefined,
    });
    contexts.set(role, ctx);
    const page = await ctx.newPage();
    await closePopups(page);
    await page.goto('/app');
    if (!/\/app\//.test(page.url())) {
      const secret = role === 'lead' ? state<{ leadTotpSecret?: string }>().leadTotpSecret : undefined;
      await signIn(page, loginOf(role), secret ? totpNow(secret) : undefined);
      await ctx.storageState({ path: file });
    }
    return page;
  }
  return ctx.pages()[0];
}
export async function closeAll() {
  for (const c of contexts.values()) await c.close().catch(() => {});
  contexts.clear();
}

// ------------------------------------------------------------------ evidence

const COLORS = { ok: '#16a34a', bad: '#dc2626', focus: '#2563eb' } as const;

async function drawMarks(page: Page, marks: Mark[]) {
  const boxes: { x: number; y: number; w: number; h: number; kind: string; n?: number; label?: string }[] = [];
  for (const m of marks) {
    const el = m.at.first();
    if (!(await el.count())) continue;
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox().catch(() => null);
    if (!b) continue;
    boxes.push({ x: b.x, y: b.y, w: b.width, h: b.height, kind: m.kind ?? 'focus', n: m.n, label: m.label });
  }
  await page.evaluate(
    ({ boxes, colors }) => {
      const root = document.createElement('div');
      root.id = '__uat_marks';
      root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
      for (const b of boxes) {
        const c = (colors as Record<string, string>)[b.kind];
        if (b.kind !== 'focus') {
          const r = document.createElement('div');
          r.style.cssText = `position:fixed;left:${b.x - 4}px;top:${b.y - 4}px;width:${b.w + 8}px;height:${b.h + 8}px;border:3px solid ${c};border-radius:8px;box-shadow:0 0 0 4px ${c}33`;
          root.appendChild(r);
        }
        if (b.n != null) {
          const d = document.createElement('div');
          d.textContent = String(b.n);
          d.style.cssText = `position:fixed;left:${Math.max(2, b.x - 16)}px;top:${Math.max(2, b.y - 16)}px;width:26px;height:26px;border-radius:50%;background:${c};color:#fff;font:700 14px/26px Arial;text-align:center;box-shadow:0 1px 4px #0006`;
          root.appendChild(d);
        }
        if (b.label) {
          const l = document.createElement('div');
          l.textContent = b.label;
          const top = b.y + b.h + 8 > window.innerHeight - 30 ? b.y - 30 : b.y + b.h + 8;
          l.style.cssText = `position:fixed;left:${Math.max(4, b.x)}px;top:${top}px;max-width:360px;padding:3px 8px;border-radius:5px;background:${c};color:#fff;font:600 12px/18px Arial;box-shadow:0 1px 4px #0005`;
          root.appendChild(l);
        }
      }
      document.body.appendChild(root);
    },
    { boxes, colors: COLORS },
  );
}

/** Drop the records of earlier runs of one test, so a re-run replaces them. Call once at the start. */
export function resetRecords(test: string) {
  const file = join(RESULTS, 'records.jsonl');
  if (!existsSync(file)) return;
  const keep = readFileSync(file, 'utf8').split('\n').filter((l) => l && JSON.parse(l).test !== test);
  writeFileSync(file, keep.length ? keep.join('\n') + '\n' : '');
}

function append(rec: StepRecord) {
  appendFileSync(join(RESULTS, 'records.jsonl'), JSON.stringify(rec) + '\n');
}

let seq = 0;
/** Mark the page, take the screenshot and keep the record. Never throws for a screenshot problem. */
export async function shot(
  page: Page,
  rec: Omit<StepRecord, 'at' | 'shot'> & { marks?: Mark[]; fullPage?: boolean },
): Promise<void> {
  const name = `${rec.test}-${String(rec.step).replace(/\W+/g, '_')}-${++seq}-${Date.now() % 100000}.jpg`;
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    if (rec.marks?.length) await drawMarks(page, rec.marks);
    await page.screenshot({ path: join(SHOTS, name), type: 'jpeg', quality: 72, fullPage: rec.fullPage ?? false });
  } catch {
    // keep the record without an image
  } finally {
    await page.evaluate(() => document.getElementById('__uat_marks')?.remove()).catch(() => {});
  }
  const { marks: _m, fullPage: _f, ...rest } = rec;
  append({ ...rest, shot: existsSync(join(SHOTS, name)) ? `shots/${name}` : undefined, at: new Date().toISOString() });
}

/** A record without a screenshot: a database check, a file check, or "cannot test here". */
export function note(rec: Omit<StepRecord, 'at'>) {
  append({ ...rec, at: new Date().toISOString() });
}

/**
 * Run one plan step. A failure is recorded with a screenshot of the page as it was and then
 * re-thrown only when `stopOnFail` is set; by default the test carries on to the next step, as a
 * person would, so one defect does not hide the rest.
 */
export async function step(
  page: Page | null,
  meta: { test: string; step: number | string; role?: Role; caption: string },
  body: () => Promise<void | { marks?: Mark[]; caption?: string; detail?: string; status?: Status }>,
  opts: { stopOnFail?: boolean } = {},
): Promise<boolean> {
  try {
    const out = (await body()) || {};
    if (page) await shot(page, { ...meta, status: out.status ?? 'pass', caption: out.caption ?? meta.caption, detail: out.detail, marks: out.marks });
    else note({ ...meta, status: out.status ?? 'pass', caption: out.caption ?? meta.caption, detail: out.detail });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n').slice(0, 6).join('\n') : String(err);
    if (page) await shot(page, { ...meta, status: 'fail', caption: meta.caption, detail: msg });
    else note({ ...meta, status: 'fail', caption: meta.caption, detail: msg });
    if (opts.stopOnFail) throw err;
    return false;
  }
}

export type CaughtMail = { id: string; at: string; to: string | string[]; cc?: string[]; from: string; subject: string; html?: string; attachments?: string[] };

/** The emails the app sent since a time, from the mail catcher (e2e/uat/tools/mail-catcher.mjs). */
export async function emailsSince(sinceIso: string): Promise<(CaughtMail & { kind: string; summary: string })[]> {
  const file = join(RESULTS, 'mail.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CaughtMail)
    .filter((m) => m.at >= sinceIso)
    .map((m) => ({ ...m, kind: 'email', summary: `${m.subject} → ${[m.to].flat().join(', ')}${m.cc?.length ? ` (cc ${m.cc.join(', ')})` : ''}` }));
}

/** Record the emails since a time as one note, so the report can list them under the test. */
export async function noteEmails(test: string, sinceIso: string, expectSome = true) {
  const mails = await emailsSince(sinceIso);
  note({
    test, step: 'email', status: mails.length || !expectSome ? 'pass' : 'fail',
    caption: `${mails.length} email(s) sent by the app during ${test}.`,
    detail: mails.map((m) => m.summary).join('\n').slice(0, 3000) || 'No email was sent.',
  });
  return mails;
}

// ------------------------------------------------------------------ shared checks

/** Open each sidebar page of the signed-in role and record one screenshot each. Returns the broken ones. */
export async function sweepSidebar(page: Page, test: string, stepNo: number | string, role: Role): Promise<{ total: number; broken: string[] }> {
  const start = page.url();
  const hrefs = await page
    .locator('nav a[href^="/app/"]')
    .evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))]);
  const broken: string[] = [];
  for (const href of hrefs) {
    const resp = await page.goto(href).catch(() => null);
    await page.waitForLoadState('networkidle').catch(() => {});
    const body = await page.locator('body').innerText().catch(() => '');
    const bad = (resp?.status() ?? 200) >= 400 || /Application error|Something went wrong|Internal Server Error/i.test(body);
    if (bad) broken.push(href);
    await shot(page, { test, step: stepNo, role, status: bad ? 'fail' : 'pass', caption: bad ? `${href} shows an error.` : `${href} opens with no error.` });
  }
  await page.goto(start).catch(() => {});
  return { total: hrefs.length, broken };
}

/** RFC 6238 code for a base32 secret, for the two-step sign-in checks. */
export function totpNow(base32: string, offsetSteps = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/[\s=-]/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}

/** The first visible element with this text (pages often keep a hidden copy for phones). */
export function seen(page: Page, text: string | RegExp): Locator {
  return page.getByText(text).locator('visible=true').first();
}

/** Wait until the page shows real content (the client portal renders after its data loads). */
export async function settle(page: Page, text?: string | RegExp) {
  await page.waitForLoadState('networkidle').catch(() => {});
  if (text) await seen(page, text).waitFor({ timeout: 30_000 });
  else await page.waitForFunction(() => (document.body?.innerText ?? '').trim().length > 40, null, { timeout: 30_000 });
}

/** The time a test first ran, kept across re-runs, so its email check also counts the first run's mail. */
export function firstStart(test: string): string {
  const key = `start_${test}`;
  const st = state<Record<string, string>>();
  if (!st[key]) setState({ [key]: new Date(Date.now() - 1000).toISOString() });
  return state<Record<string, string>>()[key];
}

/** One checklist step's stored state (engagements.checklist_state[itemId]). */
export async function stepState(engagementId: string, itemId: string): Promise<Record<string, any>> {
  const [row] = await sql<{ s: Record<string, any> | null }>(`select checklist_state->$2 as s from engagements where id = $1`, [engagementId, itemId]);
  return row?.s ?? {};
}
