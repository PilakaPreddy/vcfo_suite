import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { sendEmail } from '@/lib/email/send-email';
import { siteUrl } from '@/lib/site-url';
import { partnerInvoiceUrl, sbcReplyEmail } from '@/lib/receivables/partner-emails';
import { addSbcNote, listNotes } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET  /api/receivables/invoices/:id/notes — the invoice's notes, oldest first (Phase 8).
 * POST /api/receivables/invoices/:id/notes { text } — an SBC reply. The partner gets a short
 *      email with a link to the invoice; that email is best effort and never fails the request.
 * Who may act is decided in the repository: the sheet's own manager and the firm-wide admins.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    return NextResponse.json({ notes: await listNotes(guard.ctx, id) });
  } catch (e) {
    return receivablesError(e);
  }
}

const schema = z.object({ text: z.string().trim().min(1, 'note').max(2000, 'note') });

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, schema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  let result;
  try {
    result = await addSbcNote(guard.ctx, id, body.data.text);
  } catch (e) {
    return receivablesError(e);
  }
  if (result.notify) {
    const to = result.notify;
    const mail = sbcReplyEmail({
      partnerName: to.name,
      invoiceLabel: result.invoiceLabel,
      authorName: result.note.authorName,
      text: result.note.text,
      url: partnerInvoiceUrl(siteUrl(), result.invoiceId),
    });
    // Fire-and-forget: the reply is saved whether or not the email goes out.
    void sendEmail({ to: to.email, subject: mail.subject, html: mail.html, text: mail.text, purpose: 'receivables.sbc_reply' })
      .then((r) => {
        if (!r.ok && !r.skipped) console.error('[receivables] reply email not sent', r.error);
      })
      .catch((e) => console.error('[receivables] reply email failed', e instanceof Error ? e.message : e));
  }
  return NextResponse.json({ note: result.note });
}
