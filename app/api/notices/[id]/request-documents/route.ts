import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { previewRequestNoticeDocuments, runRequestNoticeDocuments } from '@/lib/actions/compliance/request-notice-documents';
import { parseJsonBody } from '@/lib/api/parse-body';
import { noticeError, routeActionContext, STAFF } from '../../_respond';

type RouteContext = { params: Promise<{ id: string }> };
const UUID = z.string().uuid();

/**
 * The screen's review of `compliance.requestNoticeDocuments`, the same action the Ask chat proposes.
 *
 * GET  /api/notices/:id/request-documents — what goes out, to whom, and any check that holds it.
 * POST /api/notices/:id/request-documents { confirm: true, documents?, dueAt? } — the approval
 *      click. The checks run again as that person, then the request list is created and sent.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const draft = await previewRequestNoticeDocuments(routeActionContext(guard.ctx), { caseId: id });
    if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const row = draft.rows[0]!;
    return NextResponse.json({
      review: { title: draft.title, tier: draft.tier, recipients: draft.recipients ?? [], summary: row.displayNew, checks: row.checks, heldReason: row.heldReason ?? null },
    });
  } catch (e) {
    return noticeError(e);
  }
}

const body = z.object({
  confirm: z.literal(true),
  documents: z.array(z.string().trim().min(2).max(200)).max(30).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = await parseJsonBody(request, body);
  if (parsed.ok === false) return NextResponse.json({ error: 'Confirm the request first' }, { status: 400 });
  try {
    const result = await runRequestNoticeDocuments(routeActionContext(guard.ctx), { caseId: id, documents: parsed.data.documents, dueAt: parsed.data.dueAt });
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (e) {
    return noticeError(e);
  }
}
