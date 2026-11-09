#!/usr/bin/env node
'use strict';
/*
 * Builds docs/specs/budget/budget-prototype.html from the raw folder that capture.cjs wrote.
 * It works offline: every stylesheet, font and image is already in the raw folder.
 *
 *   node scripts/budget-prototype/build.cjs --raw=/tmp/bp-raw [--out=docs/specs/budget/budget-prototype.html]
 */
const fs = require('fs');
const path = require('path');
const { ROOT, PERSONAS, sha, readJson, parseArgs, dropFontSubsets, isAssetUrl, demoPasswords } = require('./common.cjs');

const args = parseArgs(process.argv.slice(2));
const RAW = path.resolve(args.raw || path.join(require('os').tmpdir(), 'budget-prototype-raw'));
const OUT = path.resolve(args.out || path.join(ROOT, 'docs/specs/budget/budget-prototype.html'));
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const meta = readJson(path.join(RAW, 'meta.json'));
if (!meta) throw new Error(`No capture in ${RAW}. Run capture.cjs first.`);
const BASE = meta.base;
const cssFiles = readJson(path.join(RAW, 'css.json'), {});
const assetFiles = readJson(path.join(RAW, 'assets.json'), {});
const stores = {};
for (const p of PERSONAS) {
  const s = readJson(path.join(RAW, 'personas', `${p.key}.json`));
  if (s) stores[p.key] = s;
}

/* ---------- files: each image or font is embedded once and referenced by a token ---------- */

const assetList = [];
const assetIndex = new Map();
function token(absUrl) {
  const data = assetFiles[absUrl];
  if (!data) return null;
  if (!assetIndex.has(data)) {
    assetIndex.set(data, assetList.length);
    assetList.push(data);
  }
  return `__A${assetIndex.get(data)}__`;
}
function resolve(u, base) {
  try {
    return new URL(u.replace(/&amp;/g, '&'), base).href;
  } catch {
    return null;
  }
}
function swapUrl(u, base) {
  if (!isAssetUrl(u)) return null;
  const abs = resolve(u, base);
  return (abs && token(abs)) || BLANK;
}

function inlineCssUrls(css, base) {
  return css.replace(/url\(\s*(&quot;|["'])?([^"')&]+?)(?:&quot;|["'])?\s*\)/g, (m, q, u) => {
    const t = swapUrl(u, base);
    return t ? `url(${q || ''}${t}${q || ''})` : m;
  });
}

function inlineHtml(html) {
  return html.replace(/<([a-zA-Z][\w:-]*)(\s[^>]*)?>/g, (tag, name, attrs) => {
    if (!attrs) return tag;
    let a = attrs;
    if (name.toLowerCase() !== 'a') {
      a = a.replace(/(\s(?:src|href|xlink:href|poster))="([^"]*)"/g, (m, attr, u) => {
        const t = swapUrl(u, BASE);
        return t ? `${attr}="${t}"` : m;
      });
    }
    if (a.includes('url(')) a = a.replace(/(\sstyle)="([^"]*)"/g, (m, attr, v) => `${attr}="${inlineCssUrls(v, BASE)}"`);
    return a === attrs ? tag : `<${name}${a}>`;
  });
}

/* ---------- scrubbing and normalising ---------- */

function scrub(text) {
  return text.replace(/[\w.+-]+@sbcllp\.in/gi, 'support@example.com').replace(/sbcllp\.in/gi, 'example.com');
}

/** React and Recharts number their ids per render. Renumbering them lets identical screens share one template. */
function normalise(html, prefix) {
  const map = new Map();
  return html.replace(/_r_[0-9a-z]+_|recharts\d+-clip/g, (m) => {
    if (!map.has(m)) map.set(m, `${prefix}${map.size + 1}`);
    return map.get(m);
  });
}

/* ---------- templates ---------- */

