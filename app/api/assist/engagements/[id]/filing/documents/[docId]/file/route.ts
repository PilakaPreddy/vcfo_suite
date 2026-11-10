import { NextResponse } from 'next/server';
import { readFilingDocument } from '@/db/repositories/assist-filings';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { NO_STORE, assistStaff, filingError, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string; docId: string }> };

/**
 * GET /api/assist/engagements/[id]/filing/documents/[docId]/file — one filing PDF as base64, for
 * the extension's signed upload and the card's Open link. Another engagement's document is 404.
 * The read is audited. Staff only; 503 while VCFO_ASSIST_ENABLED is not on.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id, docId } = await context.params;
  try {
    const file = await readFilingDocument(auth.ctx, id, docId);
    if (!file) return notFound();
    await recordAuditEvent(auth.ctx, {
      engagementId: file.dbId,
      action: 'assist_filing.document_read',
      summary: `Fetched a filing PDF (${file.kind === 'signed_pdf' ? 'signed' : 'portal'})`,
      metadata: { documentId: docId, form: file.form, kind: file.kind },
    });
    return NextResponse.json({ ok: true, fileName: file.fileName, contentType: file.contentType, base64: file.bytes.toString('base64') }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'filing document read');
  }
}
