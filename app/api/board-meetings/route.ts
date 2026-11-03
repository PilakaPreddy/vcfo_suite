import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createMeeting, listMeetings } from '@/db/repositories/board-meetings';
import { hhmm, isoDate, meetingError, secondZone } from './_respond';

/**
 * GET  /api/board-meetings?engagementId= — meetings in scope (staff; a client its sent ones).
 * POST /api/board-meetings — New task › Type: Meeting, or post-incorporation step 1. Staff.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const engagementId = new URL(request.url).searchParams.get('engagementId');
  try {
    return NextResponse.json({ meetings: await listMeetings(guard.ctx, { engagementId }) });
  } catch (e) {
    return meetingError(e);
  }
}

const createSchema = z.object({
  engagementId: z.string().min(1),
  kind: z.enum(['board', 'agm', 'egm']).optional(),
  meetingType: z.enum(['first', 'quarterly', 'annual', 'special']).optional(),
  meetingDate: isoDate,
  meetingTime: hhmm,
  secondZone: secondZone.optional(),
  mode: z.enum(['vc', 'in_person', 'hybrid']).optional(),
  venue: z.string().max(500).optional(),
  postInc: z.boolean().optional(),
  copyFromLast: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ meeting: await createMeeting(guard.ctx, body.data) }, { status: 201 });
  } catch (e) {
    return meetingError(e);
  }
}
