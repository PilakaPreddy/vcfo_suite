const { chromium } = require('@playwright/test');
(async () => {
  const [role, method, url, body] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ storageState: `e2e/uat/.auth/${role}.state.json`, baseURL: 'http://localhost:3000' });
  const r = await ctx.request.fetch(url, { method, data: body ? JSON.parse(body) : undefined });
  console.log(r.status(), (await r.text()).slice(0, 800));
  await b.close();
})();
