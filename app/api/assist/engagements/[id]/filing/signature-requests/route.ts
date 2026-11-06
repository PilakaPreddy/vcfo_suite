import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendSignatureRequests } from '@/lib/mca-filing/filing-service';
import { NO_STORE, assistStaff, filingError, formSchema, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ form: formSchema, signerIds: z.array(z.string().trim().min(1).max(120)).max(50).optional() }).strict();

/**
 * POST /api/assist/engagements/[id]/filing/signature-requests — staff pressed the button: each
 * signer gets one email with the latest portal PDF. Nothing sends this on its own. Refused until
 * the PDF is approved. Staff only; 503 while VCFO_ASSIST_ENABLED is not on.
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
    const out = await sendSignatureRequests(auth.ctx, id, parsed.data.form, parsed.data.signerIds);
    if (!out) return notFound();
    return NextResponse.json({ ok: true, filing: out.filing, requests: out.requests }, { headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'signature requests');
  }
}
