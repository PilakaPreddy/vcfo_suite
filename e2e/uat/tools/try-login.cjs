const { chromium } = require('@playwright/test');
(async () => {
  const [email, pw, go] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await (await b.newContext({ baseURL: 'http://localhost:3000' })).newPage();
  p.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
  await p.goto('/login'); await p.waitForLoadState('networkidle');
  await p.locator('#email:visible').fill(email); await p.locator('#password:visible').fill(pw);
  await p.locator('button[type="submit"]:visible').first().click();
  await p.waitForTimeout(6000); console.log('URL', p.url());
  if (go) { await p.goto(go); await p.waitForTimeout(3000); console.log('URL2', p.url()); }
  await p.screenshot({ path: 'e2e/uat/results/debug.png' });
  await b.close();
})();
