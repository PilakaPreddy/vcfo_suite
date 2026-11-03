import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { updateLibraryItem } from '@/db/repositories/board-meetings';
import { meetingError, type RouteContext } from '../../board-meetings/_respond';

/** PATCH /api/agenda-library/:id — edit one library item (Firm settings › Agenda library). Admins. */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(
    request,
    z.object({
      topic: z.string().max(200).optional(),
      scenario: z.string().max(300).optional(),
      wording: z.string().max(2000).optional(),
      law: z.string().max(300).optional(),
      applicability: z.string().max(200).optional(),
      action: z.string().max(200).optional(),
      notes: z.string().max(2000).optional(),
      active: z.boolean().optional(),
    }),
  );
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ item: await updateLibraryItem(guard.ctx, decodeURIComponent(id), body.data) });
  } catch (e) {
    return meetingError(e);
  }
}
