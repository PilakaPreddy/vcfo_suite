import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordFilingReview } from '@/db/repositories/assist-filings';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { FILING_FORM_LABEL } from '@/lib/mca-filing/filing-state';
import { NO_STORE, assistStaff, filingError, formSchema, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ form: formSchema, note: z.string().trim().max(2000).optional() }).strict();

/**
 * POST /api/assist/engagements/[id]/filing/review — the professional's approval of the latest
 * portal PDF: who and when. Refused (`missing_values_need_note`) while values are missing or the
 * PDF cannot be read, unless a note is given. Staff only; 503 while VCFO_ASSIST_ENABLED is not on.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
  try {
    const out = await recordFilingReview(auth.ctx, id, parsed.data.form, parsed.data.note ?? null);
    if (!out) return notFound();
    await recordAuditEvent(auth.ctx, {
      engagementId: out.dbId,
      action: 'assist_filing.reviewed',
      summary: `Approved the ${FILING_FORM_LABEL[parsed.data.form]} PDF`,
      metadata: { form: parsed.data.form, withNote: out.withNote },
    });
    return NextResponse.json({ ok: true, filing: out.filing }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'filing review');
  }
}
