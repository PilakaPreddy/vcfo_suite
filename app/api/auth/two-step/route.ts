import { NextResponse } from 'next/server';
import { z } from 'zod';
import { systemSignInTwoStep } from '@/db/repositories/profiles';
import { parseJsonBody } from '@/lib/api/parse-body';
import { clientIp } from '@/lib/growth/demo-request';
import { takeSignInAttempt } from '@/lib/sign-in-throttle';

const bodySchema = z.object({
  email: z.string().trim().min(1).max(160),
  // The sign-in screen still sends the password; it is not read here (audit finding 2).
  password: z.string().max(128).optional(),
});

/**
 * POST /api/auth/two-step — the sign-in screen's pre-check (G-25), public.
 *
 * Says whether the sign-in will need a two-step code. The answer depends on the email alone
 * (an active account with two-step on), never on the password, so a wrong password and a right
 * one get the same answer and the route cannot be used to guess passwords. An unknown email
 * answers like an account without two-step. It is rate-limited by email and by client IP, and
 * a limited caller gets `codeRequired: false` so the real sign-in shows the limit message.
 * `authorize` in `src/auth/config.ts` is the real gate. This route signs nobody in.
 */
export async function POST(request: Request) {
  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  if (!(await takeSignInAttempt('two-step', body.data.email, clientIp(request.headers)))) {
    return NextResponse.json({ codeRequired: false });
  }
  const twoStep = await systemSignInTwoStep(body.data.email);
  return NextResponse.json({ codeRequired: Boolean(twoStep) });
}
