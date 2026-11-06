import { NextResponse } from 'next/server';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { requestSourceRetest } from '@/db/repositories/reg-sources';
import { publicErrorMessage } from '@/lib/api-error';
import { watchReviewer } from '../../_guard';

/**
 * POST: one more check of a source, for example after a site unblocks the reader. A person asks for
 * it; a blocked source is never retried on its own. The hourly job does the check.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await watchReviewer();
  if (guard.ok === false) return guard.response;
  const { id } = await params;
  try {
    if (!(await requestSourceRetest(guard.ctx, id))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await recordAuditEvent(guard.ctx, { action: 'watch.retest', summary: 'Asked for an official source to be checked again', metadata: { sourceId: id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: publicErrorMessage(err, 'retest_failed') }, { status: 500 });
  }
}
