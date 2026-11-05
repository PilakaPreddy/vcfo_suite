import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertEngagementBoardResolutionAccess } from '@/lib/api/board-resolution-access';
import {
  boardResolutionAuthErrorResponse,
  boardResolutionErrorJson,
  toBoardResolutionError,
} from '@/lib/api/board-resolution-errors';
import { generateAndStoreBoardResolution } from '@/lib/api/board-resolution-generate';
import { parseJsonBody } from '@/lib/api/parse-body';
import { requireAnyRole } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  checklistStateFromRow,
  toAppEngagement,
} from '@/db/repositories/engagements';
import {
  assertLeadMayEdit,
  BOARD_RESOLUTION_WITH_MANAGER,
  getBoardResolutionByEngagementId,
  repairBoardResolutionStorage,
  saveBoardResolutionDraft,
} from '@/db/repositories/board-resolution';
import {
  currentNocSnapshot,
  getNocTemplateOverride,
  recordBoardResolutionVersion,
} from '@/db/repositories/board-resolution-noc';
import { withNocVariantOverride } from '@/lib/noc/receive';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

const generateBodySchema = z.object({
  overrides: z.record(z.string(), z.string()).optional(),
  content: z.string().min(1).optional(),
  forceTemplateRefresh: z.boolean().optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
  if (auth.ok === false) {
    return NextResponse.json(boardResolutionAuthErrorResponse(auth.error, auth.status), {
      status: auth.status,
    });
  }

  const { id: engagementParam } = await context.params;

  const access = await assertEngagementBoardResolutionAccess(auth.ctx, engagementParam);
  if (access.notFound) {
    return NextResponse.json(boardResolutionAuthErrorResponse('not_found', 404), { status: 404 });
  }
  if (access.forbidden || !access.row) {
    return NextResponse.json(boardResolutionAuthErrorResponse('forbidden', 403), { status: 403 });
  }

  // A staff "Change template" override (R-52, T2) replaces the three ownership answers that
  // pick the template, so generation renders the chosen variant without touching the generator.
  const templateOverride = await getNocTemplateOverride(auth.ctx, access.dbId).catch(() => null);
  const engagement = withNocVariantOverride(toAppEngagement(access.row), templateOverride);
  const checklistState = checklistStateFromRow(access.row);
  try {
    assertLeadMayEdit(auth.ctx, checklistState);
  } catch (err) {
    const message = publicErrorMessage(err, BOARD_RESOLUTION_WITH_MANAGER);
    return NextResponse.json({ ok: false, error: message, code: 'with_manager' }, { status: 409 });
  }

  let overrides: Record<string, string> | undefined;
  let editedContent: string | undefined;
  let forceTemplateRefresh = false;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const parsedBody = await parseJsonBody(request, generateBodySchema);
    if (parsedBody.ok === false) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid request. Check the form and try again.',
          code: 'validation_error',
        },
        { status: parsedBody.status },
      );
    }
    if (parsedBody.data.overrides) overrides = parsedBody.data.overrides;
    if (parsedBody.data.content?.trim()) editedContent = parsedBody.data.content.trim();
    if (parsedBody.data.forceTemplateRefresh) forceTemplateRefresh = true;
  }

  let existingDoc: Awaited<ReturnType<typeof getBoardResolutionByEngagementId>>;
  try {
    existingDoc = await getBoardResolutionByEngagementId(auth.ctx, access.dbId);
  } catch (err) {
    const mapped = toBoardResolutionError(err);
    return NextResponse.json(boardResolutionErrorJson(mapped), { status: mapped.status });
  }

  const isFinalized = existingDoc?.status === 'finalized';
  const allowFinalizedRepair = isFinalized && forceTemplateRefresh;

  try {
    const { content, storagePath, templateFingerprint } = await generateAndStoreBoardResolution(
      engagement,
      checklistState,
      {
        overrides,
        content: editedContent,
        existingStoragePath: existingDoc?.storagePath,
        preserveTemplateFingerprint:
          editedContent && !forceTemplateRefresh
            ? existingDoc?.templateFingerprint ?? null
            : undefined,
        forceTemplateRefresh,
        isFinalized,
        allowFinalizedRepair,
      },
    );

    const saved = allowFinalizedRepair
      ? await repairBoardResolutionStorage(
          auth.ctx,
          engagement.id,
          content,
          storagePath,
          templateFingerprint,
        )
      : await saveBoardResolutionDraft(
          auth.ctx,
          engagement.id,
          content,
          storagePath,
          templateFingerprint,
        );

    // T4: a fresh render from the answers is a version; saving inline edits is not.
    if (!editedContent || forceTemplateRefresh) {
      try {
        const fields = currentNocSnapshot(access.row, templateOverride);
        await recordBoardResolutionVersion(auth.ctx, access.dbId, { variant: fields.__variant ?? '', fields });
      } catch (err) {
        console.error('[board-resolution] could not record the draft version', err);
      }
    }

    await recordAuditEvent(auth.ctx, {
      engagementId: engagement.id,
      action: 'board_resolution.generate',
      summary: 'Generated board resolution document',
      actorEmail: auth.ctx.email,
      actorName: auth.ctx.name,
      metadata: { forceTemplateRefresh },
    });

    return NextResponse.json({
      ok: true,
      doc: saved,
      downloadUrl: `/api/engagements/${engagement.id}/board-resolution/download`,
    });
  } catch (err) {
    const mapped = toBoardResolutionError(err);
    return NextResponse.json(boardResolutionErrorJson(mapped), { status: mapped.status });
  }
}
