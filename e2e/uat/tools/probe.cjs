const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ storageState: 'e2e/uat/.auth/super.state.json', baseURL: 'http://localhost:3000' });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 600)); });
  p.on('pageerror', e => console.log('PAGEERROR', e.message, (e.stack||'').slice(0, 800)));
  p.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await p.goto(process.argv[2] || '/app/client/overview'); await p.waitForTimeout(4000);
  await b.close();
})();
