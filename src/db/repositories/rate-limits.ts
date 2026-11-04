import 'server-only';

import { lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { rateLimits } from '@/db/schema';

/**
 * RATE LIMITS — fixed-window attempt counters in Postgres (audit finding 2).
 *
 * The counters live in the database, not in process memory, so the limit holds across every
 * App Runner instance. Keys are built by the caller (`src/lib/sign-in-throttle.ts`) and carry
 * no data beyond an email address or an IP address.
 *
 * >>> ACCESS CONTROL <<<
 * A documented deviation from "every repository function takes an AuthContext": the only
 * caller is the sign-in path, which runs before anyone is signed in. The functions read and
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
