import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertEngagementBoardResolutionAccess,
  fetchBoardResolutionForApi,
} from '@/lib/api/board-resolution-access';
import { parseJsonBody } from '@/lib/api/parse-body';
import { requireAnyRole } from '@/auth/guards';
import {
  BOARD_RESOLUTION_WITH_MANAGER,
  repairBoardResolutionStorage,
  saveBoardResolutionDraft,
} from '@/db/repositories/board-resolution';

type RouteContext = { params: Promise<{ id: string }> };

const putBodySchema = z.object({
  content: z.string(),
  storagePath: z.string().nullable().optional(),
  templateFingerprint: z.string().nullable().optional(),
  repairFinalizedStorage: z.boolean().optional(),
});

/** GET /api/engagements/:id/board-resolution */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'intern', 'client');
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

  try {
    const boardResolution = await fetchBoardResolutionForApi(auth.ctx, access.dbId);
    if (auth.ctx.role === 'client' && boardResolution && boardResolution.status !== 'finalized') {
      return NextResponse.json({ boardResolution: null });
    }
    return NextResponse.json({ boardResolution });
  } catch (err) {
    const message = publicErrorMessage(err, 'load_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** PUT /api/engagements/:id/board-resolution — draft save / finalized repair. */
export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireAnyRole('admin', 'manager', 'intern');
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

  const body = await parseJsonBody(request, putBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  try {
    if (body.data.repairFinalizedStorage) {
      const path = body.data.storagePath?.trim();
      if (!path) {
        return NextResponse.json({ ok: false, error: 'storage_path required' }, { status: 400 });
      }
      const boardResolution = await repairBoardResolutionStorage(
        auth.ctx,
        access.dbId,
        body.data.content,
        path,
        body.data.templateFingerprint,
      );
      return NextResponse.json({ boardResolution });
    }

    const boardResolution = await saveBoardResolutionDraft(
      auth.ctx,
      access.dbId,
      body.data.content,
      body.data.storagePath,
      body.data.templateFingerprint,
    );
    return NextResponse.json({ boardResolution });
  } catch (err) {
    const message = publicErrorMessage(err, 'save_failed');
    const status = message === BOARD_RESOLUTION_WITH_MANAGER ? 409 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
