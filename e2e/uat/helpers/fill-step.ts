import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { UAT_DIR } from './uat';

/**
 * Fill a checklist step page the way a careful person would: every section tab, every empty field,
 * with sensible values for an Indian private company. `values` sets exact answers by field id (the
 * part after `${itemId}-`) or by a label pattern; `choices` picks a segmented answer by its group label.
 * Returns a short list of what it filled, for the report caption.
 */
export type FillPlan = {
  itemId: string;
  values?: Record<string, string>;
  /** Label regex source → option text, for Yes/No and other segmented groups. */
  choices?: Record<string, string>;
  file?: string;
};

export const FILES = join(UAT_DIR, 'fixtures/files');

function guess(label: string, type: string): string {
  const l = label.toLowerCase();
  if (/middle name/.test(l)) return '';
  if (/birth|dob/.test(l)) return '1988-04-14';
  if (/expiry|valid (till|until)/.test(l)) return '2028-11-02';
  if (type === 'date' || /\bdate\b|\bdated\b|\bon\b$/.test(l)) return '2026-11-02';
  if (/e-?mail/.test(l)) return 'accounts@nilgiri-analytics.test';
  if (/mobile|phone|contact no/.test(l)) return '9845012345';
  if (/pin ?code|postal|\bpin\b/.test(l)) return '560025';
  if (/\bpan\b/.test(l)) return 'ABCPR1234K';
  if (/aadhaar/.test(l)) return '234567890123';
  if (/\bdin\b/.test(l)) return '10234567';
  if (/\bcin\b|corporate identification/.test(l)) return 'U62011KA2026PTC198765';
  if (/srn|reference|ack|arn|application (no|number)/.test(l)) return 'SRN-AB1234567';
  if (/gstin/.test(l)) return '29AAKCK1234F1Z5';
  if (/\btan\b/.test(l)) return 'BLRN12345F';
  if (/ifsc/.test(l)) return 'HDFC0001234';
  if (/account (no|number)/.test(l)) return '50200012345678';
  if (/percent|%/.test(l)) return '60';
  if (/nominal|face value|per share/.test(l)) return '10';
  if (/number of|count|shares|quantity|no\. of/.test(l)) return '10000';
  if (/amount|capital|₹|inr|fee|value|price|paid/.test(l)) return '100000';
  if (/city|town/.test(l)) return 'Bengaluru';
  if (/state/.test(l)) return 'Karnataka';
  if (/country/.test(l)) return 'India';
  if (/address/.test(l)) return '4th Floor, 12 Residency Road, Bengaluru, Karnataka 560025';
  if (/name/.test(l)) return 'Kiran Rao';
  if (/designation|role|position/.test(l)) return 'Director';
  if (/remark|note|comment|description/.test(l)) return '';
  return 'UAT sample';
}

/** The section tabs of the step form (not the page-level Forms/Activity tabs). */
async function sectionTabs(page: Page) {
  const names = await page.locator('[role=tab]').evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e.textContent ?? '').trim())
      .filter((t) => t && !/^Forms$|^Activity\d*$/.test(t)),
  );
  return [...new Set(names)];
}

export async function fillStep(page: Page, plan: FillPlan): Promise<string[]> {
  const did: string[] = [];
  const tabs = await sectionTabs(page);
  for (const name of tabs.length ? tabs : ['']) {
    if (name) await page.getByRole('tab', { name, exact: true }).locator('visible=true').first().click().catch(() => {});
    await page.waitForTimeout(300);
    did.push(...(await fillVisible(page, plan)));
  }
  return did;
}

