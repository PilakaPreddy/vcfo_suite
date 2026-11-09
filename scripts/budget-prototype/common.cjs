'use strict';
/*
 * Helpers shared by capture.cjs and build.cjs. Plain Node, no dependencies.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '../..');

/** The three demo budgets. Change these ids when the demo database is seeded again. */
const BUDGETS = {
  solstice: { id: '50c46488-d3df-4644-8cd2-9986ea71902d', name: 'Solstice Energy' },
  halcyon: { id: '1c56b5b6-bc54-45f3-aace-649838392bce', name: 'Halcyon Payments' },
  pinewood: { id: '506ee129-3826-4b84-82fe-53d373e6f138', name: 'Pinewood Logistics' },
};

/**
 * The nine dashboards, in the order the filter shows them. The four section-owner dashboards all sign
 * in as pinewood-aditya: pinewood-rahul is seeded as a pending invite that never set a password, and
 * signing in as him would run the invite flow. A dashboard is defined by the sections the person owns.
 */
const PERSONAS = [
  { key: 'super', code: 'D-01', label: 'Super admin', group: 'staff' },
  { key: 'admin', code: 'D-02', label: 'Admin', group: 'staff' },
  { key: 'manager', code: 'D-03', label: 'Manager', group: 'staff' },
  { key: 'lead', code: 'D-04', label: 'Project lead', group: 'staff' },
  { key: 'client', code: 'D-05', label: 'Client (approver)', group: 'client' },
  { key: 'owner-ta', code: 'D-06', label: 'Client: Talent Acquisition', group: 'client', owner: { email: 'pinewood-aditya@demo.vcfo.local', sections: ['hiring'] } },
  { key: 'owner-hr', code: 'D-07', label: 'Client: HR', group: 'client', owner: { email: 'pinewood-aditya@demo.vcfo.local', sections: ['benefits'] } },
  { key: 'owner-admin', code: 'D-08', label: 'Client: Admin team', group: 'client', owner: { email: 'pinewood-aditya@demo.vcfo.local', sections: ['admin'] } },
  { key: 'owner-finance', code: 'D-09', label: 'Client: Finance', group: 'client', owner: { email: 'pinewood-aditya@demo.vcfo.local', sections: ['finance', 'settings'] } },
];

/** Where each role's budget pages live. */
const ROUTE_BASE = {
  super: '/app/super/practice/budgets',
  admin: '/app/admin/budgets',
  manager: '/app/manager/budgets',
  lead: '/app/intern/budgets',
  client: '/app/client/budgets',
};

function sha(text) {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

/**
 * Removes the @font-face blocks for scripts the screens never use (Cyrillic, Greek, Vietnamese),
 * so their font files are not downloaded or embedded. Latin and Latin Extended stay, because the
 * rupee sign sits in Latin Extended.
 */
function dropFontSubsets(css) {
  return css.replace(/\/\*\s*(cyrillic-ext|cyrillic|greek-ext|greek|vietnamese|math|symbols)\s*\*\/\s*@font-face\s*\{[^}]*\}/g, '');
}

/** Every url(...) in a stylesheet or a style attribute, without the quotes. */
function cssUrls(css) {
  const urls = [];
  const re = /url\(\s*(?:&quot;|["'])?([^"')&]+?)(?:&quot;|["'])?\s*\)/g;
  let m;
  while ((m = re.exec(css))) urls.push(m[1]);
  return urls;
}

/** True for a URL that should be embedded: a file on the app server, not a data URI or a fragment. */
function isAssetUrl(u) {
  return !!u && !/^(data:|#|about:|javascript:|mailto:|tel:)/i.test(u);
}

/** Reads the demo emails and passwords from e2e/helpers/login.ts at run time; nothing is copied into a file. */
function demoPasswords() {
  const src = fs.readFileSync(path.join(ROOT, 'e2e/helpers/login.ts'), 'utf8');
  const map = {};
  const re = /email:\s*process\.env\.\w+\s*\?\?\s*'([^']+)'[\s\S]*?password:\s*process\.env\.\w+\s*\?\?\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) map[m[1]] = m[2];
  return map;
}

/** The password for a demo email: its own entry, or the entry of another address on the same domain. */
function passwordFor(email, map) {
  if (map[email]) return map[email];
  const domain = email.split('@')[1];
  const same = Object.keys(map).find((e) => e.split('@')[1] === domain);
  if (!same) throw new Error(`No demo password known for ${email}`);
  return map[same];
}

module.exports = { ROOT, BUDGETS, PERSONAS, ROUTE_BASE, sha, readJson, writeJson, parseArgs, dropFontSubsets, cssUrls, isAssetUrl, demoPasswords, passwordFor };
