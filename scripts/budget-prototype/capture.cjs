#!/usr/bin/env node
'use strict';
/*
 * Captures every Budget screen of the nine dashboards from a running app into a raw folder.
 * build.cjs then turns that folder into docs/specs/budget/budget-prototype.html.
 *
 *   DATABASE_URL=postgres://...localhost.../db node scripts/budget-prototype/capture.cjs --out=/tmp/bp-raw
 *
 * Options: --base=http://localhost:3000  --out=<raw folder>  --only=super,admin  --concurrency=3  --no-panels
 *
 * Safety: the browser refuses every request that is not GET or HEAD, except sign-in, so nothing the
 * capture clicks can save. The only writes are the owner rows for the Pinewood section-owner
 * dashboards, which are put back exactly as they were found when the run ends.
 */
const fs = require('fs');
const path = require('path');
const { ROOT, BUDGETS, PERSONAS, ROUTE_BASE, sha, writeJson, readJson, parseArgs, dropFontSubsets, cssUrls, isAssetUrl, demoPasswords, passwordFor } = require('./common.cjs');
const { chromium, request } = require(path.join(ROOT, 'node_modules/@playwright/test'));
const { Client } = require(path.join(ROOT, 'node_modules/pg'));

const args = parseArgs(process.argv.slice(2));
const BASE = (args.base || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.resolve(args.out || path.join(require('os').tmpdir(), 'budget-prototype-raw'));
const ONLY = args.only ? String(args.only).split(',') : null;
const CONCURRENCY = Number(args.concurrency || 3);
const PANELS = !args['no-panels'];
const DB_URL = process.env.PROTO_DATABASE_URL || process.env.DATABASE_URL;

const HEAD_TRIGGERS = ['Publish', 'Approve', 'Return', 'Start revision', 'Remove', 'Import Excel', 'New budget'];
const BODY_TRIGGERS = ['Owners and due date', 'Send back', 'Reopen month'];
const SUB_SELECTS = ['Period', 'Show', 'View', 'Variance month'];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- database ---------- */

async function withDb(run) {
  if (!DB_URL) throw new Error('Set DATABASE_URL (or PROTO_DATABASE_URL) to the local demo database.');
  const host = new URL(DB_URL).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error(`Refusing to use a database on ${host}: local only.`);
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

const clearRateLimits = () => withDb((db) => db.query(`delete from rate_limits where key like 'sign-in:%' or key like 'two-step:%'`));

/** Works out which login sees which budget, from engagements, so the plan follows the demo data. */
async function makePlan() {
  return withDb(async (db) => {
    const ids = Object.values(BUDGETS).map((b) => b.id);
    const { rows } = await db.query(
      `select b.id, b.status, e.company_name, m.email as manager_email, l.email as lead_email, c.email as client_email
         from budgets b join engagements e on e.id = b.engagement_id
         left join profiles m on m.id = e.manager_id
         left join profiles l on l.intern_id = e.intern_id and l.role = 'intern'
         left join profiles c on c.id = e.client_user_id
        where b.id = any($1::uuid[]) and b.deleted_at is null`,
      [ids],
    );
    const byKey = {};
    for (const [key, b] of Object.entries(BUDGETS)) {
      const r = rows.find((x) => x.id === b.id);
      if (!r) throw new Error(`Budget ${key} (${b.id}) is not in the database.`);
      byKey[key] = r;
    }
    const keys = Object.keys(BUDGETS);
    const group = (field) => {
      const map = new Map();
      for (const k of keys) {
        const email = byKey[k][field];
        if (!email) continue;
        if (!map.has(email)) map.set(email, []);
        map.get(email).push(k);
      }
      const logins = [...map].map(([email, budgets]) => ({ email, budgets }));
      logins.sort((a, b) => b.budgets.length - a.budgets.length);
      if (logins[0]) logins[0].budgets.unshift('list');
      return logins;
    };
    const plan = {
      super: [{ email: 'super@vcfo.local', budgets: ['list', ...keys] }],
      admin: [{ email: 'admin-nadia@demo.vcfo.local', budgets: ['list', ...keys] }],
      manager: group('manager_email'),
      lead: group('lead_email'),
      client: keys.filter((k) => byKey[k].client_email).map((k) => ({ email: byKey[k].client_email, budgets: [k] })),
    };
    for (const p of PERSONAS) if (p.owner) plan[p.key] = [{ email: p.owner.email, budgets: ['pinewood'], owner: p.owner.sections }];
    const emails = [...new Set(Object.values(plan).flat().map((l) => l.email))];
    const found = await db.query(`select email from profiles where email = any($1::text[]) and status = 'active'`, [emails]);
    const missing = emails.filter((e) => !found.rows.some((r) => r.email === e));
    if (missing.length) throw new Error(`These demo logins are missing: ${missing.join(', ')}`);
    const budgets = Object.fromEntries(keys.map((k) => [k, { id: BUDGETS[k].id, name: BUDGETS[k].name, status: byKey[k].status }]));
    return { plan, budgets };
  });
}

/* ---------- owner rows for the Pinewood section-owner dashboards ---------- */

const PINEWOOD = BUDGETS.pinewood.id;
let ownersBefore = null;

async function snapshotOwners() {
  ownersBefore = await withDb(async (db) => (await db.query('select budget_id, section, user_id from budget_section_owners where budget_id = $1', [PINEWOOD])).rows);
  writeJson(path.join(OUT, 'owners-before.json'), ownersBefore);
  log(`Pinewood owner rows at start: ${ownersBefore.length}`);
}

async function setOwners(email, sections) {
  await withDb(async (db) => {
    await db.query('begin');
    await db.query('delete from budget_section_owners where budget_id = $1', [PINEWOOD]);
    for (const s of sections) {
      await db.query(`insert into budget_section_owners (budget_id, section, user_id) select $1, $2, id from profiles where email = $3`, [PINEWOOD, s, email]);
    }
    await db.query('commit');
  });
}

async function restoreOwners() {
  if (!ownersBefore) return;
  await withDb(async (db) => {
    await db.query('begin');
    await db.query('delete from budget_section_owners where budget_id = $1', [PINEWOOD]);
    for (const r of ownersBefore) await db.query('insert into budget_section_owners (budget_id, section, user_id) values ($1, $2, $3)', [r.budget_id, r.section, r.user_id]);
    await db.query('commit');
    const n = (await db.query('select count(*)::int as n from budget_section_owners where budget_id = $1', [PINEWOOD])).rows[0].n;
    log(`Pinewood owner rows restored: ${n} (was ${ownersBefore.length})`);
  });
}

/* ---------- in-page serialisers (run inside the browser) ---------- */

function pageSnapScreen() {
  const syncForm = (live, clone) => {
    const L = live.querySelectorAll('input,select,textarea');
    const C = clone.querySelectorAll('input,select,textarea');
    L.forEach((el, i) => {
      const c = C[i];
      if (!c) return;
      if (el.tagName === 'SELECT') {
        Array.from(c.options).forEach((o, j) => (el.options[j] && el.options[j].selected ? o.setAttribute('selected', '') : o.removeAttribute('selected')));
      } else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
      else if (el.type === 'checkbox' || el.type === 'radio') el.checked ? c.setAttribute('checked', '') : c.removeAttribute('checked');
      else if (el.type === 'password') c.removeAttribute('value');
      else if (el.type !== 'file') c.setAttribute('value', el.value);
    });
  };
  const clean = (root) => {
    root.querySelectorAll('script,noscript,template,iframe,next-route-announcer,nextjs-portal,link,meta,[data-nextjs-toast],#recharts_measurement_span,[data-radix-focus-guard],[data-radix-popper-content-wrapper],[role="tooltip"]').forEach((e) => e.remove());
    root.querySelectorAll('[data-rht-toaster]').forEach((e) => (e.innerHTML = ''));
    root.querySelectorAll('img').forEach((i) => ['srcset', 'sizes', 'loading', 'decoding', 'fetchpriority'].forEach((a) => i.removeAttribute(a)));
    root.querySelectorAll('picture source').forEach((e) => e.remove());
    root.querySelectorAll('*').forEach((e) => {
      for (const a of Array.from(e.attributes)) if (/^on/i.test(a.name) || a.name === 'data-proto-trigger') e.removeAttribute(a.name);
      if (e.tagName === 'A' && /^javascript:/i.test(e.getAttribute('href') || '')) e.setAttribute('href', '#');
    });
  };
  const ws = document.querySelector('[data-proto-ws]');
  const clone = document.body.cloneNode(true);
  syncForm(document.body, clone);
  clean(clone);
  const cws = clone.querySelector('[data-proto-ws]');
  const kids = Array.from(cws.children);
  const tl = cws.querySelector(':scope > [aria-label="Budget tabs"]');
  const nHead = tl ? kids.indexOf(tl) + 1 : 0;
  const head = kids.slice(0, nHead).map((k) => k.outerHTML).join('\n');
  const body = kids.slice(nHead).map((k) => k.outerHTML).join('\n');
  cws.innerHTML = '<!--ROOT-->';
  cws.removeAttribute('data-proto-ws');
  cws.setAttribute('data-proto-root', '');
  // Portals left open (a toast, a popover) never belong to the page itself.
  Array.from(clone.children).forEach((c) => {
    if (c.matches('[data-state="open"][role="dialog"], .discrete-overlay')) c.remove();
  });
  const attrs = (el) => Array.from(el.attributes).filter((a) => !/^data-proto|^data-scroll-locked$|^style$|^aria-hidden$|^data-aria-hidden$/.test(a.name)).map((a) => [a.name, a.value]);
  const styles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((e) => (e.tagName === 'LINK' ? { href: e.href } : { text: e.textContent }))
    .filter((s) => !(s.text && s.text.includes('__nextjs')));
  void ws;
  return { shell: clone.innerHTML, head, body, attrs: { html: attrs(document.documentElement), body: attrs(document.body) }, styles };
}

function pageSnapLayer() {
  const old = window.__protoOld || new Set();
  const nodes = Array.from(document.body.children).filter((n) => !old.has(n) && !n.matches('script,style,link,[data-radix-focus-guard],[data-radix-popper-content-wrapper],next-route-announcer,nextjs-portal'));
  const out = [];
  for (const n of nodes) {
    const c = n.cloneNode(true);
    const L = n.querySelectorAll('input,select,textarea');
    const C = c.querySelectorAll('input,select,textarea');
    L.forEach((el, i) => {
      const d = C[i];
      if (el.tagName === 'SELECT') Array.from(d.options).forEach((o, j) => (el.options[j] && el.options[j].selected ? o.setAttribute('selected', '') : o.removeAttribute('selected')));
      else if (el.tagName === 'TEXTAREA') d.textContent = el.value;
      else if (el.type === 'checkbox' || el.type === 'radio') el.checked ? d.setAttribute('checked', '') : d.removeAttribute('checked');
      else if (el.type !== 'file' && el.type !== 'password') d.setAttribute('value', el.value);
    });
    c.querySelectorAll('script,[data-radix-focus-guard],[role="tooltip"]').forEach((e) => e.remove());
    c.querySelectorAll('img').forEach((i) => ['srcset', 'sizes', 'loading', 'decoding', 'fetchpriority'].forEach((a) => i.removeAttribute(a)));
    [c, ...c.querySelectorAll('*')].forEach((e) => {
      for (const a of Array.from(e.attributes)) if (/^on/i.test(a.name) || a.name === 'data-proto-trigger') e.removeAttribute(a.name);
    });
    out.push(c.outerHTML);
  }
  return out.join('\n');
}

/* ---------- page helpers ---------- */

async function settle(page, ms = 500) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(ms);
  await page.mouse.move(1439, 450);
}

async function visibleDialogs(page) {
  return page.locator('[role="dialog"]:visible').count();
}

async function closeLayers(page) {
  for (let i = 0; i < 4 && (await visibleDialogs(page)) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
  }
  return (await visibleDialogs(page)) === 0;
}

async function login(browser, email, passwords) {
  await clearRateLimits();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', baseURL: BASE });
  const blocked = [];
  await context.route('**/*', (route) => {
    const r = route.request();
    const m = r.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    const p = new URL(r.url()).pathname;
    if (p.startsWith('/api/auth/')) return route.continue();
    blocked.push(`${m} ${p}`);
    return route.abort();
  });
  // Show the staff sidebar pinned open, as a person at a desktop normally sees it.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('vcfo.sidebar', 'pinned');
    } catch {
      /* storage can be blocked; the rail is then shown */
    }
  });
  const page = await context.newPage();
  for (const kind of ['announcement', 'notification']) {
    await page.addLocatorHandler(page.locator(`#${kind}-live-title`), () => page.keyboard.press('Escape'), { noWaitAfter: true });
  }
  const password = passwordFor(email, passwords);
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const emailInput = page.locator('#email:visible');
  const passwordInput = page.locator('#password:visible');
  for (let i = 0; i < 30; i++) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    if ((await emailInput.inputValue()) === email && (await passwordInput.inputValue()) === password) break;
    await page.waitForTimeout(500);
  }
  await page.locator('button[type="submit"]:visible').first().click();
  await page.waitForURL(/\/app\//, { timeout: 45000 });
  await settle(page, 300);
  return { context, page, blocked };
}

