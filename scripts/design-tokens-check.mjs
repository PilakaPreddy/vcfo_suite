// Contrast gate for docs/design/design-tokens.json.
// Every text token must hold 4.5:1 on the grounds its usage names; edges and
// focus rings must hold 3:1. Exits 1 on any failure so it can run in CI.
//   node scripts/design-tokens-check.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'docs', 'design', 'design-tokens.json');
const tokens = JSON.parse(readFileSync(file, 'utf8')).color.tokens;
const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]));
const resolve = (name, mode) => {
  const v = byName[name]?.[mode];
  if (v === undefined) throw new Error(`unknown token ${name}`);
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? resolve(alias[1], mode) : v;
};

// [text or edge, ground, minimum ratio]
const PAIRS = [
  ['ink', 'surface', 4.5], ['ink', 'surface-raised', 4.5], ['ink', 'surface-sunken', 4.5],
  ['ink', 'brand-soft', 4.5], ['ink', 'highlight-soft', 4.5], ['ink', 'positive-soft', 4.5],
  ['ink', 'warning-soft', 4.5], ['ink', 'danger-soft', 4.5], ['ink', 'info-soft', 4.5],
  ['ink-muted', 'surface', 4.5], ['ink-muted', 'surface-raised', 4.5], ['ink-muted', 'surface-sunken', 4.5], ['ink-muted', 'brand-soft', 4.5],
  ['ink-faint', 'surface-raised', 4.5], ['ink-faint', 'surface', 4.5], ['ink-faint', 'surface-sunken', 4.5],
  ['brand', 'surface', 4.5], ['brand', 'surface-raised', 4.5], ['brand', 'surface-sunken', 4.5], ['brand', 'brand-soft', 4.5],
  ['brand-strong', 'surface-raised', 4.5],
  ['on-brand', 'brand', 4.5], ['on-brand', 'brand-strong', 4.5],
  ['highlight', 'surface-raised', 4.5], ['highlight', 'surface', 4.5], ['highlight', 'highlight-soft', 4.5],
  ['positive', 'surface-raised', 4.5], ['positive', 'surface', 4.5], ['positive', 'positive-soft', 4.5],
  ['warning', 'surface-raised', 4.5], ['warning', 'surface', 4.5], ['warning', 'warning-soft', 4.5],
  ['danger', 'surface-raised', 4.5], ['danger', 'surface', 4.5], ['danger', 'danger-soft', 4.5],
  ['info', 'surface-raised', 4.5], ['info', 'surface', 4.5], ['info', 'info-soft', 4.5],
  ['line-strong', 'surface', 3], ['line-strong', 'surface-raised', 3],
  ['focus-ring', 'surface', 3], ['focus-ring', 'surface-raised', 3], ['focus-ring', 'surface-sunken', 3], ['focus-ring', 'brand-soft', 3], ['focus-ring', 'side', 3],
  ['side-ink', 'side', 4.5], ['side-ink', 'side-active', 4.5], ['side-muted', 'side', 4.5], ['side-muted', 'side-active', 4.5],
  ['highlight-bright', 'surface-raised', 3],
  // solid status fills with on-status text
  ['on-status', 'positive', 4.5], ['on-status', 'warning', 4.5], ['on-status', 'danger', 4.5], ['on-status', 'brand', 4.5], ['on-status', 'upcoming', 4.5],
  ['upcoming', 'surface', 4.5], ['upcoming', 'surface-raised', 4.5], ['ink', 'upcoming-soft', 4.5], ['ink-muted', 'upcoming-soft', 4.5],
  // gold: marks on navy, text only as gold-text
  ['gold', 'side', 3], ['gold-text', 'surface-raised', 4.5], ['gold-text', 'surface', 4.5],
  // owner chips
  ['owner-client', 'owner-client-soft', 4.5], ['owner-sbc', 'owner-sbc-soft', 4.5], ['owner-mca', 'owner-mca-soft', 4.5], ['owner-manager', 'owner-manager-soft', 4.5],
  ['owner-client', 'surface-raised', 4.5], ['owner-sbc', 'surface-raised', 4.5], ['owner-mca', 'surface-raised', 4.5], ['owner-manager', 'surface-raised', 4.5],
];

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = hex2rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

let failures = 0;
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('pair', 34) + pad('min', 5) + pad('light', 12) + 'dark');
for (const [fg, bg, min] of PAIRS) {
  const row = [fg + ' on ' + bg, min];
  for (const mode of ['light', 'dark']) {
    const r = contrast(resolve(fg, mode), resolve(bg, mode));
    const ok = r >= min;
    if (!ok) failures++;
    row.push(r.toFixed(2) + (ok ? '' : ' FAIL'));
  }
  console.log(pad(row[0], 34) + pad(row[1], 5) + pad(row[2], 12) + row[3]);
}
console.log(`\n${failures} failing pair(s)`);
process.exit(failures ? 1 : 0);
