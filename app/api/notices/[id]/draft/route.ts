import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { getNoticeCase } from '@/db/repositories/notice-cases';
import { runDraftNoticeReply } from '@/lib/actions/compliance/draft-notice-reply';
import { noticeError, routeActionContext, STAFF } from '../../_respond';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/notices/:id/draft — `compliance.draftNoticeReply` from the desk: one model call writes
 * a reply draft and the documents it needs, saved on the case. A private draft (T1); nothing is
 * sent. The model call can take up to a minute.
 */
export async function POST(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const result = await runDraftNoticeReply(routeActionContext(guard.ctx), { caseId: id });
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    const item = await getNoticeCase(guard.ctx, id);
    return NextResponse.json({ summary: result.summary, item });
  } catch (e) {
    return noticeError(e);
  }
}
