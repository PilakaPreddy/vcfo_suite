const { chromium } = require('@playwright/test');
(async () => {
  const [role, url] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ storageState: `e2e/uat/.auth/${role}.state.json`, baseURL: 'http://localhost:3000', viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') console.log('API', r.status(), r.url().replace('http://localhost:3000',''), (await r.text().catch(()=>'')).slice(0,300)); });
  await p.goto(url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000);
  await p.getByRole('button', { name: /^Submit$/ }).locator('visible=true').first().click();
  await p.waitForTimeout(2500);
  console.log('STATUS', JSON.stringify(await p.locator('[role=status],[role=alert]').allInnerTexts()));
  await p.screenshot({ path: 'e2e/uat/results/debug.png' });
  await b.close();
})();