/** Marks the page root of the Budget view, so the serialiser can cut the shell from the content. */
async function markWorkspace(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-proto-ws]').forEach((e) => e.removeAttribute('data-proto-ws'));
    const tl = document.querySelector('[aria-label="Budget tabs"]');
    let ws = tl ? tl.parentElement : null;
    if (!ws) {
      const slot = document.querySelector('.cp-tw') || document.querySelector('main');
      ws = slot && slot.firstElementChild;
    }
    if (!ws) return false;
    ws.setAttribute('data-proto-ws', '');
    return true;
  });
}

async function gotoReady(page, url, isList) {
  await page.goto(url);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  const sel = isList ? 'main table, .cp-tw table, main :text("No budgets yet")' : '[aria-label="Budget tabs"]';
  await page.locator(sel).first().waitFor({ timeout: 20000 }).catch(() => {});
  await settle(page, 900);
  return markWorkspace(page);
}

/** Tags the trigger buttons in one region and returns their labels. Region: head or body of the workspace. */
async function findTriggers(page, region, names) {
  return page.evaluate(
    ({ region, names }) => {
      const ws = document.querySelector('[data-proto-ws]');
      if (!ws) return [];
      const kids = Array.from(ws.children);
      const tl = ws.querySelector(':scope > [aria-label="Budget tabs"]');
      const nHead = tl ? kids.indexOf(tl) + 1 : 1;
      const scope = region === 'head' ? kids.slice(0, nHead) : kids.slice(nHead);
      document.querySelectorAll('[data-proto-trigger]').forEach((e) => e.removeAttribute('data-proto-trigger'));
      const found = [];
      let n = 0;
      for (const k of scope) {
        for (const b of k.querySelectorAll('button')) {
          const t = (b.textContent || '').trim();
          if (names.includes(t) && !b.disabled && !found.some((f) => f.label === t)) {
            b.setAttribute('data-proto-trigger', String(n));
            found.push({ label: t, n });
            n++;
          }
        }
      }
      return found;
    },
    { region, names },
  );
}

