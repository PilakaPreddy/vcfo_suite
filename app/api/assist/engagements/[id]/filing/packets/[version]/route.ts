import { NextResponse } from 'next/server';
import { readPacket } from '@/db/repositories/assist-filings';
import { NO_STORE, assistStaff, filingError, notFound } from '@/lib/mca-filing/route-helpers';

type RouteContext = { params: Promise<{ id: string; version: string }> };

/**
 * GET /api/assist/engagements/[id]/filing/packets/[version] — one frozen packet as a JSON file to
 * save. It holds personal data of directors and subscribers, so it is staff only and never cached.
 * 503 while VCFO_ASSIST_ENABLED is not on.
 */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await assistStaff();
  if (auth.ok === false) return auth.response;
  const { id, version } = await context.params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) return notFound();
  try {
    const out = await readPacket(auth.ctx, id, n);
    if (!out) return notFound();
    const name = `${out.companyName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'company'}-filing-packet-${n}.json`;
    return new NextResponse(JSON.stringify({ ...out.summary, companyName: out.companyName, content: out.content }, null, 2), {
      headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
    });
  } catch (e) {
    return filingError(e, 'packet read');
  }
}
