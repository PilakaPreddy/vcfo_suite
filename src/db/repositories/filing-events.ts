import 'server-only';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceInstances, filingEvents, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isFirmWideAdmin } from '@/lib/auth';
import { assertEngagementAccess, listScopedEngagementIds } from '@/db/repositories/engagements';

/**
 * FILING EVENTS (migration 0028, S-771): the dated two-sided thread of one filing period on
 * the staff obligation record. The client side holds what the client did (a proof upload, a
 * window move from the portal); the SBC side holds what the firm did (window set, proof
 * uploaded, filed, reopened).
 *
 * >>> ACCESS CONTROL (Path A, as compliance_instances) <<<
 *   write — the caller must reach the instance's engagement (`assertEngagementAccess`); the
 *           write paths that call this have already checked their own role rule, and a
 *           foreign instance writes nothing.
 *   read  — firm-wide admins read every instance; managers, leads and clients read the
 *           instances of the engagements in their scope (`listScopedEngagementIds`).
 *           Developers read nothing. A foreign instance id reads as no events.
 * An event write never fails the action that caused it: errors are logged and dropped.
 */

export type FilingEventSide = 'client' | 'sbc';

export interface FilingEvent {
  id: string;
  instanceId: string;
  side: FilingEventSide;
  label: string;
  actorName: string | null;
  at: string;
}

/** Record one event on a filing. Called after the write it describes has succeeded. */
export async function recordFilingEvent(
  ctx: AuthContext,
  input: { instanceId: string; side: FilingEventSide; label: string },
): Promise<void> {
  try {
    if (ctx.role === 'developer' || ctx.role === 'partner') return;
    const [row] = await db
      .select({ id: complianceInstances.id, engagementId: complianceInstances.engagementId })
      .from(complianceInstances)
      .where(eq(complianceInstances.id, input.instanceId))
      .limit(1);
    if (!row) return;
    const access = await assertEngagementAccess(ctx, row.engagementId);
    if (!access.ok) return;
    await db.insert(filingEvents).values({
      instanceId: row.id,
      side: input.side,
      label: input.label.slice(0, 200),
      actorId: ctx.userId,
    });
  } catch (err) {
    console.error('[filing-events] could not record an event', err);
  }
}

/** The events of the given filings, oldest first, limited to the caller's scope. */
export async function listFilingEvents(ctx: AuthContext, instanceIds: string[]): Promise<FilingEvent[]> {
  if (ctx.role === 'developer' || ctx.role === 'partner') return [];
  const ids = [...new Set(instanceIds)].filter(Boolean).slice(0, 200);
  if (ids.length === 0) return [];

  let allowed = ids;
  if (!isFirmWideAdmin(ctx.role)) {
    const scoped = await listScopedEngagementIds(ctx);
    if (scoped.length === 0) return [];
    const rows = await db
      .select({ id: complianceInstances.id, engagementId: complianceInstances.engagementId })
      .from(complianceInstances)
      .where(inArray(complianceInstances.id, ids));
    const inScope = new Set(scoped);
    allowed = rows.filter((r) => inScope.has(r.engagementId)).map((r) => r.id);
    if (allowed.length === 0) return [];
  }

  const rows = await db
    .select({
      id: filingEvents.id,
      instanceId: filingEvents.instanceId,
      side: filingEvents.side,
      label: filingEvents.label,
      actorName: profiles.name,
      at: filingEvents.at,
    })
    .from(filingEvents)
    .leftJoin(profiles, eq(profiles.id, filingEvents.actorId))
    .where(inArray(filingEvents.instanceId, allowed))
    .orderBy(asc(filingEvents.at));

  return rows.map((r) => ({
    id: r.id,
    instanceId: r.instanceId,
    side: r.side === 'client' ? 'client' : 'sbc',
    label: r.label,
    actorName: r.actorName ?? null,
    at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
  }));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The event label of a window change, in plain dates ("Working window 9 Oct to 14 Oct"). */
export function windowEventLabel(window: { from: string; to: string } | null, who: 'sbc' | 'client'): string {
  if (!window) return who === 'client' ? 'Planning window reset' : 'Working window cleared';
  const day = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${MON[(m ?? 1) - 1]}`;
  };
  return `${who === 'client' ? 'Planning window' : 'Working window'} ${day(window.from)} to ${day(window.to)}`;
}
