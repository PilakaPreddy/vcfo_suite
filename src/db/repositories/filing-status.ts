import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceInstances } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { recordFilingEvent } from '@/db/repositories/filing-events';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { isAdminOrManager } from '@/lib/auth';

/**
 * FILING STATUS — staff mark a compliance filing filed, or reopen it.
 *
 * Before this there was no write path for `compliance_instances.filed_on`, so the
 * Filings bulk bar and the task drawer could not finish a filing.
 *
 * ACCESS:
 *   - mark filed: admin, super admin, a manager on an owned engagement, a lead on an
 *     assigned engagement (the same set that works the filing). Clients never mark
 *     a filing filed; their proof upload leaves the decision to staff.
 *   - reopen: admin, super admin or a manager on an owned engagement.
 *   - an instance on an engagement outside the caller's scope reads as not found.
 * Every change writes an audit event with the old and new state.
 */

export class FilingStatusError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
  ) {
    super(message);
  }
}

type FiledRow = { id: string; status: string; filedOn: string | null };

async function loadScoped(ctx: AuthContext, instanceId: string) {
  if (ctx.role === 'client' || ctx.role === 'developer' || ctx.role === 'partner') {
    throw new FilingStatusError('Only firm staff can change a filing', 403);
  }
  const [row] = await db
    .select({
      id: complianceInstances.id,
      engagementId: complianceInstances.engagementId,
      status: complianceInstances.status,
      filedOn: complianceInstances.filedOn,
      filedNote: complianceInstances.filedNote,
      dueDate: complianceInstances.dueDate,
    })
    .from(complianceInstances)
    .where(eq(complianceInstances.id, instanceId))
    .limit(1);
  if (!row) throw new FilingStatusError('Filing not found', 404);
  const access = await assertEngagementAccess(ctx, row.engagementId);
  if (!access.ok) throw new FilingStatusError('Filing not found', 404);
  return row;
}

/** Today in India time as YYYY-MM-DD, the firm's calendar day. */
function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

export async function markFilingFiled(
  ctx: AuthContext,
  instanceId: string,
  input: { filedOn?: string; note?: string | null } = {},
): Promise<FiledRow> {
  const row = await loadScoped(ctx, instanceId);
  if (row.status === 'filed' && row.filedOn) throw new FilingStatusError('Already filed', 409);
  const filedOn = input.filedOn ?? todayIst();
  if (filedOn > todayIst()) throw new FilingStatusError('The filed date cannot be in the future', 400);

  const [updated] = await db
    .update(complianceInstances)
    .set({ status: 'filed', filedOn, filedNote: input.note?.trim() || row.filedNote })
    .where(eq(complianceInstances.id, instanceId))
    .returning({ id: complianceInstances.id, status: complianceInstances.status, filedOn: complianceInstances.filedOn });

  void recordAuditEvent(ctx, {
    engagementId: row.engagementId,
    action: 'compliance.filed',
    summary: `Filing marked filed on ${filedOn}`,
    metadata: { instanceId, filedOn, dueDate: row.dueDate, from: row.status, onTime: filedOn <= row.dueDate },
  });
  void recordFilingEvent(ctx, { instanceId, side: 'sbc', label: filedOn <= row.dueDate ? 'Filed' : 'Filed late' });
  return updated!;
}

export async function reopenFiling(ctx: AuthContext, instanceId: string): Promise<FiledRow> {
  const row = await loadScoped(ctx, instanceId);
  if (!isAdminOrManager(ctx.role)) throw new FilingStatusError('Only a manager or admin can reopen a filing', 403);
  if (row.status !== 'filed' && !row.filedOn) throw new FilingStatusError('The filing is not filed', 409);
  const status = row.dueDate < todayIst() ? 'overdue' : 'in-progress';

  const [updated] = await db
    .update(complianceInstances)
    .set({ status, filedOn: null })
    .where(eq(complianceInstances.id, instanceId))
    .returning({ id: complianceInstances.id, status: complianceInstances.status, filedOn: complianceInstances.filedOn });

  void recordAuditEvent(ctx, {
    engagementId: row.engagementId,
    action: 'compliance.reopened',
    summary: 'Filing reopened',
    metadata: { instanceId, previousFiledOn: row.filedOn, to: status },
  });
  void recordFilingEvent(ctx, { instanceId, side: 'sbc', label: 'Filing reopened' });
  return updated!;
}
