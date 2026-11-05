import 'server-only';

import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rateLimits } from '@/db/schema';

/**
 * RATE LIMITS — fixed-window attempt counters in Postgres (audit finding 2).
 *
 * The counters live in the database, not in process memory, so the limit holds across every
 * App Runner instance. Keys are built by the callers (`src/lib/sign-in-throttle.ts`, `src/lib/totp/guard.ts`) and carry
 * no data beyond an email address, an IP address or a user id.
 *
 * >>> ACCESS CONTROL <<<
 * A documented deviation from "every repository function takes an AuthContext": the only
 * callers are the sign-in path, which runs before anyone is signed in, and the two-step code
 * guard (`src/lib/totp/guard.ts`). The functions read and
 * write this table only.
 */

/**
 * Counts one hit on `key` and says whether it is still within `limit` hits per `windowMs`.
 * One upsert, so two instances counting the same key at once both see the true count.
 */
export async function systemTakeRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const resetAt = new Date(Date.now() + windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then excluded.reset_at else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });
  // About one call in a hundred sweeps expired rows so the table stays small.
  if (Math.random() < 0.01) await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date()));
  return (row?.count ?? 1) <= limit;
}

/** The hits counted on `key` in its current window, without counting one more. */
export async function systemPeekRateLimit(key: string): Promise<number> {
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), gt(rateLimits.resetAt, new Date())));
  return row?.count ?? 0;
}

/** Forgets the count on `key`, for example after a correct code. */
export async function systemClearRateLimit(key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
