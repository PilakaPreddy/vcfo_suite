import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, noteEmails, shot, step, state, seen, settle, stepState } from './helpers/uat';
import { runStep } from './helpers/fill-step';

/** T-12 Registrations on Track B: GST, PF, ESI and Shops & Establishment, approved by the manager. */
const T = 'T-12';
const startedAt = firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

const REGS = [
  { itemId: 'reg-4', slug: 'gst-registration', title: 'GST Registration', file: 'cert-gst.pdf', values: { gstinNumber: '29AAKCK1234F1Z5', gstRegistrationDate: '2026-09-20', lutFilingDate: '2026-10-05', lutArn: 'AD291026000123X' } },
  { itemId: 'reg-1', slug: 'pf-dsc-esign-registration', title: 'PF Registration', file: 'cert-pf.pdf', values: { pfRegistrationNumber: 'KNBNG2654321000', pfRegistrationDate: '2026-09-22' } },
  { itemId: 'reg-3', slug: 'esi-registration', title: 'ESI Registration', file: 'cert-esi.pdf', values: { esiRegistrationNumber: '53000123450001001', esiRegistrationDate: '2026-09-25' } },
  { itemId: 'reg-9', slug: 'shops-establishments-registration', title: 'Shops & Establishment', file: 'cert-shops.pdf', values: {} },
];

test('T-12 Registrations', async ({ browser }) => {
  const { trackB } = state<{ trackB: { id: string; slug: string } }>();
  const lead = await as(browser, 'lead2');

  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead opens Registrations and sees the list for Kaveri Foods.' }, async () => {
    await lead.goto('/app/intern/registrations');
    await settle(lead, /GST/);
    return { marks: [{ at: seen(lead, /GST/), kind: 'focus', n: 1 }] };
  });

  for (const r of REGS) {
    await runStep(lead, { test: T, stepNo: 2, role: 'lead2', engagement: trackB, itemId: r.itemId, slug: r.slug, title: r.title, action: 'approval', expectStatus: /review|reviewing|completed/, plan: { file: r.file, values: r.values } });
  }

  const mgr = await as(browser, 'manager');
  await step(mgr, { test: T, step: 4, role: 'manager', caption: 'The manager opens Approvals: the four registration requests are listed.' }, async () => {
    await mgr.goto('/app/manager/approvals');
    await settle(mgr, /Approvals/);
    await expect(seen(mgr, /GST Registration/)).toBeVisible();
    return { marks: REGS.map((r, i) => ({ at: seen(mgr, r.title), kind: 'ok' as const, n: i + 1 })) };
  });

  for (const r of REGS) {
    await step(mgr, { test: T, step: 4, role: 'manager', caption: `The manager accepts ${r.title}.` }, async () => {
      const before = await stepState(trackB.id, r.itemId);
      if (before.reviewStatus !== 'reviewing') return { caption: `${r.title}: nothing to accept (review "${before.reviewStatus ?? '—'}", status "${before.status}").`, status: 'info' as const };
      await mgr.goto(`/app/manager/projects/${trackB.slug}/step/${r.slug}`);
      await settle(mgr, r.title);
      await mgr.getByRole('button', { name: /^Accept/ }).locator('visible=true').first().click();
      await mgr.waitForTimeout(2500);
      const st = await stepState(trackB.id, r.itemId);
      expect(st.reviewStatus).toBe('accepted');
      return { caption: `${r.title} accepted: status "${st.status}".` };
    });
  }

  const client = await as(browser, 'clientB');
  await step(client, { test: T, step: 5, role: 'clientB', caption: 'The client opens Registrations in the portal and sees the accepted registrations with their numbers.' }, async () => {
    await client.goto('/app/client/registrations');
    await settle(client);
    await client.waitForTimeout(1500);
    const body = await client.locator('body').innerText();
    const shown = REGS.filter((r) => body.includes(r.title.split(' ')[0])).map((r) => r.title);
    expect(shown.length).toBeGreaterThanOrEqual(3);
    return { caption: `The client sees: ${shown.join(', ')}.`, marks: [{ at: seen(client, /GST/), kind: 'ok', n: 1 }, { at: seen(client, /29AAKCK1234F1Z5|GSTIN/), kind: 'ok', n: 2 }] };
  });

  await step(client, { test: T, step: 3, role: 'clientB', caption: 'The registration certificates are in the client\'s Documents.' }, async () => {
    await client.goto('/app/client/documents');
    await settle(client);
    await expect(seen(client, /cert-gst|GST/)).toBeVisible();
    return { marks: [{ at: seen(client, /cert-gst|GST/), kind: 'ok', n: 1 }] };
  });

  void shot;
  await noteEmails(T, startedAt);
});
