#!/usr/bin/env node
'use strict';
/*
 * Opens the built prototype from file:// and steps through every dashboard, budget and screen in
 * the filter bar. It fails on an empty screen, a console error or any network request, opens some
 * dialogs and closes them with Escape, and saves one screenshot per dashboard.
 *
 *   node scripts/budget-prototype/check.cjs [--file=docs/specs/budget/budget-prototype.html] [--shots=<folder>]
 */
const path = require('path');
const fs = require('fs');
const { ROOT, parseArgs } = require('./common.cjs');
const { chromium } = require(path.join(ROOT, 'node_modules/@playwright/test'));

const args = parseArgs(process.argv.slice(2));
const FILE = path.resolve(args.file || path.join(ROOT, 'docs/specs/budget/budget-prototype.html'));
const SHOTS = args.shots ? path.resolve(args.shots) : null;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const requests = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('about:')) requests.push(u);
  });
  await page.goto('file://' + FILE);
  await page.waitForFunction(() => document.getElementById('stage') && document.getElementById('stage').contentDocument.body.children.length > 0, null, { timeout: 30000 });
  const frame = () => page.frames().find((f) => f !== page.mainFrame());

  const personas = await page.$$eval('#f-persona option', (os) => os.map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled })));
  const report = [];
  let screens = 0;
  let empty = [];
  let dialogsOpened = 0;
  for (const p of personas) {
    if (p.disabled) {
      report.push(`${p.label}: disabled`);
      continue;
    }
    await page.selectOption('#f-persona', p.value);
    const budgets = await page.$$eval('#f-budget option', (os) => os.filter((o) => !o.disabled).map((o) => o.value));
    let n = 0;
    for (const b of budgets) {
      await page.selectOption('#f-budget', b);
      const tabs = await page.$$eval('#f-tab option', (os) => os.map((o) => o.value));
      for (const t of tabs) {
        await page.selectOption('#f-tab', t);
        const info = await frame().evaluate(() => {
          const root = document.querySelector('[data-proto-root]');
          return { text: root ? root.innerText.trim().length : 0, side: !!document.querySelector('aside, .cp-side, nav') };
        });
        screens++;
        n++;
        if (info.text < 20) empty.push(`${p.value}/${b}/${t}`);
      }
      // Open up to two dialogs on this budget, then close each with Escape.
      const triggers = await frame().evaluate(() => {
        const out = [];
        document.querySelectorAll('[data-proto-root] button').forEach((btn, i) => {
          const w = (btn.textContent || '').trim();
          if (/^(Publish|Approve|Return|Start revision|Import Excel|New budget|Remove)$/.test(w)) out.push(i);
        });
        return out.slice(0, 2);
      });
      for (const i of triggers) {
        await frame().evaluate((i) => document.querySelectorAll('[data-proto-root] button')[i].click(), i);
        const open = await frame().evaluate(() => !!document.querySelector('#proto-layer [role="dialog"]'));
        await page.keyboard.press('Escape');
        const closed = await frame().evaluate(() => !document.querySelector('#proto-layer'));
        if (open && closed) dialogsOpened++;
        else errors.push(`Dialog ${i} on ${p.value}/${b}: open ${open}, closed ${closed}`);
      }
    }
    report.push(`${p.label}: ${n} screens on ${budgets.length} budget choices`);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      const first = budgets.includes('solstice') ? 'solstice' : budgets[0];
      await page.selectOption('#f-budget', first);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(SHOTS, `${p.value}.png`) });
    }
  }
  await browser.close();
  console.log(report.join('\n'));
  console.log(`Screens stepped: ${screens}; dialogs opened and closed with Escape: ${dialogsOpened}`);
  console.log(`Empty screens: ${empty.length ? empty.join(', ') : 'none'}`);
  console.log(`Console errors: ${errors.length ? errors.slice(0, 10).join(' | ') : 'none'}`);
  console.log(`Network requests: ${requests.length ? [...new Set(requests)].slice(0, 10).join(', ') : 'none'}`);
  process.exit(empty.length || errors.length || requests.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
