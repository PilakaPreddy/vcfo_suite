import { NextResponse } from 'next/server';
import { listAssistAttachments } from '@/db/repositories/assist-attachments';
import { NO_STORE, assistStaff, filingError } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/assist/engagements/[id]/attachments — the SPICe+ files for the VCFO Assist extension,
 * one row per file. `available` is true only when the object is really in storage. Staff only;
 * 503 while VCFO_ASSIST_ENABLED is not on. Contract: docs/context/notes/assist-filing.md.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  try {
    const out = await listAssistAttachments(auth.ctx, id);
    if (out.ok === false) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
    return NextResponse.json({ ok: true, items: out.value.items }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'attachments list');
  }
}
