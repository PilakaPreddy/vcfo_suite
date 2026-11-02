import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { deleteTemplate } from '@/db/repositories/board-meetings';
import { meetingError, type RouteContext } from '../../../board-meetings/_respond';

/** DELETE /api/agenda-library/templates/:id — firm templates: admins; client templates: staff in scope. */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    await deleteTemplate(guard.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return meetingError(e);
  }
}
