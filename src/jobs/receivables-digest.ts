import { inngest } from './client';
import { systemDigestSheetIds, systemDigestSource } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { receivablesDigestEmail } from '@/lib/receivables/digest';
import { sendEmail } from '@/lib/email/send-email';
import { siteUrl } from '@/lib/site-url';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Receivables Monday digest, at 08:40 IST on Mondays (docs/specs/receivables/PLAN.md, Phase 10).
 * One email per sheet to that sheet's manager: collected last week, overdue now (the five
 * largest), promises and invoices due this week, reminders that failed, and changes waiting
 * for an Update. The manager turns it off per sheet in the Reminders tab
 * (`reminderRules.digestEnabled`). A sheet with nothing to say gets no email.
 *
 * Email is the system of record and goes through `sendEmail`; there is no WhatsApp digest. Each
 * sheet is its own step, so a retry never sends a sheet twice in one run; "Run now" from the
 * developer console does send again. Returns early while "Pause all jobs" is on. Registered in
 * app/api/inngest/route.ts and src/lib/dev/jobs-registry.ts.
 */
export const receivablesDigest = inngest.createFunction(
  { id: 'receivables-digest' },
  withRunNow('receivables-digest', 'TZ=Asia/Kolkata 40 8 * * 1'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const today = todayIst();
    const sheets = await step.run('load-sheets', () => systemDigestSheetIds());
    let sent = 0;
    let empty = 0;
    let failed = 0;
    for (const s of sheets) {
      const outcome = await step.run(`digest-${s.sheetId}`, async () => {
        const src = await systemDigestSource(s.sheetId, today);
        if (!src) return 'gone' as const;
        const url = `${siteUrl().replace(/\/$/, '')}/receivables/manager?sheet=${src.sheetId}`;
        const mail = receivablesDigestEmail({ ...src, url });
        if (!mail) return 'empty' as const;
        const res = await sendEmail({ to: src.managerEmail, subject: mail.subject, html: mail.html, text: mail.text });
        if (!res.ok && !res.skipped) {
          console.warn('[receivables-digest] not sent for sheet', src.sheetId, res.error);
          return 'failed' as const;
        }
        return 'sent' as const;
      });
      if (outcome === 'sent') sent += 1;
      else if (outcome === 'empty') empty += 1;
      else if (outcome === 'failed') failed += 1;
    }
    return { today, sheets: sheets.length, sent, empty, failed };
  },
);
