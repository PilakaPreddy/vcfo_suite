const { chromium } = require('@playwright/test');
(async () => {
  const [role, url] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ storageState: `e2e/uat/.auth/${role}.state.json`, baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  const out = await p.evaluate(() => {
    const vis = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    const tabs = [...document.querySelectorAll('[role=tab]')].filter(vis).map(t => t.textContent.trim());
    const inputs = [...document.querySelectorAll('input,textarea,select,button[role=combobox],[role=radiogroup]')].filter(vis).map(e => `${e.tagName}#${e.id}[${e.type||e.getAttribute('role')||''}] ${e.getAttribute('aria-label')||''} ${(e.labels&&e.labels[0]?.textContent||'').trim().slice(0,50)}`);
    const buttons = [...document.querySelectorAll('button')].filter(vis).map(b => b.textContent.trim()).filter(Boolean).slice(0, 60);
    return { tabs, inputs, buttons };
  });
  console.log(JSON.stringify(out, null, 1));
  await p.screenshot({ path: 'e2e/uat/results/debug.png' });
  await b.close();
})();
