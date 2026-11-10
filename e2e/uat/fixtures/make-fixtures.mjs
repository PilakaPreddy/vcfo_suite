// Makes the sample files the acceptance run uploads: KYC documents for each director,
// registration certificates and a certificate of incorporation (PDF), a passport photo (PNG).
// Every file says SAMPLE across it. Run: node e2e/uat/fixtures/make-fixtures.mjs
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const { chromium } = req('@playwright/test');
const out = join(dirname(fileURLToPath(import.meta.url)), 'files');
mkdirSync(out, { recursive: true });

const directors = [
  { key: 'kiran', name: 'KIRAN RAO', father: 'SURESH RAO', dob: '14/04/1988', pan: 'ABCPR1234K', aadhaar: '2345 6789 0123', address: '22 Lavelle Road, Bengaluru, Karnataka 560001' },
  { key: 'meera', name: 'MEERA IYER', father: 'RAMESH IYER', dob: '02/09/1990', pan: 'BCDPI5678L', aadhaar: '3456 7890 1234', address: '7 Cunningham Road, Bengaluru, Karnataka 560052' },
];

const card = (title, rows, color) => `<!doctype html><html><head><style>
body{margin:0;font-family:Arial,sans-serif;background:#fff}
.c{width:640px;margin:40px auto;border:2px solid ${color};border-radius:16px;padding:28px 32px;position:relative;overflow:hidden}
h1{margin:0 0 18px;font-size:22px;color:${color}} .r{display:flex;gap:16px;margin:8px 0;font-size:16px}
.k{width:190px;color:#555} .v{font-weight:700}
.w{position:absolute;inset:0;display:grid;place-items:center;font-size:90px;font-weight:900;color:#d00a;transform:rotate(-18deg)}
</style></head><body><div class="c"><h1>${title}</h1>${rows.map(([k, v]) => `<div class="r"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}<div class="w">SAMPLE</div></div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.UAT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
async function pdf(name, html) {
  await page.setContent(html);
  await page.pdf({ path: join(out, name), format: 'A4', printBackground: true });
}
for (const d of directors) {
  await pdf(`pan-${d.key}.pdf`, card('INCOME TAX DEPARTMENT · PERMANENT ACCOUNT NUMBER', [['Name', d.name], ["Father's name", d.father], ['Date of birth', d.dob], ['PAN', d.pan]], '#1d4ed8'));
  await pdf(`aadhaar-${d.key}.pdf`, card('UNIQUE IDENTIFICATION AUTHORITY OF INDIA · AADHAAR', [['Name', d.name], ['Date of birth', d.dob], ['Aadhaar', d.aadhaar], ['Address', d.address]], '#b45309'));
  await pdf(`address-proof-${d.key}.pdf`, card('BESCOM · ELECTRICITY BILL (OCTOBER 2026)', [['Consumer', d.name], ['Address', d.address], ['Amount', '₹ 1,842.00']], '#047857'));
  await page.setViewportSize({ width: 350, height: 450 });
  await page.setContent(`<div style="width:350px;height:450px;background:linear-gradient(#cbd5e1,#94a3b8);display:grid;place-items:center;font:700 28px Arial;color:#334155">PHOTO<br>${d.name}<br>SAMPLE</div>`);
  await page.screenshot({ path: join(out, `photo-${d.key}.png`) });
}
await pdf('office-noc.pdf', card('NO OBJECTION CERTIFICATE · REGISTERED OFFICE', [['Owner', 'Prakash Holdings LLP'], ['Premises', '4th Floor, 12 Residency Road, Bengaluru 560025'], ['Company', 'Nilgiri Analytics Private Limited']], '#7c3aed'));
await pdf('coi-kaveri.pdf', card('MINISTRY OF CORPORATE AFFAIRS · CERTIFICATE OF INCORPORATION', [['Company', 'KAVERI FOODS PRIVATE LIMITED'], ['CIN', 'U15400KA2026PTC123456'], ['Date', '01/08/2026'], ['PAN', 'AAKCK1234F'], ['TAN', 'BLRK12345F']], '#0f766e'));
for (const [k, t, n] of [
  ['gst', 'GOODS AND SERVICES TAX · REGISTRATION CERTIFICATE (FORM REG-06)', '29AAKCK1234F1Z5'],
  ['pf', 'EMPLOYEES PROVIDENT FUND ORGANISATION · ESTABLISHMENT CODE', 'KNBNG2654321000'],
  ['esi', 'EMPLOYEES STATE INSURANCE CORPORATION · REGISTRATION', '53000123450001001'],
  ['pt', 'KARNATAKA PROFESSIONAL TAX · ENROLMENT CERTIFICATE', 'PTEC 123456789'],
  ['shops', 'KARNATAKA SHOPS AND COMMERCIAL ESTABLISHMENTS · REGISTRATION', 'SEA/BNG/2026/04567'],
]) {
  await pdf(`cert-${k}.pdf`, card(t, [['Name', 'KAVERI FOODS PRIVATE LIMITED'], ['Number', n], ['Date', '20/09/2026']], '#0f172a'));
}
await pdf('filing-proof.pdf', card('ACKNOWLEDGEMENT · RETURN FILED', [['Company', 'KAVERI FOODS PRIVATE LIMITED'], ['Reference', 'ACK-2026-10-55821'], ['Filed on', '09/11/2026']], '#0369a1'));
await browser.close();
console.log('fixtures in', out);
