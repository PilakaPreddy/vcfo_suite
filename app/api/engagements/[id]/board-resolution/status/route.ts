import { NextResponse } from 'next/server';
import {
  assertEngagementBoardResolutionAccess,
  fetchBoardResolutionForApi,
} from '@/lib/api/board-resolution-access';
import {
  boardResolutionNeedsTemplateRefresh,
  boardResolutionRootSourceNewerThanTemplate,
  boardResolutionTemplateInfo,
  parseBoardResolutionUpdatedAtMs,
} from '@/lib/api/board-resolution-template';
import { requireAnyRole } from '@/auth/guards';
import { getNocTemplateOverride } from '@/db/repositories/board-resolution-noc';
import { withNocVariantOverride } from '@/lib/noc/receive';
import { publicErrorMessage } from '@/lib/api-error';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
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

  try {
    const doc = await fetchBoardResolutionForApi(auth.ctx, access.dbId);
    // The template follows a staff "Change template" override, as generation does (R-52, T2).
    const templateOverride = await getNocTemplateOverride(auth.ctx, access.dbId).catch(() => null);
    const templateInfo = boardResolutionTemplateInfo(access.row ? withNocVariantOverride(access.row, templateOverride) : access.row);
    const {
      path: templatePath,
      fingerprint: templateFingerprint,
      modifiedAtMs: templateModifiedAtMs,
      rootSourcePath,
      rootSourceModifiedAtMs,
    } = templateInfo;
    const docFingerprint = doc?.templateFingerprint?.trim() || null;
    const docUpdatedAtMs = parseBoardResolutionUpdatedAtMs(doc?.updatedAt);
    const rootSourceNewerThanTemplate = boardResolutionRootSourceNewerThanTemplate(templateInfo);
    const needsTemplateRefresh = boardResolutionNeedsTemplateRefresh(
      doc,
      templateFingerprint,
      templateModifiedAtMs,
      { rootSourceNewerThanTemplate },
    );

    if (process.env.NODE_ENV === 'development') {
      console.info('[board-resolution/status]', {
        engagementId: access.dbId,
        templatePath,
        templateFingerprint,
        docFingerprint,
        templateModifiedAtMs,
        docUpdatedAt: doc?.updatedAt ?? null,
        docUpdatedAtMs,
        rootSourcePath,
        rootSourceModifiedAtMs,
        rootSourceNewerThanTemplate,
        needsTemplateRefresh,
      });
    }

    return NextResponse.json({
      ok: true,
      needsTemplateRefresh,
      templateFingerprint,
      docFingerprint,
      templateModifiedAtMs,
      docUpdatedAt: doc?.updatedAt ?? null,
      docUpdatedAtMs,
      docStoragePath: doc?.storagePath?.trim() || null,
      docStatus: doc?.status ?? null,
      rootSourceNewerThanTemplate,
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'status_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