async function fillVisible(page: Page, plan: FillPlan): Promise<string[]> {
  const did: string[] = [];
  // 1. Segmented answers (Yes/No and the like).
  const groups = page.locator('[role=radiogroup]').locator('visible=true');
  for (let i = 0; i < (await groups.count()); i++) {
    const g = groups.nth(i);
    const checked = await g.locator('[aria-checked=true], input:checked').count();
    if (checked) continue;
    const label = ((await g.getAttribute('aria-label')) ?? (await g.evaluate((e) => e.closest('[class]')?.parentElement?.textContent ?? ''))).slice(0, 80);
    let want: string | undefined;
    for (const [re, opt] of Object.entries(plan.choices ?? {})) if (new RegExp(re, 'i').test(label)) want = opt;
    const radios = g.getByRole('radio');
    const target = want ? radios.filter({ hasText: want }).first() : radios.first();
    if (await target.count()) {
      await target.click().catch(() => {});
      did.push(`${label.trim().split('\n')[0]} → ${(await target.innerText().catch(() => '?')).trim()}`);
    }
  }
  // 2. Text, number, date and long text fields of this step.
  const fields = page.locator(`input[id^="${plan.itemId}-"], textarea[id^="${plan.itemId}-"]`).locator('visible=true');
  for (let i = 0; i < (await fields.count()); i++) {
    const f = fields.nth(i);
    const id = (await f.getAttribute('id'))!;
    const fieldId = id.slice(plan.itemId.length + 1);
    const type = (await f.getAttribute('type')) ?? 'text';
    if (['file', 'checkbox', 'radio', 'hidden'].includes(type)) continue;
    if (!(await f.isEditable().catch(() => false))) continue;
    if ((await f.inputValue().catch(() => '')).trim()) continue;
    const label = await f.evaluate((e) => {
      const el = e as HTMLInputElement;
      const own = el.labels?.[0]?.textContent ?? el.getAttribute('aria-label') ?? '';
      if (own.trim()) return own;
      const box = el.closest('div')?.parentElement;
      return box?.querySelector('label, span, p')?.textContent ?? '';
    });
    const value = plan.values?.[fieldId] ?? guess(label, type);
    if (!value) continue;
    await f.fill(value).catch(() => {});
    did.push(`${label.trim().replace(/\s*\*$/, '').slice(0, 60)} = ${value}`);
  }
  // 3. Pick lists that still show a placeholder.
  const combos = page.locator(`[id^="${plan.itemId}-"][role=combobox], button[role=combobox][id^="${plan.itemId}-"]`).locator('visible=true');
  for (let i = 0; i < (await combos.count()); i++) {
    const c = combos.nth(i);
    const text = (await c.innerText().catch(() => '')).trim();
    const cid = ((await c.getAttribute('id')) ?? '').slice(plan.itemId.length + 1);
    const wanted = plan.values?.[cid];
    if (text && !/select|choose|pick/i.test(text) && (!wanted || text.includes(wanted))) continue;
    await c.click().catch(() => {});
    const opt = wanted ? page.getByRole('option', { name: wanted }).first() : page.getByRole('option').first();
    if (await opt.count()) {
      did.push(`${text || 'list'} → ${(await opt.innerText()).trim()}`);
      await opt.click();
    } else await page.keyboard.press('Escape');
  }
  const selects = page.locator(`select[id^="${plan.itemId}-"]`).locator('visible=true');
  for (let i = 0; i < (await selects.count()); i++) {
    const s = selects.nth(i);
    const sid = ((await s.getAttribute('id')) ?? '').slice(plan.itemId.length + 1);
    const wanted = plan.values?.[sid];
    if ((await s.inputValue()) && !wanted) continue;
    if (wanted) {
      await s.selectOption({ label: wanted }).catch(async () => s.selectOption(wanted));
      did.push(`select → ${wanted}`);
      continue;
    }
    const opts = await s.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value).filter(Boolean));
    if (opts[0]) {
      await s.selectOption(opts[0]);
      did.push(`select → ${opts[0]}`);
    }
  }
  // 4. File fields: upload the sample PDF where nothing is attached yet.
  const files = page.locator('input[type=file]');
  for (let i = 0; i < (await files.count()); i++) {
    const inp = files.nth(i);
    const id = (await inp.getAttribute('id')) ?? '';
    if (id && !id.startsWith(`${plan.itemId}-`)) continue;
    const box = inp.locator('xpath=ancestor::*[self::div][2]');
    const visible = await box.isVisible().catch(() => false);
    if (!visible) continue;
    const has = await box.getByText(/\.pdf|\.png|Replace|Remove|View/i).count();
    if (has) continue;
    await inp.setInputFiles(join(FILES, plan.file ?? 'office-noc.pdf')).catch(() => {});
    await page.waitForTimeout(1200);
    did.push(`file → ${plan.file ?? 'office-noc.pdf'}`);
  }
  return did;
}

