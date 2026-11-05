import 'server-only';

import { systemTakeRateLimit } from '@/db/repositories/rate-limits';

/** Attempts allowed per email address in one window. */
const PER_EMAIL = 10;
/** Attempts allowed per client IP in one window; an office shares one address. */
const PER_IP = 50;
const WINDOW_MS = 15 * 60_000;

/**
 * Counts one sign-in attempt for this email and this IP and says whether both are within the
 * limit (audit finding 2). `scope` keeps the two-step pre-check and the real sign-in on
 * separate counters, because one real sign-in calls both. It is checked before the bcrypt
 * compare, so a flood of guesses costs one small query each, not 100 ms of CPU.
 */
export async function takeSignInAttempt(scope: 'sign-in' | 'two-step', email: string, ip: string): Promise<boolean> {
  const key = email.trim().toLowerCase();
  const [emailOk, ipOk] = await Promise.all([
    systemTakeRateLimit(`${scope}:email:${key}`, PER_EMAIL, WINDOW_MS),
    systemTakeRateLimit(`${scope}:ip:${ip}`, PER_IP, WINDOW_MS),
  ]);
  return emailOk && ipOk;
}
