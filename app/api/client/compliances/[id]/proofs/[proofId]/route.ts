import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  complianceErrorStatus,
  getFilingProofUrl,
  removeFilingProof,
} from '@/db/repositories/client-compliances';

type Ctx = { params: Promise<{ id: string; proofId: string }> };

function fail(e: unknown) {
  const status = complianceErrorStatus(e);
  if (status == null) throw e;
  return NextResponse.json({ error: publicErrorMessage(e, 'request_failed') }, { status });
}

/**
 * GET /api/client/compliances/:id/proofs/:proofId — a short-lived signed URL.
 * `?json=1` returns `{ url, fileName }` (the shared DocViewer's lazy url());
 * otherwise redirects to the file (Download button).
 */
export async function GET(request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id, proofId } = await ctx.params;
  const json = new URL(request.url).searchParams.get('json') === '1';
  try {
    const r = await getFilingProofUrl(guard.ctx, id, proofId, !json);
    if (json) return NextResponse.json(r);
    return NextResponse.redirect(r.url, 302);
  } catch (e) {
    return fail(e);
  }
}

/** DELETE — staff remove a wrongly uploaded proof. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id, proofId } = await ctx.params;
  try {
    await removeFilingProof(guard.ctx, id, proofId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
