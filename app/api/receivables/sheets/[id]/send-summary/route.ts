import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { cleanRecipients, tidyEmailHtml } from '@/lib/receivables/recipients';
import { deliverSummary, outlookErrorCode } from '@/lib/receivables/summary-send';
import { getSummarySendStatus, getSummarySource, recordSummarySend } from '@/db/repositories/receivables';
import { assertOutlookReady } from '@/db/repositories/outlook-connections';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * POST /api/receivables/sheets/:id/send-summary — sends the (edited) summary from the manager's
 * own Outlook to any To, Cc and Bcc, with the published version as an Excel file when asked.
 *
 * Everything that can fail fast is checked before the answer: the input, the addresses, the
 * published version and the Outlook link (409 outlook_not_connected or outlook_reconnect). The
 * send is then logged as `sending` and the route answers 202 { ok, queued, sendId }. Building the
 * workbook and the Graph call run after the response (`after` from next/server, because Inngest
 * cloud keys are not set on App Runner); the log row ends as `sent` or `failed` with the reason.
 *
 * GET ?send=<sendId> — the state of that send, which the dialog polls to show the outcome.
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
  const subject = input.subject.trim();
  try {
    const src = await getSummarySource(guard.ctx, id);
    const { msEmail } = await assertOutlookReady(guard.ctx);
    const { id: sendId } = await recordSummarySend(guard.ctx, id, { versionId: src.version.id, to: people.to, cc: people.cc, bcc: people.bcc, subject, channel: 'outlook', status: 'sending' });
    const ctx = guard.ctx;
    after(() =>
      deliverSummary(ctx, id, sendId, {
        clientOrgName: src.sheet.clientOrgName,
        snapshot: src.version.snapshot,
        attachExcel: input.attachExcel,
        mail: {
          to: people.to.map((r) => r.email),
          cc: people.cc.map((r) => r.email),
          bcc: people.bcc.map((r) => r.email),
          subject,
          html: tidyEmailHtml(input.html),
        },
      }),
    );
    return NextResponse.json({ ok: true, queued: true, sendId, from: msEmail, to: people.to.length, cc: people.cc.length, bcc: people.bcc.length }, { status: 202 });
  } catch (e) {
    const code = outlookErrorCode(e);
    if (code) return NextResponse.json({ error: code }, { status: 409 });
    return receivablesError(e);
  }
}

export async function GET(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const sendId = new URL(request.url).searchParams.get('send') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(sendId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    return NextResponse.json(await getSummarySendStatus(guard.ctx, id, sendId));
  } catch (e) {
    return receivablesError(e);
  }
}
