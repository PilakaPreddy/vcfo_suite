import 'server-only';

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { whatsappVerifyCodes } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isValidE164 } from '@/lib/notify/phone';
import { isWhatsAppCodeSetUp, sendWhatsAppCode } from '@/lib/notify/send-whatsapp-code';
import type { SendWhatsAppDeps } from '@/lib/notify/send-whatsapp-shared';

/**
 * WHATSAPP VERIFICATION CODES (C-868, Settings › Turn on WhatsApp).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Owner only: every read and write is keyed by `ctx.userId`. A person can send a code to a
 * number and check a code only for themselves; another person's code never matches because
 * the row lookup is scoped to the caller.
 *
 * A code lives ten minutes, locks after five wrong guesses, works once, and only its hash is
 * stored. At most five codes go out per person per hour.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

export type SendCodeOutcome = { status: 'sent' } | { status: 'not_set_up' | 'invalid_phone' | 'too_many' | 'failed' };
export type CheckCodeOutcome = { status: 'ok' } | { status: 'wrong' | 'expired' | 'locked' };

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(`${id}:${code}:${process.env.AUTH_SECRET ?? ''}`).digest('hex');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Whether codes can be sent at all (WhatsApp on and the authentication template named). */
export function whatsappCodeSetUp(): boolean {
  return isWhatsAppCodeSetUp();
}

export async function sendWhatsAppVerifyCode(
  ctx: AuthContext,
  phoneE164: string,
  opts: { deps?: SendWhatsAppDeps; env?: NodeJS.ProcessEnv; now?: Date } = {},
): Promise<SendCodeOutcome> {
  const phone = phoneE164.trim();
  if (!isValidE164(phone)) return { status: 'invalid_phone' };
  if (!isWhatsAppCodeSetUp(opts.deps?.config, opts.env)) return { status: 'not_set_up' };
  const now = opts.now ?? new Date();
  const recent = await db
    .select({ id: whatsappVerifyCodes.id })
    .from(whatsappVerifyCodes)
    .where(and(eq(whatsappVerifyCodes.userId, ctx.userId), gt(whatsappVerifyCodes.createdAt, new Date(now.getTime() - 3_600_000))))
    .limit(MAX_SENDS_PER_HOUR);
  if (recent.length >= MAX_SENDS_PER_HOUR) return { status: 'too_many' };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const id = crypto.randomUUID();
  await db.insert(whatsappVerifyCodes).values({
    id,
    userId: ctx.userId,
    phoneE164: phone,
    codeHash: hashCode(id, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  const sent = await sendWhatsAppCode({ toPhone: phone, code, deps: opts.deps, env: opts.env });
  if (!sent.ok) {
    // A code that never left must not be guessable later.
    await db.update(whatsappVerifyCodes).set({ usedAt: now }).where(and(eq(whatsappVerifyCodes.id, id), eq(whatsappVerifyCodes.userId, ctx.userId)));
    return { status: sent.reason === 'not_set_up' ? 'not_set_up' : 'failed' };
  }
  return { status: 'sent' };
}

export async function checkWhatsAppVerifyCode(ctx: AuthContext, phoneE164: string, code: string, now = new Date()): Promise<CheckCodeOutcome> {
  const clean = code.replace(/\D/g, '');
  const [row] = await db
    .select()
    .from(whatsappVerifyCodes)
    .where(and(eq(whatsappVerifyCodes.userId, ctx.userId), eq(whatsappVerifyCodes.phoneE164, phoneE164.trim()), isNull(whatsappVerifyCodes.usedAt)))
    .orderBy(desc(whatsappVerifyCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= now.getTime()) return { status: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { status: 'locked' };
  if (clean.length !== 6 || !same(hashCode(row.id, clean), row.codeHash)) {
    await db
      .update(whatsappVerifyCodes)
      .set({ attempts: row.attempts + 1 })
      .where(and(eq(whatsappVerifyCodes.id, row.id), eq(whatsappVerifyCodes.userId, ctx.userId)));
    return { status: row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'wrong' };
  }
  await db.update(whatsappVerifyCodes).set({ usedAt: now }).where(and(eq(whatsappVerifyCodes.id, row.id), eq(whatsappVerifyCodes.userId, ctx.userId)));
  return { status: 'ok' };
}