const templates = { shell: [], head: [], body: [], dialog: [], panel: [] };
const byHash = {};
const PREFIX = { shell: 's', head: 'h', body: 'b', dialog: 'd', panel: 'p' };
function addTemplate(kind, html, use) {
  if (!html || !html.trim()) return null;
  const norm = normalise(scrub(html), `p${PREFIX[kind]}-`);
  const h = kind + sha(norm);
  if (!byHash[h]) {
    const id = `${kind}-${String(templates[kind].length + 1).padStart(3, '0')}`;
    byHash[h] = { id, html: inlineHtml(norm), uses: [] };
    templates[kind].push(byHash[h]);
  }
  if (use && !byHash[h].uses.includes(use)) byHash[h].uses.push(use);
  return byHash[h].id;
}

const personaOf = Object.fromEntries(PERSONAS.map((p) => [p.key, p]));
const budgetName = (b) => (b === 'list' ? 'All budgets' : meta.budgets[b].name);

const manifest = { screens: {}, tabs: {}, subs: {}, dialogs: {}, panels: {}, attrs: {}, personas: {}, budgets: {} };
const STATUS = { draft: 'draft', published: 'waiting for approval', approved: 'approved', revising: 'revision in progress' };
for (const [k, b] of Object.entries(meta.budgets)) manifest.budgets[k] = { id: b.id, name: b.name, status: b.status, label: `${b.name}: ${STATUS[b.status] || b.status}` };

const styleSets = { staff: [], client: [] };
const seenStyle = { staff: new Set(), client: new Set() };
const failures = [];
const refused = new Set();

for (const p of PERSONAS) {
  const s = stores[p.key];
  if (!s) continue;
  failures.push(...s.failures);
  (s.blocked || []).forEach((b) => refused.add(b));
  const css = p.group === 'client' ? 'client' : 'staff';
  for (const sc of s.screens) {
    for (const st of s.styles[sc.styles] || []) {
      const k = st.href ? st.href.replace(/\?.*$/, '') : sha(st.text);
      if (!seenStyle[css].has(k)) {
        seenStyle[css].add(k);
        styleSets[css].push(st);
      }
    }
    const use = `${p.label} / ${budgetName(sc.budget)} / ${sc.tab === 'list' ? 'list' : sc.tab}${sc.sub ? ` / ${sc.sub}` : ''}`;
    const shell = addTemplate('shell', s.html[sc.shell], `${p.label} / ${budgetName(sc.budget)}`);
    const head = addTemplate('head', s.html[sc.head], use);
    const body = addTemplate('body', s.html[sc.body], use) || addTemplate('body', '<div></div>', use);
    manifest.attrs[shell] = s.attrs[sc.attrs];
    manifest.screens[[p.key, sc.budget, sc.tab, sc.sub].join('|')] = { shell, head, body, css, who: sc.who };
  }
  Object.assign(manifest.tabs, s.tabs);
  Object.assign(manifest.subs, s.subs);
  for (const d of s.dialogs) {
    const id = addTemplate('dialog', s.html[d.html], `${p.label} / ${budgetName(d.budget)} / ${d.tab === '*' ? '' : `${d.tab} / `}${d.trigger}`);
    manifest.dialogs[[p.key, d.budget, d.tab, d.sub, d.trigger].join('|')] = id;
  }
  for (const pl of s.panels) {
    manifest.panels[[p.key, pl.budget, pl.tab].join('|')] = pl.list.map((h, i) => (h ? addTemplate('panel', s.html[h], `${p.label} / ${budgetName(pl.budget)} / ${pl.tab} / row ${i + 1}`) : null));
  }
  const budgets = Object.keys(s.tabs).filter((k) => k.startsWith(`${p.key}|`)).map((k) => k.split('|')[1]);
  if (s.screens.length) manifest.personas[p.key] = { code: p.code, label: p.label, budgets };
}

/* ---------- stylesheets ---------- */

