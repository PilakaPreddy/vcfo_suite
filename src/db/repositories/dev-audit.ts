import 'server-only';
import { and, count, desc, eq, gte, inArray, like, lt, or, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditEvents } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { AuditPayload, AuditRow } from '@/lib/dev/types';
import { DEV_AUDIT_PREFIXES, DEV_AUDIT_RESULTS } from '@/lib/dev/audit-actions';
import { scrubText } from '@/lib/dev/mask';
import { assertDeveloper, isStaffRole } from './dev-scope';

/**
 * DEV AUDIT — system and access events from `audit_events` for the developer console (G-01).
 *
 * Access: developer or super admin only. Rows are limited to the action families in
 * `src/lib/dev/audit-actions.ts` plus any failed or denied result, so client work stays out.
 * A client actor shows as "Client" and every summary has emails, phones and PANs masked.
 * Paging is a keyset cursor on (created_at, id), newest first.
 */

export interface DevAuditCursor {
  createdAt: Date;
  id: string;
}

export function encodeAuditCursor(row: { createdAt: string; id: string }): string {
  return `${row.createdAt}~${row.id}`;
}

export function decodeAuditCursor(raw: string | null | undefined): DevAuditCursor | null {
  if (!raw) return null;
  const [iso, id] = raw.split('~');
  const createdAt = new Date(iso ?? '');
  if (!id || Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt, id };
}

/**
 * The short before and after values an event stored in its metadata (the console's own
 * write actions store them), scrubbed and cut to 120 characters. Other metadata stays out.
 */
function beforeAfter(meta: unknown): { before: string | null; after: string | null } {
  const m = (meta && typeof meta === 'object' ? meta : {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? scrubText(String(v)).slice(0, 120) : null);
  return { before: pick(m.before), after: pick(m.after) };
}

function scopeFilter(): SQL {
  return or(
    inArray(auditEvents.result, [...DEV_AUDIT_RESULTS]),
    ...DEV_AUDIT_PREFIXES.map((p) => like(auditEvents.action, `${p}%`)),
  ) as SQL;
}

export async function listAuditForDev(
  ctx: AuthContext,
  opts: { before?: DevAuditCursor | null; result?: 'ok' | 'failed' | 'denied'; days?: number; limit?: number } = {},
): Promise<AuditPayload> {
  assertDeveloper(ctx);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const conds: SQL[] = [scopeFilter()];
  if (opts.result) conds.push(eq(auditEvents.result, opts.result));
  if (opts.days) conds.push(gte(auditEvents.createdAt, new Date(Date.now() - Math.min(Math.max(opts.days, 1), 366) * 86400000)));
  if (opts.before) {
    conds.push(
      or(
        lt(auditEvents.createdAt, opts.before.createdAt),
        and(eq(auditEvents.createdAt, opts.before.createdAt), lt(auditEvents.id, opts.before.id)),
      ) as SQL,
    );
  }

  const rows = await db
    .select({
      id: auditEvents.id,
      createdAt: auditEvents.createdAt,
      actorRole: auditEvents.actorRole,
      actorName: auditEvents.actorName,
      actorEmail: auditEvents.actorEmail,
      action: auditEvents.action,
      summary: auditEvents.summary,
      result: auditEvents.result,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(and(...conds))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit);

  const events: AuditRow[] = rows.map((r) => {
    const staff = isStaffRole(String(r.actorRole));
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actor: staff ? r.actorName?.trim() || r.actorEmail?.split('@')[0] || 'Staff' : 'Client',
      role: String(r.actorRole),
      action: r.action,
      summary: scrubText(r.summary),
      result: r.result,
      ...beforeAfter(r.metadata),
    };
  });

  const last = events.at(-1);
  return { events, nextBefore: events.length === limit && last ? encodeAuditCursor(last) : null };
}

/** Failed and denied system or access events in the last `days` days, for the overview. */
export async function countAuditProblemsForDev(ctx: AuthContext, days = 7): Promise<{ failed: number; denied: number }> {
  assertDeveloper(ctx);
  const since = new Date(Date.now() - days * 86400000);
  const rows = await db
    .select({ result: auditEvents.result, n: count() })
    .from(auditEvents)
    .where(and(gte(auditEvents.createdAt, since), inArray(auditEvents.result, [...DEV_AUDIT_RESULTS])))
    .groupBy(auditEvents.result);
  const out = { failed: 0, denied: 0 };
  for (const r of rows) if (r.result === 'failed' || r.result === 'denied') out[r.result] = Number(r.n) || 0;
  return out;
}
