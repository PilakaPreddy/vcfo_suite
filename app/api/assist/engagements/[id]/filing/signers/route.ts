import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordSignerFacts } from '@/lib/mca-filing/filing-service';
import { NO_STORE, assistStaff, filingError, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date')
  .nullable();

const schema = z
  .object({ signerId: z.string().trim().min(1).max(120), businessUserOn: day.optional(), dscAssociatedOn: day.optional() })
  .strict()
  .refine((b) => b.businessUserOn !== undefined || b.dscAssociatedOn !== undefined, { message: 'Nothing to change' });

/**
 * PATCH /api/assist/engagements/[id]/filing/signers — record or clear the date staff confirmed a
 * signer's Business User registration or DSC association on MCA. Suite cannot read these from the
 * portal. `unknown_signer` when Suite does not list the signer; `date_in_future`. Staff only; 503
 * while VCFO_ASSIST_ENABLED is not on. No login, OTP or DSC PIN is accepted.
 */
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
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
  const { signerId, ...patch } = parsed.data;
  try {
    const out = await recordSignerFacts(auth.ctx, id, signerId, patch);
    if (!out) return notFound();
    return NextResponse.json({ ok: true, signerId, facts: out.facts }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'signer facts');
  }
}
