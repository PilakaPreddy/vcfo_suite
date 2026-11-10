import { NextResponse } from 'next/server';
import { readAssistAttachment } from '@/db/repositories/assist-attachments';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { NO_STORE, assistStaff, filingError } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string; key: string }> };

const KEY = /^[a-z0-9][a-z0-9.-]{0,80}$/;

/**
 * GET /api/assist/engagements/[id]/attachments/[key] — one file as base64 for the extension,
 * 6 MB at most (413 above). 404 `no_file` when nothing is stored. The read is audited, because
 * the file leaves Suite. Staff only; 503 while VCFO_ASSIST_ENABLED is not on.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id, key } = await context.params;
  if (!KEY.test(key)) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  try {
    const file = await readAssistAttachment(auth.ctx, id, key);
    if (file.ok === false) return NextResponse.json({ ok: false, error: file.error }, { status: file.status });
    await recordAuditEvent(auth.ctx, {
      engagementId: file.dbId,
      action: 'assist_attachment.read',
      summary: `VCFO Assist fetched the SPICe+ attachment ${key}`,
      metadata: { key, size: file.bytes.length },
    });
    return NextResponse.json({ ok: true, fileName: file.fileName, contentType: file.contentType, base64: file.bytes.toString('base64') }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'attachment read');
  }
}
