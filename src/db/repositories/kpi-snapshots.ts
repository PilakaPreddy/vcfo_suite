import 'server-only';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { kpiSnapshots, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { KPI_KEYS, type KpiKey } from '@/lib/metrics/analytics-kpis';

/**
 * KPI SNAPSHOTS (migration 0028, S-618): the Analytics tile values stored at each month end,
 * so the page can show the change against last month.
 *
 * Scope: a firm-wide admin sees the firm's numbers ('firm'); a manager or a project lead sees
 * the numbers of their own engagements, so their snapshot is stored under their profile id.
 * The job (`src/jobs/kpi-snapshots.ts`) computes each scope with that person's own role
 * scope, the same scope the Analytics page uses.
 *
 * >>> ACCESS CONTROL <<<
 *   read  — staff only. `getKpiSnapshot` reads exactly one scope, chosen from the caller's
 *           role: 'firm' for super admin and admin, the caller's own profile id for a
 *           manager or a lead. Nobody can name another scope. Clients and developers read
 *           nothing.
 *   write — `system*` helpers, called only by the Inngest job; they take no AuthContext.
 */

export type KpiValues = Partial<Record<KpiKey, number>>;

/** The one scope a caller may read, or null when the role reads none. */
function kpiScopeFor(ctx: AuthContext): string | null {
  if (isFirmWideAdmin(ctx.role)) return 'firm';
  if (ctx.role === 'manager' || ctx.role === 'intern') return ctx.userId;
  return null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The stored values of one month end for the caller's scope; empty when there is none. */
export async function getKpiSnapshot(ctx: AuthContext, period: string): Promise<KpiValues> {
  const scope = kpiScopeFor(ctx);
  if (!scope || !ISO.test(period)) return {};
  const rows = await db
    .select({ key: kpiSnapshots.key, value: kpiSnapshots.value })
    .from(kpiSnapshots)
    .where(and(eq(kpiSnapshots.period, period), eq(kpiSnapshots.scope, scope), inArray(kpiSnapshots.key, [...KPI_KEYS])));
  const out: KpiValues = {};
  for (const r of rows) {
    const n = Number(r.value);
    if (Number.isFinite(n)) out[r.key as KpiKey] = n;
  }
  return out;
}

export interface KpiSubject {
  scope: string;
  ctx: AuthContext;
}

/**
 * SYSTEM (Inngest only): the scopes to snapshot. 'firm' runs as the first firm-wide admin
 * profile; every manager and every lead with an intern id runs as themselves.
 */
export async function systemListKpiSubjects(): Promise<KpiSubject[]> {
  const rows = await db
    .select({ id: profiles.id, email: profiles.email, name: profiles.name, role: profiles.role, internId: profiles.internId })
    .from(profiles)
    .where(
      or(
        inArray(profiles.role, ['super_admin', 'admin', 'manager']),
        and(eq(profiles.role, 'intern'), isNotNull(profiles.internId)),
      ),
    );
  const out: KpiSubject[] = [];
  const firm = rows.find((r) => r.role === 'super_admin') ?? rows.find((r) => r.role === 'admin');
  const asCtx = (r: (typeof rows)[number]): AuthContext => ({
    userId: r.id,
    email: r.email,
    name: r.name ?? r.email,
    role: r.role,
    internId: r.internId ?? undefined,
  });
  if (firm) out.push({ scope: 'firm', ctx: asCtx(firm) });
  for (const r of rows) {
    if (r.role === 'manager' || r.role === 'intern') out.push({ scope: r.id, ctx: asCtx(r) });
  }
  return out;
}

/** SYSTEM (Inngest only): store one scope's values for a month end; a re-run overwrites. */
export async function systemSaveKpiSnapshot(period: string, scope: string, values: KpiValues): Promise<number> {
  if (!ISO.test(period)) throw new Error('invalid_period');
  const rows = Object.entries(values)
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
    .map(([key, v]) => ({ period, key, scope, value: String(v) }));
  if (rows.length === 0) return 0;
  await db
    .insert(kpiSnapshots)
    .values(rows)
    .onConflictDoUpdate({
      target: [kpiSnapshots.period, kpiSnapshots.key, kpiSnapshots.scope],
      set: { value: sql`excluded.value`, takenAt: new Date() },
    });
  return rows.length;
}
