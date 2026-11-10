import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { getNoticeCase, updateNoticeCase } from '@/db/repositories/notice-cases';
import { parseJsonBody } from '@/lib/api/parse-body';
import { NOTICE_AUTHORITIES, NOTICE_STAGES } from '@/lib/notices/model';
import { noticeError, STAFF } from '../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/** GET /api/notices/:id — one case in the caller's scope. */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const item = await getNoticeCase(guard.ctx, id);
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    return noticeError(e);
  }
}

const patch = z
  .object({
    authority: z.enum(NOTICE_AUTHORITIES),
    section: z.string().max(60).nullable(),
    periodLabel: z.string().max(60).nullable(),
    din: z.string().max(80).nullable(),
    demandAmount: z.string().max(20).nullable(),
    receivedOn: day,
    responseDueOn: day,
    hearingOn: day,
    stage: z.enum(NOTICE_STAGES),
    ownerId: z.string().uuid().nullable(),
    summary: z.string().max(600).nullable(),
    replyDraft: z.string().max(40_000).nullable(),
    documentsNeeded: z.array(z.string().max(200)).max(40),
    notes: z.string().max(4000).nullable(),
  })
  .partial();

/**
 * PATCH /api/notices/:id — staff edit a case on the desk: its facts, the reply draft, the
 * document list or its stage. Submitting or closing a case is the partner's approval of the final
 * reply, so the repository allows it to admins and managers only.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = await parseJsonBody(request, patch);
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const { item } = await updateNoticeCase(guard.ctx, id, parsed.data);
    return NextResponse.json({ item });
  } catch (e) {
    return noticeError(e);
  }
}
