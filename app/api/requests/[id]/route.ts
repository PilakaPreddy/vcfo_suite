import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  getDocumentRequestById,
  updateDocumentRequest,
} from '@/db/repositories/document-requests';
import type { DocRequest } from '@/data/engagements';
import { emptyEmailDispatch } from '@/lib/email/email-dispatch';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/requests/[id] */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  const docRequest = await getDocumentRequestById(guard.ctx, id);
  if (!docRequest) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ request: docRequest });
}

/** PATCH /api/requests/[id] */
export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await context.params;
  let patch: Partial<Pick<DocRequest, 'status' | 'label' | 'message' | 'fileName' | 'uploadedAt'>>;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  try {
    const previous = await getDocumentRequestById(guard.ctx, id);
    const docRequest = await updateDocumentRequest(guard.ctx, id, patch);
    if (!docRequest) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const newlyUploaded =
      previous?.status !== 'uploaded' && docRequest.status === 'uploaded';
    const email = newlyUploaded
      ? await notifyEngagementEventSoon({
          engagementId: docRequest.engagementId,
          itemId: docRequest.taskId?.trim() || 'document-request',
          event: 'client_uploaded',
          requestLabel: docRequest.label,
          actorUserId: guard.ctx.userId,
        })
      : emptyEmailDispatch();
    return NextResponse.json({ request: docRequest, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    const status = message.includes('may only') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
