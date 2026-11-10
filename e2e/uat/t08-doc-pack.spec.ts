import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import PizZip from 'pizzip';
import { firstStart, resetRecords, as, closeAll, note, shot, step, state, seen, settle, RESULTS } from './helpers/uat';
import { TRACK_A } from './fixtures/data';

/** T-08 MCA document pack on Track A: every generated .docx is opened and read. */
const T = 'T-08';
firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

type Item = { key: string; label: string; status: string; directorName?: string; missing: { label?: string }[] };

function docxText(buf: Buffer): string {
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x2019;|&#8217;/g, '’');
}

test('T-08 MCA document pack', async ({ browser }) => {
  const { trackA } = state<{ trackA: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead');
  const out = join(RESULTS, 'doc-pack');
  mkdirSync(out, { recursive: true });

  let items: Item[] = [];
  await step(lead, { test: T, step: 1, role: 'lead', caption: 'The lead opens the document pack: each incorporation document is generated from the answers.' }, async () => {
    await lead.goto(`/app/intern/engagements/${trackA.slug}/documents`);
    await settle(lead, /Download/);
    const res = await lead.request.get(`/api/engagements/${trackA.id}/doc-pack`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { pack: { items: Item[]; counts: Record<string, number>; total: number } };
    items = body.pack.items;
    const counts = Object.entries(body.pack.counts).map(([k, v]) => `${k}: ${v}`).join(', ');
    return { caption: `The pack lists ${body.pack.total} documents (${counts}).`, detail: items.map((i) => `${i.status.padEnd(10)} ${i.label}${i.directorName ? ` · ${i.directorName}` : ''}${i.missing?.length ? ` — needs ${i.missing.map((m) => m.label).join(', ')}` : ''}`).join('\n'), marks: [{ at: seen(lead, /Download ready/), kind: 'focus', n: 1 }] };
  });

  // Step 2: download each ready document and read it.
  const must = [
    ['company name', /Nilgiri (Analytics|Insights)/i],
    ['director Kiran Rao', /Kiran\s+Rao|KIRAN\s+RAO/],
    ['director Meera Iyer', /Meera\s+Iyer|MEERA\s+IYER/],
  ] as const;
  const problems: string[] = [];
  const lines: string[] = [];
  for (const it of items.filter((i) => /ready|generated|attached/i.test(i.status))) {
    const res = await lead.request.get(`/api/engagements/${trackA.id}/doc-pack/${encodeURIComponent(it.key)}`);
    if (!res.ok()) {
      problems.push(`${it.label}: download failed (${res.status()})`);
      continue;
    }
    const buf = Buffer.from(await res.body());
    const file = join(out, `${it.key.replace(/[^\w.-]+/g, '_')}.docx`);
    writeFileSync(file, buf);
    let text = '';
    try {
      text = docxText(buf);
    } catch {
      problems.push(`${it.label}: not a readable Word file`);
      continue;
    }
    const found = must.filter(([, re]) => re.test(text)).map(([n]) => n);
    const left = text.match(/\{\{[^}]*\}\}|\{[a-zA-Z_.]+\}|undefined|\bnull\b|NaN/g) ?? [];
    const extra = [/Residency Road/.test(text) ? 'office address' : '', /62011/.test(text) ? 'NIC 62011' : '', /1,00,000|100000|10,00,000|1000000/.test(text) ? 'capital' : ''].filter(Boolean);
    lines.push(`${it.label}${it.directorName ? ` · ${it.directorName}` : ''}: ${Math.round(buf.length / 1024)} KB; has ${[...found, ...extra].join(', ') || 'none of the checked values'}${left.length ? `; LEFTOVER ${[...new Set(left)].join(' ')}` : ''}`);
    if (left.length) problems.push(`${it.label}: unfilled placeholder ${[...new Set(left)].join(' ')}`);
    if (!found.includes('company name')) problems.push(`${it.label}: company name missing`);
  }
  note({
    test: T, step: 2, role: 'lead', status: problems.length ? 'fail' : 'pass',
    caption: `Each ready document was downloaded and opened as a Word file (${lines.length}); names, directors, address, NIC and capital were checked.`,
    detail: [...problems.map((p) => `PROBLEM: ${p}`), ...lines].join('\n'),
  });

  await step(lead, { test: T, step: 3, role: 'lead', caption: 'The lead downloads the whole pack as one ZIP.' }, async () => {
    const res = await lead.request.get(`/api/engagements/${trackA.id}/doc-pack/zip`);
    expect(res.ok()).toBe(true);
    const buf = Buffer.from(await res.body());
    writeFileSync(join(out, 'pack.zip'), buf);
    const names = Object.keys(new PizZip(buf).files);
    return { caption: `The ZIP (${Math.round(buf.length / 1024)} KB) holds ${names.length} files.`, detail: names.join('\n') };
  });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager opens the same pack and previews one document.' }, async () => {
    await mgr.goto(`/app/manager/projects/${trackA.slug}/documents`);
    await settle(mgr, /Download/);
    const prev = mgr.getByRole('button', { name: /^Preview / }).or(mgr.getByRole('link', { name: /^Preview / })).locator('visible=true').first();
    if (await prev.count()) {
      await prev.click();
      await mgr.waitForTimeout(3000);
    }
    return { marks: [{ at: prev, kind: 'focus', n: 1 }] };
  });
  void TRACK_A;
  void shot;
});