/* ---------- capture of one login ---------- */

function makeStore() {
  return { html: {}, screens: [], dialogs: [], panels: [], tabs: {}, subs: {}, failures: [], styles: {}, attrs: {} };
}

function keep(store, html) {
  const h = sha(html);
  store.html[h] = html;
  return h;
}

async function openLayer(page, trigger) {
  await page.evaluate(() => {
    window.__protoOld = new Set(document.body.children);
  });
  await trigger.click({ timeout: 8000 });
  await page.locator('[role="dialog"]:visible').first().waitFor({ timeout: 8000 });
  await settle(page, 450);
  const html = await page.evaluate(pageSnapLayer);
  const closed = await closeLayers(page);
  return { html, closed };
}

async function captureDialogs(page, store, ctx, region, tab, sub) {
  const names = region === 'head' ? HEAD_TRIGGERS : BODY_TRIGGERS;
  const triggers = await findTriggers(page, region, names);
  for (const t of triggers) {
    try {
      const { html, closed } = await openLayer(page, page.locator(`[data-proto-trigger="${t.n}"]`));
      if (!html.includes('role="dialog"')) throw new Error('no dialog markup');
      store.dialogs.push({ persona: ctx.persona, budget: ctx.budget, tab: region === 'head' ? '*' : tab, sub: region === 'head' ? '' : sub, trigger: t.label, html: keep(store, html), who: ctx.email });
      if (!closed) throw new Error('dialog did not close');
    } catch (e) {
      store.failures.push(`${ctx.persona} / ${ctx.budget} / ${tab} / ${t.label}: ${String(e.message).split('\n')[0]}`);
      await closeLayers(page);
    }
  }
}

