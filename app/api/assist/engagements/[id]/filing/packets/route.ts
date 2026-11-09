import { NextResponse } from 'next/server';
import { z } from 'zod';
import { freezeFilingPacket } from '@/lib/mca-filing/filing-service';
import { NO_STORE, assistStaff, filingError, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string }> };

const schema = z.object({ note: z.string().trim().max(500).optional() }).strict();

/**
 * POST /api/assist/engagements/[id]/filing/packets — freeze the engagement's current filing data
 * (assist profile, attachment list, signers, missing keys) as the next numbered packet. The same
 * data as the latest packet adds nothing: 200 with `created: false`, else 201.
 * `attachments_unreadable` (503) when storage could not be checked. Staff only; 503 while
 * VCFO_ASSIST_ENABLED is not on.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id } = await context.params;
  let json: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) json = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'invalid_body' }, { status: 400 });
  try {
    const out = await freezeFilingPacket(auth.ctx, id, parsed.data.note || null);
    if (!out) return notFound();
    return NextResponse.json({ ok: true, packet: out.packet, created: out.created }, { status: out.created ? 201 : 200, headers: NO_STORE });
  } catch (e) {
    return filingError(e, 'packet freeze');
  }
}
