import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { addDirector, listDirectors } from '@/db/repositories/board-meetings';
import { isoDate, meetingError } from '../_respond';

/**
 * GET  /api/board-meetings/directors?engagementId=&includePast=1 — the company's directors
 *      (staff; a client sees current names and DINs only).
 * POST /api/board-meetings/directors — add a director (records a DIR-12 event). Staff.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const p = new URL(request.url).searchParams;
  const engagementId = p.get('engagementId');
  if (!engagementId) return NextResponse.json({ error: 'engagement_required' }, { status: 400 });
  try {
    return NextResponse.json({ directors: await listDirectors(guard.ctx, engagementId, { includePast: p.get('includePast') === '1' }) });
  } catch (e) {
    return meetingError(e);
  }
}

const addSchema = z.object({
  engagementId: z.string().min(1),
  name: z.string().min(1, 'name_required').max(200),
  din: z.string().max(20).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  designation: z.string().max(80).nullable().optional(),
  appointedOn: isoDate.nullable().optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(request, addSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const { engagementId, ...input } = body.data;
  try {
    return NextResponse.json({ director: await addDirector(guard.ctx, engagementId, input) }, { status: 201 });
  } catch (e) {
    return meetingError(e);
  }
}
