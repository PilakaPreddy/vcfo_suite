import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { cancelMeeting, getMeeting, systemMeetingBundle, systemMeetingPeople } from '@/db/repositories/board-meetings';
import { sendCancellation } from '@/lib/board-meetings/send';
import { meetingError, type RouteContext } from '../../_respond';

/** POST /api/board-meetings/:id/cancel { reason } — cancels; if the notice went out, emails a cancellation. */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  const body = await parseJsonBody(request, z.object({ reason: z.string().max(500).default('') }));
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const { before } = await cancelMeeting(guard.ctx, id, body.data.reason);
    const bundle = await systemMeetingBundle(id);
    const team = bundle ? await systemMeetingPeople(bundle.engagement) : null;
    await sendCancellation(id, {
      leadId: team?.lead?.id ?? null,
      notifyIds: [team?.lead?.id, team?.manager?.id].filter((x): x is string => Boolean(x)),
      wasSent: Boolean(before.sentAt),
    });
    return NextResponse.json({ meeting: await getMeeting(guard.ctx, id) });
  } catch (e) {
    return meetingError(e);
  }
}
