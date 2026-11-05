import 'server-only';
import type { AuthContext } from '@/auth/guards';
import { finishSummarySend } from '@/db/repositories/receivables';
import { sendMailViaOutlook } from '@/db/repositories/outlook-connections';
import { todayIst } from './dates';
import type { SnapshotRow } from './model';
import { receivablesWorkbook, receivablesWorkbookName } from './xlsx';

/**
 * The summary email's slow part (docs/specs/receivables/PLAN.md, Phase 4). The send-summary route
 * checks everything that can fail fast, logs the send as `sending`, answers 202 and hands this to
 * `after`. It builds the workbook once, sends through Graph and marks the log row `sent` or
 * `failed` with a reason code the dialog can show.
 */

/** Outlook errors the manager can act on; anything else is a plain send failure. */
export function outlookErrorCode(e: unknown): 'outlook_not_connected' | 'outlook_reconnect' | null {
  const message = e instanceof Error ? e.message : '';
  if (message === 'outlook_not_connected') return 'outlook_not_connected';
  if (message.includes('invalid_grant') || message.includes('refresh')) return 'outlook_reconnect';
  return null;
}

/** The slow part, after the response: one workbook, one Graph call, then the outcome on the log row. */
export async function deliverSummary(
  ctx: AuthContext,
  sheetId: string,
  sendId: string,
  job: { clientOrgName: string; snapshot: SnapshotRow[]; attachExcel: boolean; mail: { to: string[]; cc: string[]; bcc: string[]; subject: string; html: string } },
): Promise<void> {
  try {
    const today = todayIst();
    const attachments = job.attachExcel
      ? [
          {
            name: receivablesWorkbookName(job.clientOrgName, today),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBase64: Buffer.from(await receivablesWorkbook(job.snapshot, today)).toString('base64'),
          },
        ]
      : [];
    await sendMailViaOutlook(ctx, { ...job.mail, attachments });
    await finishSummarySend(ctx, sheetId, sendId, { status: 'sent' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[receivables] summary send failed', message.slice(0, 200));
    await finishSummarySend(ctx, sheetId, sendId, { status: 'failed', error: outlookErrorCode(e) ?? 'send_failed' }).catch((err) =>
      console.error('[receivables] could not record the failed send', err instanceof Error ? err.message : err),
    );
  }
}
