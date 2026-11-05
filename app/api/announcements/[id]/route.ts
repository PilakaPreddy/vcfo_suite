import { NextResponse } from 'next/server';
import { requireAdminOrManager } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { deleteAnnouncement } from '@/db/repositories/announcements';
import { publicErrorMessage } from '@/lib/api-error';

/** DELETE /api/announcements/[id] */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminOrManager();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }
  try {
    const ok = await deleteAnnouncement(guard.ctx, id);
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    await recordAuditEvent(guard.ctx, {
      action: 'announcements.delete',
      summary: 'Deleted an announcement',
      metadata: { announcementId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    const status = message.includes('not permitted') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
