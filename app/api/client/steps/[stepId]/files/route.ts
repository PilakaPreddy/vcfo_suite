import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { notifyEngagementEvent } from '@/lib/email/notify-engagement-event';
import {
  clientAttachRequestedFile,
  clientUndoRequestedFile,
  FileRequestError,
} from '@/db/repositories/client-incorporation';

type RouteContext = { params: Promise<{ stepId: string }> };

/**
 * POST /api/client/steps/:stepId/files — the client attaches a file the firm
 * asked for (the object is already stored by
 * POST /api/engagements/:id/milestone-documents), or undoes that attach.
 *
 * Body: { engagementId, requestId, path, fileName?, sizeBytes?, contentType? }
 *    or { engagementId, requestId, undo: true }
 * Only the client, only an open request of its own engagement (repository).
 * An attach tells the project leads and the managers ("Client upload", bell +
 * mail, the same event as the Documents page upload); an undo tells nobody.
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { stepId } = await context.params;
  let body: {
    engagementId?: string;
    requestId?: string;
    path?: string;
    fileName?: string;
    sizeBytes?: number;
    contentType?: string;
    undo?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const engagementId = body.engagementId?.trim();
  const requestId = body.requestId?.trim();
  if (!engagementId || !requestId || !stepId?.trim()) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  try {
    const out = body.undo
      ? await clientUndoRequestedFile(guard.ctx, engagementId, stepId.trim(), requestId)
      : await clientAttachRequestedFile(guard.ctx, engagementId, stepId.trim(), {
          requestId,
          path: String(body.path ?? ''),
          fileName: body.fileName,
          sizeBytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : undefined,
          contentType: body.contentType,
        });
    if (!body.undo) {
      // The upload is saved; a notification failure never reaches the client.
      await notifyEngagementEvent({
        engagementId,
        itemId: stepId.trim(),
        event: 'client_uploaded',
        requestLabel: out.request.label,
        actorUserId: guard.ctx.userId,
      }).catch(() => null);
    }
    return NextResponse.json(out);
  } catch (err) {
    if (err instanceof FileRequestError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = publicErrorMessage(err, 'attach_failed');
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
