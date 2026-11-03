import 'server-only';

import { and, inArray, isNull, lte, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceInstances, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import {
  listChecklistIndex,
  listEngagements,
  type EngagementListRow,
} from '@/db/repositories/engagements';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { adminProjectPath, internEngagementPath } from '@/lib/projects/project-step-path';
import { CERTIFICATE_OF_INCORPORATION_STEP_ID } from '@/lib/compliance/incorporation-state';
import {
  sortByAttention,
  summarizeEngagement,
  SUPER_FILING_HORIZON_DAYS,
  type SuperOverviewState,
} from '@/lib/super/super-overview';
import { dayOf, daysBetweenDays } from '@/components/super/insights/super-insights-model';
import type { PracticeIncorporationClient } from '@/lib/practice/practice-incorporation';

/**
 * PRACTICE · INCORPORATION FOR STAFF (rule R-51, D-29).
 *
 * The read behind `/app/{admin,manager,intern}/incorporation`: every client in the caller's own
 * engagement scope, summarised through the same gate-derived builder the super admin's
 * Practice · Incorporation uses, so phase, current step, owner and progress read the same.
 *
 * >>> ACCESS CONTROL <<<
 *   - Staff only (lead, manager, admin, super admin). A client or a developer is refused before
 *     the first query.
 *   - Engagements and checklist state come from `listEngagements(ctx)` and
 *     `listChecklistIndex(ctx)`, whose `scopeFor(ctx)` gives a lead their own clients, a manager
 *     their team's, and an admin every client. Nothing here widens that.
 *   - Names are read only for the lead and manager ids on the approved engagement rows, and the
 *     next filing date only for the approved engagement ids.
 *
 * Nothing here writes.
 */

/** Roles that may read the staff incorporation list. */
function isPracticeStaff(role: AuthContext['role']): boolean {
  return isAdminOrManager(role) || role === 'intern';
}

/** Where one engagement's incorporation detail opens for the caller's shell. */
function incorporationHrefFor(ctx: AuthContext, row: Pick<EngagementListRow, 'id' | 'slug'>): string {
  const target = { id: appEngagementId(row.id), slug: row.slug ?? undefined };
  if (ctx.role === 'intern') return internEngagementPath(target);
  return adminProjectPath(target, ctx.role === 'manager' ? '/app/manager' : '/app/admin');
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Display names for the lead (`intern_id`) and manager (profile id) keys on the approved rows. */
async function loadNames(rows: EngagementListRow[]) {
  const leadKeys = [...new Set(rows.map((r) => r.internId?.trim()).filter(Boolean) as string[])];
  const managerIds = [...new Set(rows.map((r) => r.managerId ?? r.adminId).filter(Boolean) as string[])];
  const byInternId = new Map<string, string>();
  const byProfileId = new Map<string, string>();
  if (leadKeys.length === 0 && managerIds.length === 0) return { byInternId, byProfileId };
  const conditions = [
    leadKeys.length ? inArray(profiles.internId, leadKeys) : undefined,
    managerIds.length ? inArray(profiles.id, managerIds) : undefined,
  ].filter(Boolean);
  const people = await db
    .select({ id: profiles.id, internId: profiles.internId, name: profiles.name, email: profiles.email })
    .from(profiles)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions));
  for (const p of people) {
    const name = p.name?.trim() || p.email;
    byProfileId.set(p.id, name);
    if (p.internId?.trim()) byInternId.set(p.internId.trim(), name);
  }
  return { byInternId, byProfileId };
}

/** The earliest open filing date per approved engagement (database id), up to the 90-day horizon. */
async function loadNextDue(scopedDbIds: string[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (scopedDbIds.length === 0) return out;
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + SUPER_FILING_HORIZON_DAYS);
  const rows = await db
    .select({ engagementId: complianceInstances.engagementId, dueDate: complianceInstances.dueDate })
    .from(complianceInstances)
    .where(
      and(
        inArray(complianceInstances.engagementId, scopedDbIds),
        lte(complianceInstances.dueDate, ymd(horizon)),
        ne(complianceInstances.status, 'filed'),
        isNull(complianceInstances.filedOn),
      ),
    );
  for (const row of rows) {
    const current = out.get(row.engagementId);
    if (!current || row.dueDate < current) out.set(row.engagementId, row.dueDate);
  }
  return out;
}

/** The certificate date: the engagement column first, then the date the COI step recorded. */
function certificateDateOf(row: EngagementListRow, state: SuperOverviewState): string | null {
  const column = dayOf(row.incorporationDate ?? null);
  if (column) return column;
  const coi = state[CERTIFICATE_OF_INCORPORATION_STEP_ID];
  const responses = (coi?.responses ?? {}) as Record<string, unknown>;
  const answered = typeof responses.dateOfIncorporation === 'string' ? responses.dateOfIncorporation : null;
  return dayOf(answered) ?? dayOf(coi?.completedOn ?? null);
}

/**
 * Every client in the caller's scope, with its incorporation summary. The view keeps the ones
 * not incorporated yet for the pipeline and the table, and the rest for the certificates list.
 */
export async function listPracticeIncorporation(
  ctx: AuthContext,
  now: Date = new Date(),
): Promise<PracticeIncorporationClient[]> {
  if (!isPracticeStaff(ctx.role)) {
    throw new Error('Only staff may read the incorporation list');
  }

  const [rows, checklistIndex] = await Promise.all([listEngagements(ctx), listChecklistIndex(ctx)]);
  if (rows.length === 0) return [];

  const scopedDbIds = rows.map((row) => row.id);
  const [names, nextDue] = await Promise.all([loadNames(rows), loadNextDue(scopedDbIds, now)]);

  const clients = rows.map((row) => {
    const appId = appEngagementId(row.id);
    const state = (checklistIndex[appId] ?? {}) as SuperOverviewState;
    const leadId = row.internId?.trim() || null;
    const managerId = row.managerId ?? row.adminId ?? null;
    const summary = {
      ...summarizeEngagement(
        {
          id: appId,
          slug: row.slug ?? null,
          companyName: row.companyName,
          clientName: row.clientName?.trim() || null,
          stage: row.stage,
          health: row.health,
          leadId,
          leadName: leadId ? (names.byInternId.get(leadId) ?? null) : null,
          managerId,
          managerName: managerId ? (names.byProfileId.get(managerId) ?? null) : null,
          incorporationDate: row.incorporationDate ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          state,
        },
        now,
      ),
      href: incorporationHrefFor(ctx, row),
    };
    const startedPreInc = row.stage === 'Pre-Incorporation';
    const certificateDate = summary.incorporated ? certificateDateOf(row, state) : null;
    const startDay = dayOf(summary.createdAt);
    const coiDays = startedPreInc && certificateDate && startDay ? daysBetweenDays(startDay, certificateDate) : null;
    return {
      summary,
      startedPreInc,
      certificateDate,
      daysToCoi: coiDays !== null && coiDays >= 0 ? coiDays : null,
      nextDueDate: nextDue.get(row.id) ?? null,
    } satisfies PracticeIncorporationClient;
  });

  const byId = new Map(clients.map((c) => [c.summary.id, c]));
  return sortByAttention(clients.map((c) => c.summary)).map((s) => byId.get(s.id)!);
}

