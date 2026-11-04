import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { revokeShareLink, updateShareLink } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';
import { shareFields, shareLinkDto } from '../_dto';

/**
 * PATCH  /api/receivables/share-links/:id — rename a shared view or change who may open it, its
 *        expiry or the Excel download. The saved filters stay as they were.
 * DELETE /api/receivables/share-links/:id — revoke it; the link stops working at once.
 */
const patchSchema = z.object({
  name: shareFields.name.optional(),
  visibility: shareFields.visibility.optional(),
  allowedEmails: shareFields.allowedEmails.optional(),
  allowDownload: shareFields.allowDownload.optional(),
  expiresAt: shareFields.expiresAt.optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const link = await updateShareLink(guard.ctx, id, body.data);
    return NextResponse.json({ link: shareLinkDto(link) });
  } catch (e) {
    return receivablesError(e);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const link = await revokeShareLink(guard.ctx, id);
    return NextResponse.json({ link: shareLinkDto(link) });
  } catch (e) {
    return receivablesError(e);
  }
}