async function capturePanels(page, store, ctx, tab) {
  const buttons = page.locator('[data-proto-ws] button[aria-label="More for this row"]');
  const n = await buttons.count();
  const list = [];
  for (let i = 0; i < n; i++) {
    try {
      const { html, closed } = await openLayer(page, buttons.nth(i));
      list.push(keep(store, html));
      if (!closed) throw new Error('panel did not close');
    } catch (e) {
      list.push(null);
      store.failures.push(`${ctx.persona} / ${ctx.budget} / ${tab} / row ${i + 1} panel: ${String(e.message).split('\n')[0]}`);
      await closeLayers(page);
    }
  }
  if (list.length) store.panels.push({ persona: ctx.persona, budget: ctx.budget, tab, list });
}

async function snapScreen(page, store, ctx, tab, sub) {
  await markWorkspace(page);
  const s = await page.evaluate(pageSnapScreen);
  const styleKey = sha(JSON.stringify(s.styles));
  store.styles[styleKey] = s.styles;
  const attrKey = sha(JSON.stringify(s.attrs));
  store.attrs[attrKey] = s.attrs;
  store.screens.push({ persona: ctx.persona, budget: ctx.budget, tab, sub, who: ctx.email, shell: keep(store, s.shell), head: keep(store, s.head), body: keep(store, s.body), styles: styleKey, attrs: attrKey });
}

