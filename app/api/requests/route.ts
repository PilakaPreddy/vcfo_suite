import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  createDocumentRequest,
  listDocumentRequests,
} from '@/db/repositories/document-requests';

/** GET /api/requests */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const requests = await listDocumentRequests(guard.ctx);
    return NextResponse.json({ requests });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'list_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/requests */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  let body: {
    engagementId?: string;
    taskId?: string;
    label?: string;
    message?: string;
    dueAt?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.engagementId?.trim() || !body.label?.trim()) {
    return NextResponse.json({ error: 'engagementId_and_label_required' }, { status: 400 });
  }
  try {
    const docRequest = await createDocumentRequest(guard.ctx, {
      engagementId: body.engagementId,
      taskId: body.taskId,
      label: body.label.trim(),
      message: body.message,
      dueAt: body.dueAt,
    });
    const email = await notifyEngagementEventSoon({
      engagementId: body.engagementId,
      itemId: body.taskId?.trim() || 'document-request',
      event: 'request_created',
      note: body.message,
      requestLabel: body.label.trim(),
      actorUserId: guard.ctx.userId,
    });
    return NextResponse.json({ request: docRequest, email }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create_failed';
    const status = message.includes('not permitted') || message.includes('may not') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
