import { NextResponse } from 'next/server';
import { siteUrl } from '@/lib/site-url';
import { todayIst } from '@/lib/receivables/dates';
import { publicPageUrl } from '@/lib/receivables/links';
import { contactSuggestions, recipientLists } from '@/lib/receivables/recipients';
import { summaryEmailHtml, summaryEmailSubject } from '@/lib/receivables/summary-email';
import { getSummarySource } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';

/**
 * GET /api/receivables/sheets/:id/summary — the summary email ready to edit: subject, body in the
 * finance team's format built from the published version, the ready-made recipient lists and the
 * contacts to suggest. 409 not_published before the first Update.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const src = await getSummarySource(guard.ctx, id);
    const today = todayIst();
    const liveUrl = publicPageUrl(siteUrl(), src.sheet);
    return NextResponse.json({
      versionSeq: src.version.seq,
      publishedAt: src.version.publishedAt,
      subject: src.lastSend?.subject.startsWith('RE:') ? `RE: ${summaryEmailSubject(today)}` : summaryEmailSubject(today),
      html: summaryEmailHtml({ rows: src.version.snapshot, today, liveUrl, signerName: guard.ctx.name }),
      lists: recipientLists({ partners: src.partners, rows: src.version.snapshot, today, lastSend: src.lastSend }),
      contacts: contactSuggestions(src.partners, src.lastSend),
      lastSentAt: src.lastSend?.sentAt ?? null,
    });
  } catch (e) {
    return receivablesError(e);
  }
}
