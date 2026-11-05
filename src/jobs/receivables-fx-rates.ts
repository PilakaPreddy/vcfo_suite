import { inngest } from './client';
import { systemActiveAlerts, systemFxCurrenciesInUse, systemMarkAlertTriggered, systemRateFor, systemUpsertFetchedRate, type DueAlertCheck } from '@/db/repositories/receivables';
import { sendEmail } from '@/lib/email/send-email';
import { todayIst } from '@/lib/receivables/dates';
import { rateAlertEmail } from '@/lib/receivables/fx-alert-email';
import { shouldTrigger } from '@/lib/receivables/fx-desk';
import { fetchReferenceRates, type FetchedRate } from '@/lib/receivables/fx-rate-source';
import { siteUrl } from '@/lib/site-url';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Receivables FX rates, at 14:30 IST on weekdays (docs/specs/receivables/PLAN.md, Phases 9 and 10).
 * FBIL publishes its reference rates around 13:30 IST on Indian business days, so an hour later
 * the configured FBIL-compatible source (`FX_RATE_SOURCE_URL`) is asked first for each currency
 * and the Frankfurter API (`FX_FRANKFURTER_URL`) answers the rest in one call. The currencies are
 * USD plus every currency on an open invoice, an open forward contract or an active rate alert.
 * Each rate is stored once per day and source; a manager's manual override stays in force over it.
 * A currency no source answers is reported as missing and the FX tab keeps the latest earlier rate.
 *
 * After the rates are stored, each active rate alert is checked against the rate in force today.
 * One that is crossed and has not fired today emails the sheet's manager and records the day.
 * An email failure is logged and never fails the job; the alert then tries again on the next run.
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */

export const receivablesFxRates = inngest.createFunction(
  { id: 'receivables-fx-rates' },
  withRunNow('receivables-fx-rates', 'TZ=Asia/Kolkata 30 14 * * 1-5'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIst();
    const currencies = (await step.run('currencies-in-use', () => systemFxCurrenciesInUse())) as string[];
    // step.run hands back the JSON form of the result, which loses the required keys in the type; the value is the same.
    const fetched = (await step.run('fetch-rates', () => fetchReferenceRates(currencies, today))) as FetchedRate[];
    for (const rate of fetched) await step.run(`store-${rate.currency}`, () => systemUpsertFetchedRate(rate));
    const missing = currencies.filter((c) => !fetched.some((r) => r.currency === c));
    if (missing.length) console.warn('[receivables-fx-rates] no rate from any source for', missing.join(', '));

    const alerts = await step.run('check-alerts', () => checkRateAlerts(today));
    return { today, stored: fetched, missing, alerts };
  },
);

/** Checks every active alert against today's rate in force; returns how many fired and were emailed. */
export async function checkRateAlerts(today: string, deps: { send?: typeof sendEmail } = {}): Promise<{ checked: number; fired: number; emailed: number }> {
  const send = deps.send ?? sendEmail;
  let alerts: DueAlertCheck[];
  try {
    alerts = await systemActiveAlerts();
  } catch (e) {
    console.error('[receivables-fx-rates] alerts not loaded', e instanceof Error ? e.message : e);
    return { checked: 0, fired: 0, emailed: 0 };
  }
  const rates = new Map<string, Awaited<ReturnType<typeof systemRateFor>>>();
  let fired = 0;
  let emailed = 0;
  for (const a of alerts) {
    if (!rates.has(a.currency)) rates.set(a.currency, await systemRateFor(a.currency, today).catch(() => null));
    const rate = rates.get(a.currency);
    // Only today's own rate counts: an older rate already had its day.
    if (!rate || rate.rateDate !== today || !shouldTrigger(a, rate.rate, today)) continue;
    fired += 1;
    if (!a.managerEmail) continue;
    try {
      const mail = rateAlertEmail({
        managerName: a.managerName ?? a.managerEmail,
        clientOrgName: a.clientOrgName,
        currency: a.currency,
        direction: a.direction,
        threshold: a.threshold,
        rate: rate.rate,
        rateDate: rate.rateDate,
        source: rate.source,
        exposureFc: a.exposureFc,
        exposureBookedInr: a.exposureBookedInr,
        url: `${siteUrl().replace(/\/$/, '')}/receivables/manager?sheet=${a.sheetId}&tab=fx`,
      });
      const res = await send({ to: a.managerEmail, subject: mail.subject, html: mail.html, text: mail.text, purpose: 'receivables.fx_alert' });
      if (res.ok || res.skipped) {
        await systemMarkAlertTriggered(a.id, today);
        emailed += 1;
      } else {
        console.error('[receivables-fx-rates] alert email not sent', a.id);
      }
    } catch (e) {
      console.error('[receivables-fx-rates] alert email failed', a.id, e instanceof Error ? e.message : e);
    }
  }
  return { checked: alerts.length, fired, emailed };
}
