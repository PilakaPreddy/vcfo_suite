import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getMeeting, updateMeeting } from '@/db/repositories/board-meetings';
import { agendaItem, hhmm, isoDate, meetingError, recipient, secondZone, type RouteContext } from '../_respond';

/**
 * GET   /api/board-meetings/:id — the meeting page (staff; a client once the notice is sent).
 * PATCH /api/board-meetings/:id — edit the notice: the lead while a draft, the manager while it
 *       waits for approval (each manager edit is a new version).
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  try {
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id) });
  } catch (e) {
    return meetingError(e);
  }
}

const patchSchema = z.object({
  meetingDate: isoDate.optional(),
  meetingTime: hhmm.optional(),
  secondZone: secondZone.optional(),
  mode: z.enum(['vc', 'in_person', 'hybrid']).optional(),
  meetingType: z.enum(['first', 'quarterly', 'annual', 'special']).optional(),
  venue: z.string().max(500).optional(),
  agenda: z.array(agendaItem).max(80).optional(),
  bodyOverride: z.array(z.string().max(4000)).max(20).nullable().optional(),
  recipients: z.array(recipient).max(60).optional(),
  signatoryDirectorId: z.string().uuid().nullable().optional(),
  teamsLink: z.string().max(1000).nullable().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ meeting: await updateMeeting(guard.ctx, id, body.data as Parameters<typeof updateMeeting>[2]) });
  } catch (e) {
    return meetingError(e);
  }
}