async function subSelect(page) {
  return page.evaluate((labels) => {
    const ws = document.querySelector('[data-proto-ws]');
    if (!ws) return null;
    const kids = Array.from(ws.children);
    const tl = ws.querySelector(':scope > [aria-label="Budget tabs"]');
    const scope = kids.slice(tl ? kids.indexOf(tl) + 1 : 0);
    for (const k of scope) {
      for (const s of k.querySelectorAll('select[aria-label]')) {
        const aria = s.getAttribute('aria-label');
        if (labels.includes(aria)) return { aria, value: s.value, opts: Array.from(s.options).map((o) => [o.value, o.text]) };
      }
    }
    return null;
  }, SUB_SELECTS);
}

/** Which other options of a sub-view selector to capture. The Variance month picker gets one month per status. */
function subChoices(sel) {
  if (sel.aria !== 'Variance month') return sel.opts.filter((o) => o[0] !== sel.value);
  const status = (t) => (t.includes('·') ? t.split('·').pop().trim() : 'Not started');
  const current = sel.opts.find((o) => o[0] === sel.value);
  const seen = new Set([status(current ? current[1] : '')]);
  const out = [];
  for (const o of sel.opts) {
    const s = status(o[1]);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(o);
  }
  return out;
}

async function captureBudget(page, store, ctx) {
  const isList = ctx.budget === 'list';
  const url = ROUTE_BASE[ctx.route] + (isList ? '' : `/${BUDGETS[ctx.budget].id}`);
  const ok = await gotoReady(page, url, isList);
  if (!ok) {
    store.failures.push(`${ctx.persona} / ${ctx.budget}: the page did not render (${page.url()})`);
    return;
  }
  if (isList) {
    store.tabs[`${ctx.persona}|list`] = [];
    await snapScreen(page, store, ctx, 'list', '');
    await captureDialogs(page, store, ctx, 'head', 'list', '');
    return;
  }
  const tabs = page.locator('[data-proto-ws] [aria-label="Budget tabs"] [role="tab"]');
  const count = await tabs.count();
  const names = [];
  for (let i = 0; i < count; i++) names.push(((await tabs.nth(i).textContent()) || '').trim());
  if (!names.length) {
    // The budget is not open to this login (or has no tabs): keep the page as it shows.
    store.tabs[`${ctx.persona}|${ctx.budget}`] = ['Page'];
    await snapScreen(page, store, ctx, 'Page', '');
    return;
  }
  store.tabs[`${ctx.persona}|${ctx.budget}`] = names;
  const subs = {};
  for (let i = 0; i < count; i++) {
    const tab = names[i];
    if (i > 0) {
      await tabs.nth(i).click();
      for (let w = 0; w < 40 && (await tabs.nth(i).getAttribute('aria-selected')) !== 'true'; w++) await page.waitForTimeout(200);
      await settle(page, 700);
    }
    log(`  ${ctx.persona} / ${ctx.budget} / ${tab}`);
    await snapScreen(page, store, ctx, tab, '');
    if (i === 0) await captureDialogs(page, store, ctx, 'head', tab, '');
    await captureDialogs(page, store, ctx, 'body', tab, '');
    if (PANELS) await capturePanels(page, store, ctx, tab);
    const sel = await subSelect(page);
    if (sel) {
      const choices = subChoices(sel);
      const first = sel.value;
      const firstText = (sel.opts.find((o) => o[0] === first) || [first, first])[1];
      subs[tab] = { aria: sel.aria, first, opts: [[first, firstText]] };
      const selector = `[data-proto-ws] select[aria-label="${sel.aria}"]`;
      for (const [value, text] of choices) {
        try {
          await page.locator(selector).first().selectOption(value);
          await settle(page, 700);
          await snapScreen(page, store, ctx, tab, value);
          subs[tab].opts.push([value, text]);
          if (sel.aria === 'Variance month') await captureDialogs(page, store, ctx, 'body', tab, value);
        } catch (e) {
          store.failures.push(`${ctx.persona} / ${ctx.budget} / ${tab}: ${text}: ${String(e.message).split('\n')[0]}`);
        }
      }
      await page.locator(selector).first().selectOption(first).catch(() => {});
      await settle(page, 400);
    }
  }
  store.subs[`${ctx.persona}|${ctx.budget}`] = subs;
}

