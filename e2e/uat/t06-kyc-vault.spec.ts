import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { note, firstStart, resetRecords, as, closeAll, noteEmails, shot, sql, step, state, seen, settle, RESULTS } from './helpers/uat';
import { FILES, runStep } from './helpers/fill-step';
import { TRACK_A, TRACK_B } from './fixtures/data';
import { statSync } from 'node:fs';

/** T-06 KYC, DSC and the document vault on Track A. */
const T = 'T-06';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const KYC = [
  ['PAN — Kiran Rao', 'pan-kiran.pdf'],
  ['Aadhaar — Kiran Rao', 'aadhaar-kiran.pdf'],
  ['PAN — Meera Iyer', 'pan-meera.pdf'],
  ['Address proof — Meera Iyer', 'address-proof-meera.pdf'],
] as const;

test('T-06 KYC, DSC and document vault', async ({ browser }) => {
  const { trackA } = state<{ trackA: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead');

  await step(lead, { test: T, step: 1, role: 'lead', caption: 'The lead sends the client a request for each KYC document from the Vault.' }, async () => {
    const have = await sql<{ n: number }>(`select count(*)::int n from document_requests where engagement_id = $1`, [trackA.id]).catch(() => [{ n: 0 }]);
    await lead.goto('/app/intern/vault');
    await settle(lead);
    const entity = lead.getByRole('combobox', { name: /Client|Entity/ }).locator('visible=true').first();
    if (await entity.count()) {
      await entity.click();
      await lead.getByRole('option', { name: new RegExp(TRACK_A.short) }).first().click();
    }
    const manage = lead.getByText('Manage', { exact: true }).locator('visible=true').first();
    if (await manage.count()) await manage.click();
    if ((have[0]?.n ?? 0) < KYC.length) {
      for (const [label] of KYC) {
        await lead.getByRole('button', { name: /Request a file/ }).locator('visible=true').first().click();
        const d = lead.getByRole('dialog');
        await d.getByLabel('File needed').fill(label);
        await d.getByRole('textbox').nth(1).fill('Please upload a clear scan, all pages.').catch(() => {});
        if (label === KYC[0][0]) await shot(lead, { test: T, step: 1, role: 'lead', status: 'pass', caption: 'The lead fills "Request a file" for the first KYC document.', marks: [{ at: d.getByLabel('File needed'), kind: 'focus', n: 1 }, { at: d.getByRole('button', { name: 'Send request' }), kind: 'focus', n: 2 }] });
        await d.getByRole('button', { name: 'Send request' }).click();
        // Fix D-T06-01: the email to the client now opens for the lead to send from Outlook.
        const compose = lead.getByRole('dialog').filter({ hasText: 'Email client' });
        await compose.waitFor({ timeout: 15_000 });
        if (label === KYC[0][0]) await shot(lead, { test: T, step: 1, role: 'lead', status: 'pass', caption: 'After "Send request" the email to the client opens, addressed and written. Here Send is disabled because no Outlook is connected on this private copy.', marks: [{ at: compose.getByText('kiran.rao@uat-client.test').first(), kind: 'ok', n: 1 }, { at: compose.getByRole('button', { name: 'Send' }), kind: 'focus', n: 2 }] });
        await compose.getByRole('button', { name: 'Cancel' }).click();
        await expect(lead.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
      }
    }
    await settle(lead, KYC[3][0]);
    return { caption: 'Four KYC requests are listed under "Requested files".', marks: KYC.map(([l], i) => ({ at: seen(lead, l), kind: 'ok' as const, n: i + 1 })) };
  });

  const client = await as(browser, 'client');
  await step(client, { test: T, step: 2, role: 'client', caption: 'The client uploads each requested KYC file from the portal\'s Documents page.' }, async () => {
    await client.goto('/app/client/documents');
    await settle(client, /Upload/);
    for (const [label, file] of KYC) {
      const up = client.getByRole('button', { name: /^Upload · \d+ requested/ }).locator('visible=true').first();
      if (!(await up.count())) break;
      await up.click();
      const d = client.getByRole('dialog');
      await d.getByRole('radio', { name: new RegExp(label) }).first().click().catch(() => {});
      await d.locator('input[type=file]').first().setInputFiles(join(FILES, file));
      if (label === KYC[0][0]) await shot(client, { test: T, step: 2, role: 'client', status: 'pass', caption: `The client picks the request "${label}" and attaches ${file}.`, marks: [{ at: d.getByRole('radio', { name: new RegExp(label) }).first(), kind: 'focus', n: 1 }, { at: d.getByRole('button', { name: /^Upload/ }).last(), kind: 'focus', n: 2 }] });
      await d.getByRole('button', { name: /^Upload( \d+ files)?$/ }).last().click();
      await client.waitForTimeout(2000);
      const done = d.getByRole('button', { name: 'Done' });
      if (await done.count()) await done.click();
      await client.keyboard.press('Escape').catch(() => {});
    }
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from document_requests where engagement_id = $1 and status = 'fulfilled'`, [trackA.id]);
    await client.reload();
    await settle(client);
    expect(n).toBeGreaterThanOrEqual(KYC.length);
    return { caption: `The four files are uploaded: ${n} requests now show as fulfilled.`, marks: [{ at: seen(client, /pan-kiran|PAN — Kiran/), kind: 'ok', n: 1 }] };
  });

  await runStep(lead, { test: T, stepNo: 3, role: 'lead', engagement: trackA, itemId: 'pre-7', slug: 'kyc-review-and-dsc-creation', title: 'KYC Review & DSC', plan: { file: 'pan-kiran.pdf', choices: { 'DSC': 'Yes', 'KYC': 'Yes' }, values: { kycReviewNotes: 'All KYC documents checked against the originals. No corrections needed.' } } });

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager opens Vault › Client view and sees the uploaded files in folders.' }, async () => {
    await mgr.goto('/app/manager/vault');
    await settle(mgr);
    const entity = mgr.getByRole('combobox', { name: /Client|Entity/ }).locator('visible=true').first();
    if (await entity.count()) {
      await entity.click();
      await mgr.getByRole('option', { name: new RegExp(TRACK_A.short) }).first().click();
    }
    const cv = mgr.getByRole('tab', { name: 'Client view' }).or(mgr.getByRole('button', { name: 'Client view', exact: true })).locator('visible=true').first();
    if (await cv.count()) await cv.click();
    await settle(mgr, /pan-kiran|PAN/);
    return { marks: [{ at: seen(mgr, /pan-kiran|PAN — Kiran/), kind: 'ok', n: 1 }] };
  });

  await step(client, { test: T, step: 5, role: 'client', caption: 'The client downloads all documents as one ZIP file.' }, async () => {
    await client.goto('/app/client/documents');
    await settle(client, /Download all/);
    const [dl] = await Promise.all([client.waitForEvent('download', { timeout: 30_000 }), client.getByRole('button', { name: /Download all \(ZIP\)/ }).or(client.getByRole('link', { name: /Download all \(ZIP\)/ })).locator('visible=true').first().click()]);
    const path = join(RESULTS, 'client-documents.zip');
    await dl.saveAs(path);
    const { execFileSync } = await import('node:child_process');
    const list = execFileSync('python3', ['-c', `import zipfile,sys;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))`, path]).toString().trim().split('\n');
    expect(list.length).toBeGreaterThanOrEqual(KYC.length);
    return { caption: `The ZIP (${Math.round(statSync(path).size / 1024)} KB) holds ${list.length} files.`, detail: list.join('\n'), marks: [{ at: client.getByRole('button', { name: /Download all/ }).locator('visible=true').first(), kind: 'ok', n: 1 }] };
  });

  // Isolation: the Track B client must not see Track A files, by page or by API.
  const clientB = await as(browser, 'clientB');
  await step(clientB, { test: T, step: 6, role: 'clientB', caption: 'A different client (Kaveri Foods) cannot see Nilgiri\'s files, in the page or through the API.' }, async () => {
    await clientB.goto('/app/client/documents');
    await settle(clientB);
    const body = await clientB.locator('body').innerText();
    expect(body).not.toMatch(/pan-kiran|Kiran Rao|Nilgiri/);
    const docs = await sql<{ id: string }>(`select id from documents where engagement_id = $1 limit 1`, [trackA.id]).catch(() => []);
    let apiNote = 'no document id to try';
    if (docs[0]) {
      const r = await clientB.request.get(`/api/documents/${docs[0].id}/signed-url`);
      const r2 = await clientB.request.get(`/api/engagements/${trackA.id}`);
      apiNote = `GET /api/documents/<Nilgiri file>/signed-url → ${r.status()}; GET /api/engagements/<Nilgiri> → ${r2.status()}`;
      expect([401, 403, 404]).toContain(r.status());
      expect([401, 403, 404]).toContain(r2.status());
    }
    return { caption: `Kaveri's client sees only Kaveri's documents. ${apiNote}.`, detail: apiNote };
  });

  note({ test: T, step: 1, status: 'untestable', caption: 'The document-request email reaches the client.', detail: 'The lead sends it from the compose window through their own Outlook. On production each lead connects Outlook once (Settings › Email); then click Send in that window and check the client\'s inbox.' });
  await noteEmails(T, startedAt, false);
  void TRACK_B;
});
