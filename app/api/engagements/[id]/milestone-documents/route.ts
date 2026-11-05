import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  assertEngagementAccess,
  getEngagementBySlug,
} from '@/db/repositories/engagements';
import { indexMilestoneUpload } from '@/db/repositories/documents';
import { getItem } from '@/data/checklist';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isEngagementRouteParam } from '@/lib/slug';
import {
  MILESTONE_DOCUMENTS_BUCKET,
  milestoneDocumentObjectPath,
  validateMilestoneUploadFile,
} from '@/lib/documents/milestone-document-storage';
import {
  MILESTONE_DOCUMENT_EXTENSIONS,
  resolveUploadContentType,
} from '@/lib/upload-limits';
import { bucketKey, putObject } from '@/storage/s3';
import { checklistItemForFieldId, vaultPhaseForItem } from '@/lib/documents/vault-documents';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const FIELD_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;

async function resolveEngagementAccess(
  ctx: Parameters<typeof assertEngagementAccess>[0],
  routeId: string,
) {
  if (!isEngagementRouteParam(routeId)) {
    return { ok: false as const, notFound: true as const, dbId: engagementDbId(routeId) };
  }

  const byId = await assertEngagementAccess(ctx, routeId);
  if (byId.ok) return byId;
  if ('forbidden' in byId && byId.forbidden) return byId;

  // Slug in the URL (staff project routes) — only when id lookup missed.
  if (!isUuidLike(routeId) && !/^e\d+$/.test(routeId)) {
    const row = await getEngagementBySlug(ctx, routeId);
    if (row) {
      return assertEngagementAccess(ctx, row.id);
    }
  }

  return byId;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * POST /api/engagements/:id/milestone-documents
 * Multipart: fieldId + file — upload a milestone form document for any role
 * that can access the engagement (admin / manager / intern / client).
 */
export async function POST(request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const { id: engagementParam } = await context.params;
  const access = await resolveEngagementAccess(guard.ctx, engagementParam);
  if (!access.ok) {
    if ('notFound' in access && access.notFound) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const fieldId = String(form.get('fieldId') ?? '').trim();
  if (!fieldId || !FIELD_ID_RE.test(fieldId)) {
    return NextResponse.json({ ok: false, error: 'invalid_field_id' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const validationErr = validateMilestoneUploadFile(file);
  if (validationErr) {
    return NextResponse.json({ ok: false, error: validationErr }, { status: 400 });
  }

  // Prefer app/legacy id for path builders when the client sent e1 / uuid.
  const pathSource = /^e\d+$/.test(engagementParam.trim())
    ? engagementParam.trim()
    : access.dbId;
  const storagePath = milestoneDocumentObjectPath(pathSource, fieldId, file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = resolveUploadContentType(file, MILESTONE_DOCUMENT_EXTENSIONS);

  try {
    await putObject(bucketKey(MILESTONE_DOCUMENTS_BUCKET, storagePath), bytes, contentType);
  } catch (err) {
    const message = publicErrorMessage(err, 'upload_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  // Every upload gets its index row (clients too), so the vault can say who sent it, and a
  // newer file for the same field marks the earlier ones as replaced (P-575, P-593).
  {
    const stepIdRaw = String(form.get('stepId') ?? '').trim();
    const item =
      (stepIdRaw && FIELD_ID_RE.test(stepIdRaw) ? getItem(stepIdRaw) : undefined) ??
      checklistItemForFieldId(fieldId);
    const field = item
      ? getClientResponseFields(item).find((row) => row.id === fieldId)
      : undefined;
    try {
      await indexMilestoneUpload(guard.ctx, {
        engagementId: access.dbId,
        fieldId,
        fileName: file.name,
        objectKey: storagePath,
        category: field?.section ?? (item ? vaultPhaseForItem(item) : 'documents'),
        contentType,
        sizeBytes: file.size,
        stepId: item?.id ?? null,
      });
    } catch (err) {
      console.warn('[milestone-documents] document index row failed', err);
    }
  }

  return NextResponse.json({ path: storagePath });
}
