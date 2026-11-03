import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { systemPeekPartnerToken, systemSetPartnerPassword } from '@/db/repositories/receivables';

/**
 * The set-password link of a client partner login (Phase 8). Public on purpose: the partner has
 * no password yet, and the link token is the authority (`partner-logins.ts`, one use, seven days).
 *
 * GET  /api/public/receivables/set-password?token=… → { email, companyName } or 404 for a bad link.
 * POST /api/public/receivables/set-password { token, password } → { ok: true, email } or 400.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const out = await systemPeekPartnerToken(token);
  if (!out) return NextResponse.json({ error: 'This link is invalid or has expired' }, { status: 404 });
  return NextResponse.json(out);
}

const bodySchema = z.object({ token: z.string().min(32).max(128), password: z.string().min(8, 'Use at least 8 characters').max(128) });

export async function POST(request: Request) {
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  const out = await systemSetPartnerPassword(body.data.token, body.data.password);
  if (out.status === 'ok') return NextResponse.json({ ok: true, email: out.email });
  return NextResponse.json(
    { error: out.status === 'too_short' ? 'Use at least 8 characters' : 'This link is invalid or has expired' },
    { status: 400 },
  );
}