async function capturePersona(browser, personaKey, logins, passwords) {
  const persona = PERSONAS.find((p) => p.key === personaKey);
  const route = persona.group === 'client' ? 'client' : personaKey;
  const store = makeStore();
  const blockedAll = [];
  for (const l of logins) {
    if (l.owner) await setOwners(l.email, l.owner);
    let session;
    try {
      session = await login(browser, l.email, passwords);
      log(`${personaKey}: signed in as ${l.email}`);
      for (const budget of l.budgets) {
        try {
          await captureBudget(session.page, store, { persona: personaKey, budget, email: l.email, route });
        } catch (e) {
          store.failures.push(`${personaKey} / ${budget}: ${String(e.message).split('\n')[0]}`);
        }
      }
      blockedAll.push(...session.blocked);
    } catch (e) {
      store.failures.push(`${personaKey} / ${l.email}: sign-in failed: ${String(e.message).split('\n')[0]}`);
    } finally {
      if (session) await session.context.close();
      if (l.owner) await restoreOwners();
    }
  }
  store.blocked = [...new Set(blockedAll)];
  writeJson(path.join(OUT, 'personas', `${personaKey}.json`), store);
  log(`${personaKey}: ${store.screens.length} screens, ${store.dialogs.length} dialogs, ${store.panels.reduce((n, p) => n + p.list.length, 0)} panels, ${store.failures.length} failures, ${store.blocked.length} refused writes`);
}

/* ---------- stylesheets and files ---------- */

