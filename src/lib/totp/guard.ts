import 'server-only';

import { systemClearRateLimit, systemPeekRateLimit, systemTakeRateLimit } from '@/db/repositories/rate-limits';

/**
 * Per-person limits on two-step codes (G-25).
 *
 * - Failed codes: ten wrong codes in ten minutes locks the code step for that
 *   person for the rest of the window. A wrong code is only reachable after the
 *   password was accepted, so this slows guessing without a lockout anyone can
 *   trigger from the email address alone. The count lives in the Postgres
 *   rate-limit store (migration 0042), so it holds across App Runner instances.
 * - Replays: a code whose step counter was already used for that person is
 *   refused, so a code read over someone's shoulder cannot be used twice. This
 *   one is kept in process memory per instance.
 */

const FAIL_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;

const failKey = (userId: string) => `totp-fail:${userId}`;
const lastCounter = new Map<string, number>();

export async function isTotpLocked(userId: string): Promise<boolean> {
  return (await systemPeekRateLimit(failKey(userId))) >= MAX_FAILS;
}

export async function recordTotpFailure(userId: string): Promise<void> {
  await systemTakeRateLimit(failKey(userId), MAX_FAILS, FAIL_WINDOW_MS);
}

/** Forgets this person's failed codes after a correct one. */
export async function clearTotpFailures(userId: string): Promise<void> {
  await systemClearRateLimit(failKey(userId));
}

/**
 * Records a matched step counter. Returns false when that counter (or a later
 * one) was already used by this person, which means the code is a replay.
 */
export function acceptTotpCounter(userId: string, counter: number): boolean {
  const prev = lastCounter.get(userId);
  if (prev !== undefined && counter <= prev) return false;
  lastCounter.set(userId, counter);
  return true;
}

/** Test helper: forget every used step counter. */
export function resetTotpGuard(): void {
  lastCounter.clear();
}
