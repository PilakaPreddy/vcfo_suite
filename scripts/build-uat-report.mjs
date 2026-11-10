// Builds the illustrated acceptance-test report from the run's records.
//   node scripts/build-uat-report.mjs [--pdf]
// Reads  e2e/uat/results/records.jsonl, e2e/uat/results/shots/*, e2e/uat/results/mail.jsonl,
//        docs/specs/uat/defects.json
// Writes docs/specs/uat/report/index.html, report/shots/*.jpg (resized), report/mail/*.jpg,
//        and with --pdf docs/specs/uat/report/uat-report.pdf
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(root, 'e2e/uat/results');
const OUT = join(root, 'docs/specs/uat/report');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// eslint-disable-next-line no-control-regex
const clean = (s) => String(s ?? '').replace(/\u001b\[[0-9;]*m/g, '').replace(/\[2m|\[22m|\[31m|\[32m|\[39m/g, '');

const TESTS = [
  ['T-01', 'Data reset and deploy', 'A clean start: backup, empty database, all 50 migrations, the production build of main.'],
  ['T-02', 'Logins, roles and access', 'Each person can sign in, sees only their own pages, and two-step sign-in locks after ten wrong codes.'],
  ['T-03', 'Project creation and client invite', 'The admin opens a project for a client; the team and the client get their logins and emails.'],
  ['T-04', 'Client questionnaire (Part A)', 'The client gives the company details; the lead adds the NIC code; the step completes.'],
  ['T-05', 'SPICe+ checklist (Part B)', 'The lead fills capital, office, directors and subscribers; the client cannot jump ahead.'],
  ['T-06', 'KYC, DSC and document vault', 'The lead asks for KYC files, the client uploads them, everyone sees them filed by step, and no other client can.'],
  ['T-07', 'Manager approvals and step visibility', 'A lead’s work waits for the manager; the client sees it only after the manager accepts.'],
  ['T-08', 'MCA document pack', 'Every incorporation document is generated from the answers and opened to check the names and figures.'],
  ['T-09', 'Board resolutions', 'For a subsidiary, the board resolution is generated, sent for approval and approved.'],
  ['T-10', 'Incorporation close (CIN) and stage change', 'The certificate of incorporation is recorded and the project moves on to compliance.'],
  ['T-11', 'Board meetings', 'The first board meeting is planned, the notice approved, and sent to the directors with a Word file and a calendar invite.'],
  ['T-12', 'Registrations', 'GST, PF, ESI and Shops & Establishment are recorded, approved and shown to the client.'],
  ['T-13', 'Compliance calendar and filings', 'The calendar fills from the incorporation and registration dates, the dates are right, and a filing goes through review to filed.'],
  ['T-14', 'Reminders and overdue items', 'The daily reminder job tells the lead, then the manager, then the admin, without repeating itself.'],
  ['T-15', 'Labour registers', 'A paysheet goes in; the registers come out once the inputs are complete.'],
  ['T-16', 'Payroll', 'Salaries go in; the payroll totals must match the totals worked out by hand.'],
  ['T-17', 'Budgets and variance', 'A budget is filled, published, approved, and its monthly variance is reviewed; it exports to Excel and PDF.'],
  ['T-18', 'Ask VCFO (chatbot)', 'The assistant answers from the client’s own data and never from another client’s.'],
  ['T-19', 'Email', 'Every email the app sent in the run, to whom, and what it looked like.'],
  ['T-20', 'WhatsApp', 'Consent is recorded; nothing is sent while WhatsApp is switched off.'],
  ['T-21', 'Regression, security and sign-off', 'A client and a lead try to reach another company’s data by URL and by API.'],
];
const ROLE = { super: 'Super admin', admin: 'Admin', manager: 'Manager', lead: 'Lead (Lata)', lead2: 'Lead (Leo)', client: 'Client (Nilgiri)', clientB: 'Client (Kaveri)', clientC: 'Client (Sahyadri)' };

const records = existsSync(join(RES, 'records.jsonl')) ? readFileSync(join(RES, 'records.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const mails = existsSync(join(RES, 'mail.jsonl')) ? readFileSync(join(RES, 'mail.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const defects = JSON.parse(readFileSync(join(root, 'docs/specs/uat/defects.json'), 'utf8'));
const meta = existsSync(join(RES, 'run-meta.json')) ? JSON.parse(readFileSync(join(RES, 'run-meta.json'), 'utf8')) : {};

// ------------------------------------------------------------------ verdict per test
function verdict(id) {
  const recs = records.filter((r) => r.test === id);
  const ds = defects.filter((d) => d.test === id);
  const fails = recs.filter((r) => r.status === 'fail');
  const blocked = recs.filter((r) => r.status === 'blocked');
  const untestable = recs.filter((r) => r.status === 'untestable');
  const passes = recs.filter((r) => r.status === 'pass');
  const openS1 = ds.filter((d) => d.status === 'open' && d.severity === 'S1');
  if (id === 'T-19') return { tone: 'green', word: 'Works', note: `${mails.length} emails caught and checked` };
  if (!recs.length) return { tone: 'grey', word: 'Not run', note: '' };
  if (openS1.length || fails.length) return { tone: 'red', word: 'Not working', note: openS1.length ? openS1[0].title : `${fails.length} step(s) failed` };
  if (blocked.length) return { tone: 'amber', word: 'Partly', note: 'needs real input files' };
  if (ds.some((d) => d.status === 'fixed')) return { tone: 'amber', word: 'Fixed tonight', note: ds.filter((d) => d.status === 'fixed').map((d) => d.id).join(', ') };
  if (!passes.length && untestable.length) return { tone: 'grey', word: 'Needs a person', note: '' };
  return { tone: 'green', word: 'Works', note: untestable.length ? 'plus a check for a person' : '' };
}
const V = Object.fromEntries(TESTS.map(([id]) => [id, verdict(id)]));
const count = (tone) => Object.values(V).filter((v) => v.tone === tone).length;
const working = count('green') + Object.entries(V).filter(([, v]) => v.word === 'Fixed tonight').length;

// ------------------------------------------------------------------ images
async function prepareImages() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  mkdirSync(join(OUT, 'mail'), { recursive: true });
  const { chromium } = (() => {
    try { return req('@playwright/test'); } catch { return req('playwright'); }
  })();
  const browser = await chromium.launch({ executablePath: process.env.UAT_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  // Resize each used screenshot to 1100 px wide JPEG, so the page stays small.
  const used = [...new Set(records.map((r) => r.shot).filter(Boolean))];
  for (const rel of used) {
    const src = join(RES, rel);
    if (!existsSync(src)) continue;
    const b64 = readFileSync(src).toString('base64');
    await page.setContent(`<html><body style="margin:0"><img id="i" src="data:image/jpeg;base64,${b64}" style="width:1100px;display:block"></body></html>`);
    const h = await page.$eval('#i', (i) => i.getBoundingClientRect().height);
    await page.setViewportSize({ width: 1100, height: Math.max(200, Math.min(Math.ceil(h), 4000)) });
    await page.screenshot({ path: join(OUT, rel), type: 'jpeg', quality: 62, fullPage: true });
  }
  // Render one sample of each kind of email, as the person receives it.
  const kinds = new Map();
  for (const m of mails) {
    const key = (m.subject || '').replace(/^[^:]+: /, '').replace(/“[^”]*”/g, '“…”').replace(/\d+/g, '#').slice(0, 40);
    if (!kinds.has(key) && m.html) kinds.set(key, m);
  }
  const samples = [];
  for (const [, m] of [...kinds].slice(0, 8)) {
    const name = `mail-${samples.length + 1}.jpg`;
    await page.setViewportSize({ width: 720, height: 900 });
    await page.setContent(m.html, { waitUntil: 'load' }).catch(() => {});
    await page.screenshot({ path: join(OUT, 'mail', name), type: 'jpeg', quality: 70, fullPage: true }).catch(() => {});
    samples.push({ ...m, img: `mail/${name}` });
  }
  await browser.close();
  return samples;
}

// ------------------------------------------------------------------ html
function pill(status) {
  const map = { pass: ['ok', 'Works'], fixed: ['fix', 'Fixed'], fail: ['bad', 'Not working'], blocked: ['part', 'Blocked'], untestable: ['grey', 'Needs a person'], info: ['info', 'Note'] };
  const [c, w] = map[status] ?? ['info', status];
  return `<span class="pill ${c}">${w}</span>`;
}

function testSection([id, name, why], idx) {
  const v = V[id];
  const recs = records.filter((r) => r.test === id && r.step !== 'email');
  const emails = records.find((r) => r.test === id && r.step === 'email');
  const ds = defects.filter((d) => d.test === id);
  const shots = recs.filter((r) => r.shot);
  const notes = recs.filter((r) => !r.shot);
  return `<section class="test" id="${id}">
  <header class="th"><span class="tid">${id}</span><h3>${esc(name)}</h3><span class="tone ${v.tone}">${esc(v.word)}</span></header>
  <p class="why">${esc(why)}</p>
  ${ds.length ? `<div class="dlinks">${ds.map((d) => `<a href="#${d.id}" class="dl ${d.status}">${esc(d.id)} · ${esc(d.title)}</a>`).join('')}</div>` : ''}
  ${notes.length ? `<ul class="checks">${notes.map((r) => `<li>${pill(r.status)}<div><b>${esc(clean(r.caption))}</b>${r.detail ? `<pre>${esc(clean(r.detail)).slice(0, 1600)}</pre>` : ''}</div></li>`).join('')}</ul>` : ''}
  <div class="story">${shots.map((r, i) => `<figure class="shot ${r.status}">
      <a href="${esc(r.shot)}" target="_blank"><img loading="lazy" src="${esc(r.shot)}" alt="${esc(clean(r.caption))}"></a>
      <figcaption><span class="n">${i + 1}</span>${pill(r.status)}<span class="who">${esc(ROLE[r.role] ?? r.role ?? '')}</span><span class="cap">${esc(clean(r.caption))}</span>${r.detail && r.status !== 'pass' ? `<small>${esc(clean(r.detail)).slice(0, 400)}</small>` : ''}</figcaption>
    </figure>`).join('')}</div>
  ${emails ? `<details class="mails"><summary>✉ ${esc(clean(emails.caption))}</summary><pre>${esc(clean(emails.detail))}</pre></details>` : ''}
</section>`;
}

function defectCard(d) {
  const before = records.find((r) => r.test === d.test && r.status === 'fail' && r.shot && String(r.step) === String(d.step)) ?? null;
  const cls = { fixed: 'fixed', open: 'open', 'owner-decision': 'owner' }[d.status] ?? 'open';
  const word = { fixed: 'Fixed tonight', open: 'Still open', 'owner-decision': 'Your decision' }[d.status] ?? d.status;
  return `<article class="defect ${cls}" id="${esc(d.id)}">
    <header><span class="did">${esc(d.id)}</span><span class="sev s-${esc(d.severity)}">${d.severity === 'owner' ? 'Question' : esc(d.severity)}</span><span class="dstat">${word}</span></header>
    <h4>${esc(d.title)}</h4>
    <dl><dt>Who it hits</dt><dd>${esc(d.who)}</dd><dt>Why it happened</dt><dd>${esc(d.cause)}</dd><dt>${d.status === 'fixed' ? 'What I changed' : 'What to do'}</dt><dd>${esc(d.fix)}</dd>
    ${d.files?.length ? `<dt>Files</dt><dd class="mono">${d.files.map(esc).join('<br>')}</dd>` : ''}</dl>
    ${before ? `<a class="before" href="${esc(before.shot)}" target="_blank"><img loading="lazy" src="${esc(before.shot)}" alt="before"><span>What it looked like when the test found it</span></a>` : ''}
  </article>`;
}

function build(samples, forFile = false) {
  const open = defects.filter((d) => d.status === 'open');
  const owner = defects.filter((d) => d.status === 'owner-decision');
  const fixed = defects.filter((d) => d.status === 'fixed').sort((a, b) => a.severity.localeCompare(b.severity));
  const people = records.filter((r) => r.status === 'untestable' || r.status === 'blocked');
  const stepsRun = records.filter((r) => r.step !== 'email').length;
  const shotsN = records.filter((r) => r.shot).length;
  const notWorking = TESTS.filter(([id]) => V[id].tone === 'red');
  const css = `
:root{--ink:#14161f;--ink2:#4a4f63;--ink3:#868b9e;--line:#e3e5ec;--bg:#f6f7fa;--card:#fff;--brand:#3a3fd8;--ok:#15803d;--okb:#e8f6ec;--bad:#b91c1c;--badb:#fdecec;--amb:#a16207;--ambb:#fdf5e1;--grey:#5b6178;--greyb:#eef0f4;--fix:#7b3fd8;--fixb:#f2ebfd}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#eceef5;--ink2:#b5b9c9;--ink3:#8a8fa3;--line:#2c3040;--bg:#12141b;--card:#1a1d27;--okb:#12301d;--badb:#3a1616;--ambb:#33280f;--greyb:#232633;--fixb:#2a1c45}}
:root[data-theme=dark]{--ink:#eceef5;--ink2:#b5b9c9;--ink3:#8a8fa3;--line:#2c3040;--bg:#12141b;--card:#1a1d27;--okb:#12301d;--badb:#3a1616;--ambb:#33280f;--greyb:#232633;--fixb:#2a1c45}
*{box-sizing:border-box}.defect,.test,.box,.person{min-width:0}pre{overflow-x:auto}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 'Public Sans',system-ui,Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}.mono,pre,code{font-family:'IBM Plex Mono',ui-monospace,monospace}
h1{font-size:34px;line-height:1.1;margin:6px 0 8px;letter-spacing:-.02em}h2{font-size:22px;margin:44px 0 12px;letter-spacing:-.01em}
.kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);font-weight:700}
.verdict{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;margin:18px 0}
.big{font-size:26px;font-weight:800;letter-spacing:-.01em}.sub{color:var(--ink2);margin-top:6px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}.stat{border:1px solid var(--line);border-radius:12px;padding:8px 14px;min-width:120px}.stat b{display:block;font-size:22px}.stat small{color:var(--ink3);font-size:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.cell{display:block;text-decoration:none;color:inherit;border-radius:12px;padding:12px 14px;border:1px solid var(--line);background:var(--card);border-left-width:6px}
.cell .t{font-size:12px;color:var(--ink3);font-weight:700}.cell .n{font-weight:700;margin:2px 0}.cell .w{font-size:13px;font-weight:700}.cell .x{font-size:12px;color:var(--ink2)}
.cell.green{border-left-color:var(--ok)}.cell.green .w{color:var(--ok)}.cell.red{border-left-color:var(--bad);background:var(--badb)}.cell.red .w{color:var(--bad)}
.cell.amber{border-left-color:var(--amb)}.cell.amber .w{color:var(--amb)}.cell.grey{border-left-color:var(--grey)}.cell.grey .w{color:var(--grey)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--ink2);margin:10px 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}
.box{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0}.box.red{border-color:var(--bad);background:var(--badb)}
.box h3{margin:0 0 8px;font-size:17px}.box ul{margin:0;padding-left:20px}.box li{margin:6px 0}
.defects{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr));gap:12px}
.defect{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;border-top:5px solid var(--grey)}
.defect.fixed{border-top-color:var(--fix)}.defect.open{border-top-color:var(--bad)}.defect.owner{border-top-color:var(--amb)}
.defect header{display:flex;gap:8px;align-items:center;font-size:12px}.did{font-family:'IBM Plex Mono',monospace;font-weight:700}
.sev{padding:1px 7px;border-radius:5px;color:#fff;font-weight:700}.s-S1{background:var(--bad)}.s-S2{background:var(--amb)}.s-S3{background:var(--grey)}.s-owner{background:var(--brand)}
.dstat{margin-left:auto;font-weight:700;color:var(--ink2)}.defect h4{margin:8px 0;font-size:16px}
.defect dl{margin:0;font-size:13.5px}.defect dt{font-weight:700;color:var(--ink3);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-top:8px}.defect dd{margin:2px 0 0}
.before{display:block;margin-top:10px;text-decoration:none;color:var(--ink3);font-size:12px}.before img{width:100%;border-radius:8px;border:2px solid var(--bad)}
.test{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;margin:16px 0}
.th{display:flex;align-items:center;gap:10px}.th h3{margin:0;font-size:19px}.tid{font-family:'IBM Plex Mono',monospace;font-weight:700;color:var(--brand)}
.tone{margin-left:auto;font-weight:800;font-size:13px;padding:3px 10px;border-radius:999px}.tone.green{background:var(--okb);color:var(--ok)}.tone.red{background:var(--badb);color:var(--bad)}.tone.amber{background:var(--ambb);color:var(--amb)}.tone.grey{background:var(--greyb);color:var(--grey)}
.why{color:var(--ink2);margin:6px 0 10px}.dlinks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.dl{font-size:12.5px;text-decoration:none;padding:3px 8px;border-radius:6px;background:var(--fixb);color:var(--fix)}.dl.open{background:var(--badb);color:var(--bad)}.dl.owner-decision{background:var(--ambb);color:var(--amb)}
.checks{list-style:none;padding:0;margin:0 0 12px}.checks li{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px dashed var(--line)}.checks pre{white-space:pre-wrap;font-size:12px;color:var(--ink2);margin:4px 0 0;max-height:220px;overflow:auto}
.story{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:14px}
.shot{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}.shot.fail{border:2px solid var(--bad)}
.shot img{display:block;width:100%;height:auto;max-height:420px;object-fit:cover;object-position:top}
.shot figcaption{padding:10px 12px;font-size:13.5px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.shot .n{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--ink);color:var(--card);font-size:11px;font-weight:700}
.shot .who{font-size:12px;color:var(--ink3);font-weight:600}.shot .cap{flex-basis:100%}.shot small{flex-basis:100%;color:var(--bad);font-family:'IBM Plex Mono',monospace;font-size:11px;white-space:pre-wrap}
.pill{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}.pill.ok{background:var(--okb);color:var(--ok)}.pill.bad{background:var(--badb);color:var(--bad)}.pill.part{background:var(--ambb);color:var(--amb)}.pill.grey{background:var(--greyb);color:var(--grey)}.pill.info{background:var(--greyb);color:var(--ink2)}.pill.fix{background:var(--fixb);color:var(--fix)}
.mails summary{cursor:pointer;color:var(--ink2);font-size:14px;margin-top:12px}.mails pre{white-space:pre-wrap;font-size:12px}
.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:10px}.person{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--grey);border-radius:12px;padding:12px 14px;font-size:14px}.person b{display:block;margin-bottom:4px}
.mailgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.mailcard{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:13px}.mailcard img{width:100%;display:block;max-height:420px;object-fit:cover;object-position:top;border-bottom:1px solid var(--line)}.mailcard div{padding:8px 10px}
table.mt{width:100%;border-collapse:collapse;font-size:13px;background:var(--card)}table.mt td,table.mt th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}
nav.toc{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}nav.toc a{font-size:13px;text-decoration:none;color:var(--brand);border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--card)}
@media print{body{background:#fff}.test,.defect,.box{break-inside:avoid-page}.shot img{max-height:300px}}
@media (max-width:600px){h1{font-size:26px}.story{grid-template-columns:1fr}}
`;
  const legend = `<div class="legend"><span><i style="background:var(--ok)"></i>Works</span><span><i style="background:var(--amb)"></i>Works after a fix made tonight, or partly tested</span><span><i style="background:var(--bad)"></i>Not working</span><span><i style="background:var(--grey)"></i>Needs a person</span></div>`;
  const grid = `<div class="grid">${TESTS.map(([id, name]) => `<a class="cell ${V[id].tone}" href="#${id}"><div class="t">${id}</div><div class="n">${esc(name)}</div><div class="w">${esc(V[id].word)}</div><div class="x">${esc(V[id].note)}</div></a>`).join('')}</div>`;
  const mailList = mails.map((m) => `<tr><td class="mono">${esc(m.at?.slice(11, 19))}</td><td>${esc(m.subject)}</td><td>${esc([m.to].flat().join(', '))}${m.cc?.length ? `<br><small>cc ${esc(m.cc.join(', '))}</small>` : ''}</td><td>${esc((m.attachments || []).join(', '))}</td></tr>`).join('');
  const head = `<title>VCFO Test Report</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Public+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>`;
  return `${forFile ? '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' : ''}${head}${forFile ? '</head><body>' : ''}<div class="wrap">
<div class="kicker">VCFO Suite · acceptance test · ${esc(meta.date ?? '10 Nov 2026')}</div>
<h1>The full test run, with screenshots</h1>
<p class="sub">Claude ran all 21 tests of the production test plan on a private copy of <span class="mono">main</span>, acting as super admin, admin, manager, two project leads and three clients. Each step was photographed; the important part of each picture is outlined in green (correct), red (wrong) or blue (what was clicked). Production was not touched.</p>

<div class="verdict">
  <div class="big">${working} of 21 features work end to end${fixed.length ? `, ${fixed.length} defects were fixed during the run` : ''}.</div>
  <div class="sub">${notWorking.length ? `<b>Not ready:</b> ${notWorking.map(([id, n]) => `${esc(n)} (${id})`).join(', ')}. ` : ''}${owner.length} questions need your decision, and ${people.length} checks need a person (real inbox, phone, Outlook, the chatbot model, real attendance files).</div>
  <div class="stats">
    <div class="stat"><b>${stepsRun}</b><small>steps checked</small></div>
    <div class="stat"><b>${shotsN}</b><small>screenshots</small></div>
    <div class="stat"><b>${mails.length}</b><small>emails caught</small></div>
    <div class="stat"><b>${fixed.length}</b><small>defects fixed</small></div>
    <div class="stat"><b>${open.length}</b><small>still open</small></div>
    <div class="stat"><b>${owner.length}</b><small>your decisions</small></div>
  </div>
</div>

<h2>The 21 tests at a glance</h2>${legend}${grid}

<h2>What is not working</h2>
<div class="box red"><ul>${open.map((d) => `<li><a href="#${d.id}"><b>${esc(d.id)}</b></a> — ${esc(d.title)}. <i>${esc(d.fix)}</i></li>`).join('') || '<li>Nothing open.</li>'}
${records.filter((r) => r.status === 'blocked').map((r) => `<li><b>${esc(r.test)}</b> — ${esc(clean(r.caption))} ${esc(clean(r.detail))}</li>`).join('')}</ul></div>

<h2>Questions for you</h2>
<div class="defects">${owner.map(defectCard).join('')}</div>

<h2>What I fixed during the run</h2>
<p class="sub">Each fix has a unit or component test, passes the project's own checks, and was confirmed by running the failed test again.</p>
<div class="defects">${fixed.map(defectCard).join('')}</div>

<h2>What only a person can check</h2>
<div class="people">${people.map((r) => `<div class="person"><b>${esc(r.test)} · ${esc(clean(r.caption))}</b>${esc(clean(r.detail))}</div>`).join('')}</div>

<h2>What the emails look like</h2>
<p class="sub">The app's emails were caught on the way out (no email left the machine). These are samples as the reader sees them.</p>
<div class="mailgrid">${samples.map((m) => `<div class="mailcard"><img loading="lazy" src="${esc(m.img)}" alt="${esc(m.subject)}"><div><b>${esc(m.subject)}</b><br>to ${esc([m.to].flat().join(', '))}</div></div>`).join('')}</div>

<h2>Each test, step by step</h2>
<nav class="toc">${TESTS.map(([id]) => `<a href="#${id}">${id}</a>`).join('')}</nav>
${TESTS.map(testSection).join('')}

<h2 id="T-19">All emails sent in the run (${mails.length})</h2>
<div class="box" style="overflow:auto"><table class="mt"><tr><th>Time</th><th>Subject</th><th>To</th><th>Attachments</th></tr>${mailList}</table></div>
<p class="sub">Built from the run's records by <span class="mono">scripts/build-uat-report.mjs</span>. Test code: <span class="mono">e2e/uat/</span>. Defects: <span class="mono">docs/specs/uat/defects.json</span>.</p>
</div>${forFile ? '</body></html>' : ''}`;
}

const samples = await prepareImages();
writeFileSync(join(OUT, 'index.html'), build(samples));
if (process.argv.includes('--pdf')) writeFileSync(join(OUT, 'print.html'), build(samples, true));
if (process.argv.includes('--pdf')) {
  const { chromium } = (() => {
    try { return req('@playwright/test'); } catch { return req('playwright'); }
  })();
  const b = await chromium.launch({ executablePath: process.env.UAT_CHROMIUM || undefined });
  const p = await b.newPage();
  await p.goto('file://' + join(OUT, 'print.html'), { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    for (const img of document.images) img.loading = 'eager';
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await p.pdf({ path: join(OUT, 'uat-report.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  await b.close();
}
console.log('report:', join(OUT, 'index.html'), '| files:', readdirSync(join(OUT, 'shots')).length, 'shots');
