import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { documentFileUrl } from '@/db/repositories/board-meetings';
import { meetingError, type DocContext } from '../../../_respond';

/**
 * GET /api/board-meetings/documents/:docId/file?which=file|signed — redirect to a short-lived
 * download link. Clients: signed copies of locked documents only.
 */
export async function GET(request: Request, context: DocContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { docId } = await context.params;
  const which = new URL(request.url).searchParams.get('which') === 'signed' ? 'signed' : 'file';
  try {
    const { url } = await documentFileUrl(guard.ctx, docId, which);
    return NextResponse.redirect(url, 302);
  } catch (e) {
    return meetingError(e);
  }
}
