// End-to-end test: the built extension in Chrome, a FAKE Suite tab and the MOCK portal.
//
//   npm run build && npm run e2e
//
// It proves, with the real extension: the profile is fetched inside the Suite tab (cookie sent),
// the guards refuse the user id, password, captcha and OTP, nothing is written before the
// confirmation, Submit and Pay are never clicked by the agent, the SRN is read and written back,
// no profile value is sent anywhere, the portal host gets no request beyond its static files, and
// the drift page heals at T1 with 0 AI calls and a patch proposal.
//
// Playwright comes from the Suite repository's node_modules (it is not a dependency here). Set
// CHROME_PATH to a Chrome for Testing or Chromium binary; branded Chrome ignores --load-extension.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockPortal } from '../mock-portal/serve.mjs';
import { startFakeSuite, SENTINELS } from './fake-suite.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const extPath = path.join(root, '.output/chrome-mv3');
const artifacts = path.join(here, 'artifacts');
mkdirSync(artifacts, { recursive: true });

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.resolve(root, '../../node_modules/playwright'));
}

const MOCK_PORT = 4318;
const SUITE_PORT = 4319;
const SUITE = `http://localhost:${SUITE_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

let failures = 0;
function check(cond, what) {
  if (cond) console.log(`  ok   ${what}`);
  else {
    failures += 1;
    console.log(`  FAIL ${what}`);
  }
}

if (!existsSync(path.join(extPath, 'manifest.json'))) {
  console.error('Build the extension first: npm run build');
  process.exit(1);
}

const portalLog = [];
const mock = await startMockPortal(MOCK_PORT, portalLog);
const suite = await startFakeSuite(SUITE_PORT);
const executablePath = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const headless = process.env.HEADFUL ? false : true;

const context = await playwright.chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'vcfo-assist-e2e-')), {
  executablePath,
  headless,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-first-run', '--no-default-browser-check'],
  viewport: { width: 1100, height: 900 },
});

async function main() {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log(`extension loaded: ${extId} (${headless ? 'headless' : 'headful'})`);
  await sw.evaluate((origin) => chrome.storage.local.set({ 'vcfo.settings': { suiteOrigins: [origin] } }), SUITE);

  const suitePage = context.pages()[0] ?? (await context.newPage());
  await suitePage.goto(`${SUITE}/suite.html`);
  const portal = await context.newPage();
  await portal.goto(`${MOCK}/spice-a.html`);
  await portal.bringToFront();

  // The side panel page, opened in its own window so the portal stays the active tab of its window.
  const panelUrl = `chrome-extension://${extId}/sidepanel.html`;
  const pagePromise = context.waitForEvent('page', { predicate: (p) => p.url().startsWith(panelUrl) });
  await sw.evaluate((url) => chrome.windows.create({ url, type: 'popup', width: 420, height: 1000 }), panelUrl);
  const panel = await pagePromise;
  await panel.setViewportSize({ width: 400, height: 1400 }).catch(() => undefined);
  const runState = () => panel.getByTestId('run-state').innerText();
  const waitState = (s) => panel.getByTestId('run-state').filter({ hasText: s }).waitFor({ timeout: 20000 });

  console.log('Run 1: Part A on the mock');
  await panel.getByText('Connected', { exact: true }).waitFor({ timeout: 15000 });
  check(true, 'panel shows Connected (Suite reached through the Suite tab)');
  await panel.locator('.picker select').selectOption('eng-1');
  await panel.getByText('Ready', { exact: true }).waitFor({ timeout: 10000 });
  check(true, 'readiness badge shows Ready (profile missing[] is empty)');
  await panel.screenshot({ path: path.join(artifacts, 'panel-home.png'), fullPage: true });

  await portal.bringToFront();
  await panel.getByRole('button', { name: 'Run', exact: true }).first().click();
  await panel.getByRole('button', { name: 'I have logged in' }).waitFor({ timeout: 15000 });
  check((await runState()) === 'WAIT LOGIN', 'run waits at WAIT_LOGIN');
  await panel.getByRole('button', { name: 'I have logged in' }).click();
  await panel.getByTestId('confirm-fill').waitFor({ timeout: 15000 });
  await panel.screenshot({ path: path.join(artifacts, 'panel-confirm.png'), fullPage: true });
  const writesBefore = await portal.evaluate(() => window.__mock.modelWrites.length);
  check(writesBefore === 0, 'nothing is written before the user confirms the fill table (G13)');

  await panel.getByTestId('confirm-fill').click();
  await waitState('WAIT DSC');
  const filled = await portal.evaluate(() => ({
    n1: document.querySelector('[name=proposedName1]').value,
    n2: document.querySelector('[name=proposedName2]').value,
    type: document.querySelector('[name=companyType]').value,
    div: document.querySelector('[name=mainDivision]').value,
    tm: document.querySelector('input[name=trademarkSimilar]:checked')?.value,
    sig: document.querySelector('[name=significance]').value,
    login: ['login-user', 'login-password', 'login-captcha', 'login-otp'].map((id) => document.getElementById(id).value),
    writes: window.__mock.modelWrites,
    clicks: window.__mock.clicks,
    marks: document.querySelector('vcfo-assist-overlay')?.getAttribute('data-marks') ?? '',
  }));
  check(filled.n1 === 'Sentinel Alpha Private Limited' && filled.n2 === 'Sentinel Beta Private Limited', 'proposed names filled');
  check(filled.type === 'NEW' && filled.div === '62', 'selects filled by option text');
  check(filled.tm === undefined && filled.sig === '', 'askUser fields (significance, trademark) left for the user');
  check(filled.writes.includes('proposedName1'), 'fills went through guideBridge in the MAIN world');
  check(filled.login.every((v) => v === ''), 'user id, password, captcha and OTP stay empty');
  check(filled.marks.includes('refused'), 'overlay shows refused-field badges');
  check(!filled.clicks['btn-submit'] && !filled.clicks['btn-pay'], 'Submit and Pay not clicked');
  check(filled.clicks['btn-check'] === 1 && filled.clicks['btn-download'] === 1, 'Check form and Download PDF clicked once each');
  const activity = await panel.getByTestId('activity').innerText();
  check(activity.includes('recipe spice-a@1.1.0 from Suite verified'), "Suite's recipe used (HMAC accepted on the mock host)");
  for (const code of ['G1', 'G2', 'G3']) check(activity.includes(`${code}: refused`), `activity log shows a ${code} refusal`);

  await panel.getByTestId('pdf-input').setInputFiles({ name: 'signed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% signed by the user (mock)\n') });
  await waitState('WAIT SUBMIT PAY');
  const gate = await portal.evaluate(() => ({
    attached: document.getElementById('attach-status').textContent,
    marks: document.querySelector('vcfo-assist-overlay')?.getAttribute('data-marks') ?? '',
    clicks: window.__mock.clicks,
  }));
  check(gate.attached.includes('signed.pdf'), 'signed PDF attached to the portal slot');
  check(gate.marks.includes('human'), 'Submit and Pay pulse with "You click this"');
  check(!gate.clicks['btn-submit'] && !gate.clicks['btn-pay'], 'still no Submit or Pay click at WAIT_SUBMIT_PAY');
  await panel.waitForTimeout(3000);
  check((await runState()) === 'WAIT SUBMIT PAY', 'engine keeps waiting for the human');

  // The human clicks Submit and Pay.
  await portal.bringToFront();
  await portal.click('#btn-submit');
  await portal.click('#btn-pay');
  await waitState('DONE');
  check((await panel.getByTestId('srn').innerText()).includes('AB1234567'), 'panel shows SRN AB1234567');
  await panel.screenshot({ path: path.join(artifacts, 'panel-done.png'), fullPage: true });
  await portal.screenshot({ path: path.join(artifacts, 'portal-done.png'), fullPage: true });

  const api = suite.log.filter((e) => e.path.startsWith('/api/'));
  check(api.length > 0 && api.every((e) => e.cookie.includes('fake-session=staff-1')), 'every Suite call carried the Suite session cookie (same-origin)');
  const rejected = api.filter((e) => e.status >= 400 && e.path !== '/api/assist/catalog');
  if (rejected.length) console.log('    rejected:', JSON.stringify(rejected.map((e) => [e.method, e.path, e.status, e.body])));
  check(rejected.length === 0, 'Suite accepted every request body (strict keys)');
  check(api.every((e) => !e.origin.startsWith('chrome-extension://')), 'no Suite call came from the extension origin');
  const outbound = api.filter((e) => e.method !== 'GET').map((e) => e.body).join('\n');
  check(SENTINELS.every((v) => !outbound.includes(v)), 'no profile value in any request body sent to Suite');
  check(api.some((e) => e.method === 'PATCH' && e.body.includes('"srn":"AB1234567"') && e.body.includes('"status":"done"')), 'SRN written back to the run');
  check(!api.some((e) => e.path === '/api/assist/resolve'), 'resolver never called (0 AI calls)');
  const portalOther = portalLog.filter((e) => !(e.method === 'GET' && /\.(html|js|css)$/.test(e.path)) && e.path !== '/favicon.ico');
  if (portalOther.length) console.log('    portal requests:', JSON.stringify(portalOther));
  check(portalOther.length === 0, 'portal host received only its static files (G7)');

  console.log('Run 2: drift page');
  await panel.getByRole('button', { name: 'New run' }).click();
  await portal.goto(`${MOCK}/spice-a-drift.html`);
  await portal.bringToFront();
  await panel.getByRole('button', { name: 'Run', exact: true }).first().waitFor();
  await panel.waitForTimeout(500);
  await panel.getByRole('button', { name: 'Run', exact: true }).first().click();
  await panel.getByRole('button', { name: 'I have logged in' }).click({ timeout: 15000 });
  await panel.getByTestId('confirm-fill').waitFor({ timeout: 15000 });
  const tiers = await panel.locator('table.diff tbody tr').allInnerTexts();
  check(tiers.some((t) => t.includes('Proposed name 2') && t.includes('T1')), 'Proposed name 2 healed at T1 in the confirm table');
  await panel.getByTestId('confirm-fill').click();
  await waitState('WAIT DSC');
  const drift = await portal.evaluate(() => document.querySelector('[name=nameOption2]').value);
  check(drift === 'Sentinel Beta Private Limited', 'renamed field filled after healing');
  const patch = suite.log.find((e) => e.path === '/api/assist/patches');
  check(Boolean(patch) && patch.body.includes('"sourceTier":"T1"') && patch.body.includes('nameOption2'), 'patch proposal sent to Suite');
  check(!suite.log.some((e) => e.path === '/api/assist/resolve'), 'drift healed with 0 AI calls');
  const meter = await panel.getByTestId('meter').innerText();
  check(/0\s*AI calls/.test(meter.replace(/\n/g, ' ')), 'token meter shows 0 AI calls');
  await panel.screenshot({ path: path.join(artifacts, 'panel-drift.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Cancel run' }).click();
  await waitState('CANCELLED');
  check(true, 'run cancelled');

  // G8: nothing in extension storage looks like a credential.
  const stored = await sw.evaluate(async () => JSON.stringify([await chrome.storage.local.get(null), await chrome.storage.session.get(null)]));
  const scrubbed = stored.replace(/"(label|reason|text|note|foundLabel)":"[^"]*"/g, '');
  const hit = /fake-session|staff-1|"(password|captcha\w*|otp|userId|cookie|token)":"[^"]+"/i.exec(scrubbed);
  if (hit) console.log('    storage match:', hit[0]);
  check(!hit, 'no credential, cookie or token in chrome.storage (G8)');
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.error('E2E error:', err);
  for (const p of context.pages()) await p.screenshot({ path: path.join(artifacts, `error-${context.pages().indexOf(p)}.png`) }).catch(() => undefined);
} finally {
  await context.close();
  mock.close();
  suite.server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
