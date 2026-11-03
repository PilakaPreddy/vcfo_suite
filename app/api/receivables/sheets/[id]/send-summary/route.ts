import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { todayIst } from '@/lib/receivables/dates';
import { cleanRecipients, tidyEmailHtml } from '@/lib/receivables/recipients';
import { receivablesWorkbook, receivablesWorkbookName } from '@/lib/receivables/xlsx';
import { getSummarySource, recordSummarySend } from '@/db/repositories/receivables';
import { sendMailViaOutlook } from '@/db/repositories/outlook-connections';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST /api/receivables/sheets/:id/send-summary — sends the (edited) summary from the manager's
 * own Outlook to any To, Cc and Bcc, with the published version as an Excel file when asked, and
 * logs the send. 409 outlook_not_connected when the mailbox is not linked.
 */
const person = z.object({ name: z.string().max(120).default(''), email: z.string().max(200) });
const schema = z.object({
  to: z.array(person).min(1, 'to_required').max(100),
  cc: z.array(person).max(100).default([]),
  bcc: z.array(person).max(100).default([]),
  subject: z.string().min(1, 'subject_required').max(200),
  html: z.string().min(1, 'body_required').max(300_000),
  attachExcel: z.boolean().default(true),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const input = body.data as z.infer<typeof schema>;
  const people = cleanRecipients({ to: input.to, cc: input.cc, bcc: input.bcc });
  if (people.invalid.length) return NextResponse.json({ error: 'bad_email', invalid: people.invalid }, { status: 400 });
  if (!people.to.length) return NextResponse.json({ error: 'to_required' }, { status: 400 });
  try {
    const src = await getSummarySource(guard.ctx, id);
    const today = todayIst();
    const attachments = input.attachExcel
      ? [
          {
            name: receivablesWorkbookName(src.sheet.clientOrgName, today),
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            contentBase64: Buffer.from(await receivablesWorkbook(src.version.snapshot, today)).toString('base64'),
          },
        ]
      : [];
    const { msEmail } = await sendMailViaOutlook(guard.ctx, {
      to: people.to.map((r) => r.email),
      cc: people.cc.map((r) => r.email),
      bcc: people.bcc.map((r) => r.email),
      subject: input.subject.trim(),
      html: tidyEmailHtml(input.html),
      attachments,
    });
    await recordSummarySend(guard.ctx, id, { versionId: src.version.id, to: people.to, cc: people.cc, bcc: people.bcc, subject: input.subject.trim(), channel: 'outlook' });
    return NextResponse.json({ ok: true, from: msEmail, to: people.to.length, cc: people.cc.length, bcc: people.bcc.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message === 'outlook_not_connected') return NextResponse.json({ error: 'outlook_not_connected' }, { status: 409 });
    if (message.includes('invalid_grant') || message.includes('refresh')) return NextResponse.json({ error: 'outlook_reconnect' }, { status: 409 });
    if (e instanceof Error && !('status' in e) && message) {
      console.error('[receivables] summary send failed', message.slice(0, 200));
      return NextResponse.json({ error: 'send_failed' }, { status: 502 });
    }
    return receivablesError(e);
  }
}