async function collectAssets() {
  const files = fs.readdirSync(path.join(OUT, 'personas')).filter((f) => f.endsWith('.json'));
  const api = await request.newContext({ baseURL: BASE });
  const css = {};
  const urls = new Set();
  const htmlUrl = /(?:\s(?:src|href|xlink:href|poster))="([^"]+)"/g;
  for (const f of files) {
    const store = readJson(path.join(OUT, 'personas', f));
    for (const styles of Object.values(store.styles)) {
      for (const s of styles) {
        if (s.href && !css[s.href]) {
          const res = await api.get(s.href);
          css[s.href] = res.ok() ? await res.text() : '';
          if (!res.ok()) log(`Stylesheet ${s.href}: HTTP ${res.status()}`);
        }
      }
    }
    for (const html of Object.values(store.html)) {
      let m;
      while ((m = htmlUrl.exec(html))) {
        const tag = html.lastIndexOf('<', m.index);
        const tagName = html.slice(tag + 1, tag + 8).toLowerCase();
        if (tagName.startsWith('a ') || tagName.startsWith('a\n') || tagName.startsWith('base')) continue;
        if (isAssetUrl(m[1])) urls.add(new URL(m[1].replace(/&amp;/g, '&'), BASE).href);
      }
      for (const u of cssUrls(html)) if (isAssetUrl(u)) urls.add(new URL(u.replace(/&amp;/g, '&'), BASE).href);
    }
    for (const styles of Object.values(store.styles)) for (const s of styles) if (s.text) for (const u of cssUrls(dropFontSubsets(s.text))) if (isAssetUrl(u)) urls.add(new URL(u, BASE).href);
  }
  for (const [href, text] of Object.entries(css)) for (const u of cssUrls(dropFontSubsets(text))) if (isAssetUrl(u)) urls.add(new URL(u, href).href);
  const assets = {};
  for (const u of urls) {
    if (!u.startsWith(BASE)) continue;
    const res = await api.get(u).catch(() => null);
    if (!res || !res.ok()) {
      log(`File ${u}: ${res ? res.status() : 'failed'}`);
      continue;
    }
    const type = (res.headers()['content-type'] || 'application/octet-stream').split(';')[0];
    if (type.startsWith('text/html')) continue;
    assets[u] = `data:${type};base64,${(await res.body()).toString('base64')}`;
  }
  await api.dispose();
  writeJson(path.join(OUT, 'css.json'), css);
  writeJson(path.join(OUT, 'assets.json'), assets);
  log(`Stylesheets: ${Object.keys(css).length}; files embedded: ${Object.keys(assets).length}`);
}

/* ---------- main ---------- */

async function main() {
  fs.mkdirSync(path.join(OUT, 'personas'), { recursive: true });
  const passwords = demoPasswords();
  const { plan, budgets } = await makePlan();
  writeJson(path.join(OUT, 'meta.json'), { base: BASE, capturedAt: new Date().toISOString(), budgets, plan, personas: PERSONAS.map(({ key, code, label, group }) => ({ key, code, label, group })) });
  log(`Raw folder: ${OUT}`);
  await snapshotOwners();
  const browser = await chromium.launch();
  const wanted = PERSONAS.map((p) => p.key).filter((k) => !ONLY || ONLY.includes(k));
  const owners = wanted.filter((k) => PERSONAS.find((p) => p.key === k).owner);
  const others = wanted.filter((k) => !owners.includes(k));
  // The owner dashboards share Pinewood's owner rows, so they run one after another in one lane.
  // The owner dashboards change Pinewood's owner rows, so they run last, one after another, once
  // every other dashboard is captured: no other screen then shows a temporary owner.
  const queue = [...others];
  const lane = async () => {
    while (queue.length) {
      const k = queue.shift();
      await capturePersona(browser, k, plan[k] || [], passwords);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, lane));
    for (const k of owners) await capturePersona(browser, k, plan[k] || [], passwords);
  } finally {
    await restoreOwners();
    await browser.close();
  }
  await collectAssets();
  log('Capture done. Next: node scripts/budget-prototype/build.cjs --raw=' + OUT);
}

process.on('SIGINT', async () => {
  await restoreOwners().catch(() => {});
  process.exit(130);
});

main().catch(async (e) => {
  console.error(e);
  await restoreOwners().catch(() => {});
  process.exit(1);
});
