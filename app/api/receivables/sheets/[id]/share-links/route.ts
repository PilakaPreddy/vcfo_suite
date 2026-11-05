import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { createShareLink, listShareLinks } from '@/db/repositories/receivables';
import { normaliseShareFilters } from '@/lib/receivables/share-filters';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../../_respond';
import { shareFields, shareLinkDto } from '../../../share-links/_dto';

/**
 * GET  /api/receivables/sheets/:id/share-links — the sheet's shared views with their recent viewers.
 * POST /api/receivables/sheets/:id/share-links — a new shared view of the current filters
 *      (Phase 10). Only the sheet's manager and the firm-wide admins get past the repository.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const links = await listShareLinks(guard.ctx, id);
    return NextResponse.json({ links: links.map(shareLinkDto) });
  } catch (e) {
    return receivablesError(e);
  }
}

const postSchema = z.object({
  name: shareFields.name,
  filters: z.record(z.string(), z.unknown()).default({}),
  visibility: shareFields.visibility,
  allowedEmails: shareFields.allowedEmails.optional(),
  allowDownload: shareFields.allowDownload.optional(),
  expiresAt: shareFields.expiresAt.optional(),
});

export async function POST(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, postSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const link = await createShareLink(guard.ctx, id, { ...body.data, filters: normaliseShareFilters(body.data.filters) });
    return NextResponse.json({ link: shareLinkDto(link) }, { status: 201 });
  } catch (e) {
    return receivablesError(e);
  }
}