/** Click the step's main action: Submit, or Request manager approval for an approval step. */
export async function submitStep(page: Page, action: 'submit' | 'approval' = 'submit'): Promise<string> {
  // Let the autosave finish first, as a person would see "Saved" before submitting.
  await page.getByText(/^Saved/).locator('visible=true').first().waitFor({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const order = action === 'approval' ? [/^Request manager approval/, /^Submit$/] : [/^Submit$/, /^Submit for review/, /^Request manager approval/, /^Mark complete/, /^Complete step/];
  for (const name of order) {
    const b = page.getByRole('button', { name }).locator('visible=true').first();
    if ((await b.count()) && (await b.isEnabled())) {
      const text = (await b.innerText()).trim();
      await b.click();
      await page.waitForTimeout(2000);
      const ok = page.getByRole('button', { name: 'OK' }).locator('visible=true').first();
      if (await ok.count()) await ok.click().catch(() => {});
      return text;
    }
  }
  return '';
}

/** The validation messages visible now (used when a submit is refused). */
export async function visibleErrors(page: Page): Promise<string[]> {
  const t = await page.locator('[role=alert], [role=status], .text-danger, [data-error]').locator('visible=true').allInnerTexts().catch(() => []);
  return [...new Set(t.map((x) => (x ?? '').trim()).filter(Boolean))].slice(0, 8);
}

export { expect };

import { shot, stepState, note } from './uat';

/**
 * Open one step as staff, fill it, screenshot the filled form, submit, and record the outcome.
 * `expectStatus` is what the stored step status should become (default: completed or waiting
 * for approval). Returns the status that was stored.
 */
export async function runStep(
  page: Page,
  o: {
    test: string;
    stepNo: number | string;
    role: 'lead' | 'lead2' | 'manager' | 'admin';
    engagement: { id: string; slug: string };
    itemId: string;
    slug: string;
    title: string;
    plan?: Omit<FillPlan, 'itemId'>;
    expectStatus?: RegExp;
    action?: 'submit' | 'approval';
  },
): Promise<string> {
  const base = o.role.startsWith('lead') ? `/app/intern/engagements/${o.engagement.slug}` : `/app/${o.role}/projects/${o.engagement.slug}`;
  await page.goto(`${base}/step/${o.slug}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByRole('heading', { name: o.title }).first().waitFor({ timeout: 30_000 }).catch(() => {});
  const before = (await stepState(o.engagement.id, o.itemId)).status ?? 'not-started';
  if (/completed|awaiting|waiting|pending-approval|not-applicable/.test(before)) {
    note({ test: o.test, step: o.stepNo, role: o.role, status: 'pass', caption: `${o.title}: already ${before}.` });
    return before;
  }
  const did = await fillStep(page, { itemId: o.itemId, ...(o.plan ?? {}) });
  const submit = page.getByRole('button', { name: /^(Submit|Request manager approval)/ }).locator('visible=true').first();
  await shot(page, {
    test: o.test, step: o.stepNo, role: o.role, status: 'pass',
    caption: `${o.title}: the lead fills the form (${did.length} answers).`,
    detail: did.join('\n').slice(0, 1500),
    marks: [{ at: submit, kind: 'focus', n: 1 }],
  });
  const clicked = await submitStep(page, o.action);
  await page.waitForTimeout(1500);
  const afterSlice = await stepState(o.engagement.id, o.itemId);
  const after = o.action === 'approval' ? `${afterSlice.status ?? 'not-started'} · review ${afterSlice.reviewStatus ?? '—'}` : afterSlice.status ?? 'not-started';
  const ok = (o.expectStatus ?? /completed|awaiting|waiting|review|pending/).test(after);
  const errs = ok ? [] : await visibleErrors(page);
  await shot(page, {
    test: o.test, step: o.stepNo, role: o.role, status: ok ? 'pass' : 'fail',
    caption: ok ? `${o.title}: "${clicked}" clicked; the step is now "${after}".` : `${o.title}: after "${clicked || 'no submit button'}" the step is still "${after}".`,
    detail: errs.join('\n') || undefined,
    marks: ok ? [] : [{ at: page.locator('[role=alert]').locator('visible=true').first(), kind: 'bad', label: 'Refused' }],
  });
  return after;
}
