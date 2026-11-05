import { NextResponse } from 'next/server';
import {
  assertEngagementBoardResolutionAccess,
  fetchBoardResolutionForApi,
} from '@/lib/api/board-resolution-access';
import { requireAnyRole } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  contentTypeForSignedBoardResolutionPath,
  validateSignedBoardResolutionFile,
} from '@/lib/board-resolution/board-resolution-storage';
import { patchChecklistItem } from '@/db/repositories/engagements';
import { setSignedBoardResolution } from '@/db/repositories/board-resolution';
import { putSignedBoardResolution } from '@/storage/board-resolution';
import { bucketKey, deleteObject } from '@/storage/s3';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

function extensionForFile(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (file.type === 'application/pdf') return 'pdf';
  return 'docx';
}

/**
 * POST multipart: file — the signed board resolution. The client uploads it from the portal; since
 * S-574 staff (lead, manager, admin, super admin) may upload a copy the client returned by mail.
 * The file goes to S3 through `src/storage`, the row is scoped by the repository, and the upload
 * is written to the audit log.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAnyRole('client', 'intern', 'manager', 'admin', 'super_admin');
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id: engagementParam } = await context.params;

  const access = await assertEngagementBoardResolutionAccess(auth.ctx, engagementParam);
  if (access.notFound) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (access.forbidden) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let doc;
  try {
    doc = await fetchBoardResolutionForApi(auth.ctx, access.dbId);
  } catch {
    return NextResponse.json({ ok: false, error: 'load_failed' }, { status: 500 });
  }

  if (!doc || doc.status !== 'finalized' || !doc.storagePath?.trim()) {
    return NextResponse.json({ ok: false, error: 'not_finalized' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const validationErr = validateSignedBoardResolutionFile(file);
  if (validationErr) {
    return NextResponse.json({ ok: false, error: validationErr }, { status: 400 });
  }

  const extension = extensionForFile(file);
  const contentType = contentTypeForSignedBoardResolutionPath(`x.${extension}`);
  const bytes = Buffer.from(await file.arrayBuffer());

  let storagePath: string;
  try {
    storagePath = await putSignedBoardResolution(
      engagementParam,
      bytes,
      extension,
      contentType,
    );
  } catch (err) {
    const message = publicErrorMessage(err, 'upload_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  try {
    const updated = await setSignedBoardResolution(auth.ctx, engagementParam, storagePath);
    try {
      await recordAuditEvent(auth.ctx, {
        engagementId: access.dbId,
        action: 'board_resolution.signed_upload',
        summary:
          auth.ctx.role === 'client'
            ? 'Client uploaded the signed board resolution'
            : 'Staff uploaded the signed board resolution',
        actorEmail: auth.ctx.email,
        actorName: auth.ctx.name,
        metadata: { storagePath, fileName: file.name },
      });
    } catch (err) {
      console.error('[board-resolution] could not audit the signed upload', err);
    }
    try {
      await patchChecklistItem(auth.ctx, engagementParam, 'pre-3', {
        responses: { signedBoardResolutionUrl: storagePath },
      });
    } catch (err) {
      console.error('[board-resolution] could not attach signed copy to pre-3', err);
    }
    return NextResponse.json({
      ok: true,
      path: storagePath,
      signedUploadedAt: updated.signedUploadedAt,
      signedStoragePath: updated.signedStoragePath,
    });
  } catch (err) {
    try {
      await deleteObject(bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, storagePath));
    } catch {
      /* best-effort */
    }
    const message = publicErrorMessage(err, 'save_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
