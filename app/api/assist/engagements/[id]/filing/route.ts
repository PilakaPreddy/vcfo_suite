import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateFiling } from '@/db/repositories/assist-filings';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { filingBundle } from '@/lib/mca-filing/filing-service';
import { FILING_FORM_LABEL, FILING_STATES } from '@/lib/mca-filing/filing-state';
import { REMARK_CAUSES } from '@/lib/mca-filing/readiness';
import { NO_STORE, assistStaff, filingError, formSchema, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateOnly = z.string().regex(DATE, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date');

const patchSchema = z
  .object({
    form: formSchema,
    state: z.enum(FILING_STATES).optional(),
    srn: z.string().trim().min(1).max(40).optional(),
    srnOn: dateOnly.optional(),
    remark: z.string().trim().min(1).max(2000).optional(),
    remarkCause: z.enum(REMARK_CAUSES).optional(),
    paidOn: dateOnly.optional(),
    signedUploadedOn: dateOnly.optional(),
  })
  .strict()
  .refine((b) => b.state || b.srn || b.srnOn || b.remark || b.paidOn || b.signedUploadedOn, { message: 'Nothing to change' });

/**
 * GET   /api/assist/engagements/[id]/filing — both SPICe+ forms, their PDFs, the missing profile
 *       values and the signers Suite knows.
 * PATCH /api/assist/engagements/[id]/filing — state, SRN, remark and dates of one form.
 * Staff only; 503 while VCFO_ASSIST_ENABLED is not on. No MCA login, OTP, DSC PIN or token is
 * accepted: the strict schema refuses any other field.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  try {
    const bundle = await filingBundle(auth.ctx, id);
    if (!bundle) return notFound();
    return NextResponse.json({ ok: true, ...bundle }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'filing read');
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
  const { form, ...patch } = parsed.data;
  try {
    const out = await updateFiling(auth.ctx, id, form, patch);
    if (!out) return notFound();
    if (out.changed.length > 0) {
      await recordAuditEvent(auth.ctx, {
        engagementId: out.dbId,
        action: 'assist_filing.updated',
        summary: `Updated the ${FILING_FORM_LABEL[form]} filing record`,
        // Field names only: a remark's words stay out of events that clients can read.
        metadata: { form, changed: out.changed, state: out.filing.state },
      });
    }
    return NextResponse.json({ ok: true, filing: out.filing }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'filing update');
  }
}
