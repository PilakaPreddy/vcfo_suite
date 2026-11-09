// Capture screenshots of prototype routes.
// Usage: NODE_PATH=<repo>/node_modules node capture.js <prototype.html> <outDir> route1 route2 ...
// Routes: window.__VCFO_ROUTES keys (e.g. home, incorporation, lead-home, mgr-work, admin-clients, super-home, dev-home).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [file, out, ...routes] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto('file://' + require('path').resolve(file)); await p.waitForTimeout(3000);
  if (routes[0] === '--list') { console.log(Object.keys(await p.evaluate(() => window.__VCFO_ROUTES)).join('\n')); await b.close(); return; }
  for (const r of routes) {
    try {
      await p.evaluate(r => { const A = window.__vcfoBoot(); const app = document.getElementById('app'); app.removeAttribute('inert'); app.classList.add('on', 'ready'); document.documentElement.classList.add('app-open'); A.open(r); }, r);
      await p.waitForTimeout(5000);
      await p.screenshot({ path: `${out}/${r}-a.png` });
      const fr = p.frames().find(f => f.url().startsWith('about:srcdoc'));
      if (fr) {
        const more = await fr.evaluate(() => { const els = [document.scrollingElement, ...document.querySelectorAll('*')].filter(e => e && e.scrollHeight > e.clientHeight + 80 && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY))); const c = els.sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (!c) return false; c.scrollBy(0, 760); return true; }).catch(() => false);
        if (more) { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${r}-b.png` }); }
      }
      console.log('ok', r);
    } catch (e) { console.log('fail', r, e.message.slice(0, 100)); }
  }
  await b.close();
})();