function cssTemplate(kind) {
  const parts = styleSets[kind].map((st) => {
    const text = st.href ? cssFiles[st.href] || '' : st.text;
    const base = st.href || BASE;
    return `<style>${inlineCssUrls(dropFontSubsets(scrub(text)), base).replace(/<\/(style|template)/gi, '<\\/$1')}</style>`;
  });
  return `<template id="css-${kind}">${parts.join('\n')}</template>`;
}

/* ---------- write the file ---------- */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const comment = (t) => {
  const uses = t.uses.length > 12 ? [...t.uses.slice(0, 12), `and ${t.uses.length - 12} more`] : t.uses;
  return `<!-- ${t.id}: ${uses.join('; ').replace(/--/g, '-')} -->`;
};
const blocks = [cssTemplate('staff'), cssTemplate('client')];
for (const kind of Object.keys(templates)) for (const t of templates[kind]) blocks.push(`${comment(t)}\n<template id="${t.id}">\n${t.html.replace(/<\/template/gi, '&lt;/template')}\n</template>`);

const personaOptions = [];
for (const [group, label] of [['staff', 'SBC staff'], ['client', 'Client company']]) {
  personaOptions.push(`      <optgroup label="${label}">`);
  for (const p of PERSONAS.filter((x) => x.group === group)) personaOptions.push(`        <option value="${p.key}"${manifest.personas[p.key] ? '' : ' disabled'}>${esc(p.label)}</option>`);
  personaOptions.push('      </optgroup>');
}
const budgetOptions = [`      <option value="list">All budgets</option>`, ...Object.entries(manifest.budgets).map(([k, b]) => `      <option value="${k}">${esc(b.label)}</option>`)];

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
let html = fs.readFileSync(path.join(__dirname, 'player.html'), 'utf8');
html = html
  .replace('__CAPTURED_AT__', meta.capturedAt.slice(0, 10))
  .replace('__PERSONA_OPTIONS__', () => personaOptions.join('\n'))
  .replace('__BUDGET_OPTIONS__', () => budgetOptions.join('\n'))
  .replace('__TEMPLATES__', () => blocks.join('\n\n'))
  .replace('__MANIFEST__', () => json(manifest))
  .replace('__ASSETS__', () => json(assetList));

/* ---------- checks: no secrets, no live addresses ---------- */

const problems = [];
for (const pw of new Set(Object.values(demoPasswords()))) if (html.includes(pw)) problems.push('a demo password');
if (/sbcllp/i.test(html)) problems.push('an sbcllp address');
if ((html.match(/<script\b/gi) || []).length !== 3) problems.push('a script inside the templates');
if (problems.length) throw new Error(`Build stopped: the file would contain ${problems.join(', ')}.`);

fs.writeFileSync(OUT, html);
const count = (k) => templates[k].length;
console.log(`Wrote ${OUT} (${(html.length / 1048576).toFixed(1)} MB)`);
console.log(`Templates: ${count('shell')} shells, ${count('head')} heads, ${count('body')} bodies, ${count('dialog')} dialogs, ${count('panel')} panels; ${assetList.length} embedded files`);
for (const p of PERSONAS) {
  const keys = Object.keys(manifest.screens).filter((k) => k.startsWith(`${p.key}|`));
  const dialogs = Object.keys(manifest.dialogs).filter((k) => k.startsWith(`${p.key}|`)).length;
  const panels = Object.keys(manifest.panels).filter((k) => k.startsWith(`${p.key}|`)).reduce((n, k) => n + manifest.panels[k].filter(Boolean).length, 0);
  const bodies = new Set(keys.map((k) => manifest.screens[k].body)).size;
  console.log(`  ${p.code} ${p.label}: ${keys.length} screens (${bodies} distinct bodies), ${dialogs} dialogs, ${panels} row panels${manifest.personas[p.key] ? '' : ' - no screens, disabled'}`);
}
if (refused.size) console.log(`Writes the capture refused: ${[...refused].join(', ')}`);
if (failures.length) console.log(`Not captured (${failures.length}):\n  ${failures.join('\n  ')}`);
