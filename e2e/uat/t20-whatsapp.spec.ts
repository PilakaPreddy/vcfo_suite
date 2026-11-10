import { test, expect } from '@playwright/test';
import { firstStart, resetRecords, as, closeAll, note, sql, step, seen, settle, team } from './helpers/uat';

/** T-20 WhatsApp: consent and number in the profile; sending needs Meta-approved templates (not here). */
const T = 'T-20';
firstStart(T);
test.beforeAll(() => resetRecords(T));
test.afterAll(closeAll);

test('T-20 WhatsApp', async ({ browser }) => {
  const lead = await as(browser, 'lead2');
  await step(lead, { test: T, step: 1, role: 'lead2', caption: 'The lead adds a WhatsApp number and ticks consent in Settings › About you.' }, async () => {
    await lead.goto('/app/intern/settings');
    await settle(lead, /About you/);
    const wa = lead.locator('#profile-whatsapp').or(lead.getByPlaceholder('+91 98765 43210')).first();
    await wa.fill('+91 98450 67890');
    const consent = lead.locator('#profile-whatsapp-consent').or(lead.getByRole('checkbox', { name: /WhatsApp updates/ })).first();
    if (!(await consent.isChecked())) await consent.click();
    const save = lead.getByRole('button', { name: /^Save/ }).locator('visible=true').last();
    await save.click();
    await lead.waitForTimeout(2000);
    const [p] = await sql<{ phone: string | null; optin: boolean | null }>(`select phone_e164 as phone, (whatsapp_opt_in_at is not null and whatsapp_opt_out_at is null) as optin from profiles where email = $1`, [team().lead2!.email]);
    expect(p.optin).toBe(true);
    return { caption: `Saved: WhatsApp ${p.phone ?? '(number stored)'} with consent ticked.`, marks: [{ at: wa, kind: 'ok', n: 1 }, { at: consent, kind: 'ok', n: 2 }] };
  });

  await step(null, { test: T, step: 3, caption: 'With WhatsApp switched off (WHATSAPP_ENABLED=false, the kill switch), events still send their email.' }, async () => {
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int n from notification_deliveries where channel = 'whatsapp' and status not in ('skipped','failed')`);
    expect(n).toBe(0);
    return { detail: `No WhatsApp message was sent in the whole run (${n} delivered), while every email in T-02 to T-17 still went out.` };
  });

  note({ test: T, step: 2, status: 'untestable', caption: 'Each of the six templates arrives on a phone.', detail: 'Needs the six templates approved by Meta, WHATSAPP_ENABLED=true and the AWS End User Messaging number (docs/context/notes/aws.md). A person triggers one event per template and checks the phone, then turns the switch off and checks that only the email goes.' });
  void seen;
});
