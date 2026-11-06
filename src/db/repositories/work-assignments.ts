import 'server-only';
import { and, eq, ne, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagementLeads, engagements, profiles, tasks } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import type { TaskInstance } from '@/data/engagements';
import { getItem } from '@/data/checklist';
import { assertEngagementAccess, patchChecklistItem } from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { addEngagementLead, replaceEngagementLead } from '@/db/repositories/engagement-leads';
import { toAppTask } from '@/db/repositories/tasks';
import { isAdminOrManager } from '@/lib/auth';
import { appEngagementId, engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isUuid } from '@/lib/slug';
import { parseItemKey } from '@/lib/work/item-key';
import { queueIndexRefresh } from '@/lib/ask/index-cards/queue';

/**
 * WORK ASSIGNMENTS (G-12, G-18): a manager assigns a task to a lead, and an admin or manager
 * moves a step, a task or a whole client to another lead.
 *
 * >>> ACCESS CONTROL <<<
 *   super_admin / admin / manager only (`isAdminOrManager`); leads and clients are refused
 *   before the first query. The engagement must be in the caller's scope
 *   (`assertEngagementAccess`) and every write goes against `access.dbId`.
 *   The lead picked must already be on the engagement (primary lead or `engagement_leads`),
 *   except for a step reassign, which adds the new lead to the engagement first through
 *   `addEngagementLead`, so the step stays visible to them.
 *
 * Writes reuse the existing assignment repositories: `replaceEngagementLead` for a whole
 * client, `patchChecklistItem` (`assigneeId`) for a step, and the `tasks.assigned_to` column
 * for a task.
 */

export class AssignmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

function refuseNonManagers(ctx: AuthContext) {
  if (!isAdminOrManager(ctx.role)) throw new AssignmentError('Not permitted', 403);
}

async function engagementOrThrow(ctx: AuthContext, engagementId: string) {
  const access = await assertEngagementAccess(ctx, engagementId);
  if (!access.ok) throw new AssignmentError('Engagement not found or not permitted', 404);
  return access;
}

export interface LeadProfile {
  profileId: string;
  /** The `intern_id` scoping key (falls back to the profile id on rows without one). */
  leadKey: string;
  name: string;
  email: string;
}

/** An active project lead by profile id or `intern_id` key, or null. */
async function findLead(key: string): Promise<LeadProfile | null> {
  const k = key.trim();
  if (!k) return null;
  const match = isUuid(k) ? or(eq(profiles.id, k), eq(profiles.internId, k)) : eq(profiles.internId, k);
  const [row] = await db
    .select({ id: profiles.id, internId: profiles.internId, name: profiles.name, email: profiles.email, status: profiles.status })
    .from(profiles)
    .where(and(eq(profiles.role, 'intern'), match))
    .limit(1);
  if (!row || row.status !== 'active') return null;
  return {
    profileId: row.id,
    leadKey: row.internId?.trim() || row.id,
    name: row.name?.trim() || row.email.split('@')[0] || 'Project lead',
    email: row.email,
  };
}

/** Lead keys on one engagement: the primary `intern_id` and every `engagement_leads` row. */
async function leadKeysOn(engagementDbIdValue: string, primary: string | null): Promise<Set<string>> {
  const rows = await db
    .select({ internId: engagementLeads.internId })
    .from(engagementLeads)
    .where(eq(engagementLeads.engagementId, engagementDbIdValue));
  const keys = new Set(rows.map((r) => r.internId));
  if (primary?.trim()) keys.add(primary.trim());
  return keys;
}

function onEngagement(lead: LeadProfile, keys: Set<string>): boolean {
  return keys.has(lead.leadKey) || keys.has(lead.profileId);
}

/* ------------------------------------------------------------------ *
 * G-12: assign a task
 * ------------------------------------------------------------------ */

export interface AssignLeadTaskInput {
  engagementId: string;
  /** Lead profile id or `intern_id` key. */
  leadId: string;
  title: string;
  description?: string | null;
  /** ISO date or date-time. */
  deadline?: string | null;
}

/**
 * A manager gives one of the engagement's leads a task. The row has no checklist key, so it
 * shows in the lead's Work list as a task item (`buildInternWorkItems`).
 */
export async function assignLeadTask(
  ctx: AuthContext,
  input: AssignLeadTaskInput,
): Promise<{ task: TaskInstance; lead: LeadProfile; companyName: string; engagementDbId: string }> {
  refuseNonManagers(ctx);
  const title = input.title.trim();
  if (!title) throw new AssignmentError('Title is required', 400);
  const access = await engagementOrThrow(ctx, input.engagementId);

  const lead = await findLead(input.leadId);
  if (!lead) throw new AssignmentError('Project lead not found', 404);
  const keys = await leadKeysOn(access.dbId, access.row.internId);
  if (!onEngagement(lead, keys)) throw new AssignmentError('That lead is not on this engagement', 400);

  const [row] = await db
    .insert(tasks)
    .values({
      engagementId: access.dbId,
      assignedTo: lead.profileId,
      // Who assigned it (migration 0028): the Work drawer's "Assigned by".
      assignedBy: ctx.userId,
      title,
      description: input.description?.trim() || null,
      stepId: null,
      deadline: input.deadline ? new Date(input.deadline) : null,
      status: 'open',
    })
    .returning();
  if (!row) throw new Error('Could not create the task');
  queueIndexRefresh('task', row.id);
  return { task: toAppTask(row), lead, companyName: access.row.companyName, engagementDbId: access.dbId };
}

/* ------------------------------------------------------------------ *
 * G-18: reassign
 * ------------------------------------------------------------------ */

export type ReassignInput =
  | { kind: 'item'; engagementId: string; itemKey: string; toLeadId: string }
  | { kind: 'lead'; engagementId: string; fromLeadId: string; toLeadId: string };

export interface ReassignResult {
  kind: 'task' | 'step' | 'lead';
  engagementId: string;
  engagementDbId: string;
  companyName: string;
  /** What moved, in words, for the audit summary and the toast. */
  label: string;
  to: LeadProfile;
}

/**
 * Moves a task or a step (`kind: 'item'`), or every piece of a client's work from one lead
 * to another (`kind: 'lead'`). Filings have no owner write in the repositories yet, so a
 * filing key is refused with 400.
 */
export async function reassignWork(ctx: AuthContext, input: ReassignInput): Promise<ReassignResult> {
  refuseNonManagers(ctx);
  const access = await engagementOrThrow(ctx, input.engagementId);
  const to = await findLead(input.toLeadId);
  if (!to) throw new AssignmentError('Project lead not found', 404);
  const base = {
    engagementId: appEngagementId(access.dbId),
    engagementDbId: access.dbId,
    companyName: access.row.companyName,
    to,
  };

  if (input.kind === 'lead') {
    const from = await findLead(input.fromLeadId);
    if (!from) throw new AssignmentError('Project lead not found', 404);
    const keys = await leadKeysOn(access.dbId, access.row.internId);
    if (!onEngagement(from, keys)) throw new AssignmentError('That lead is not on this engagement', 400);
    await replaceEngagementLead(ctx, access.dbId, from.leadKey, to.leadKey);
    return { ...base, kind: 'lead', label: `${access.row.companyName} from ${from.name}` };
  }

  const ref = parseItemKey(input.itemKey);
  if (!ref) throw new AssignmentError('Invalid item key', 400);

  if (ref.kind === 'task') {
    if (!isUuid(ref.id)) throw new AssignmentError('Invalid item key', 400);
    const [row] = await db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.id, ref.id), eq(tasks.engagementId, access.dbId)))
      .limit(1);
    if (!row) throw new AssignmentError('Task not found', 404);
    const keys = await leadKeysOn(access.dbId, access.row.internId);
    if (!onEngagement(to, keys)) throw new AssignmentError('That lead is not on this engagement', 400);
    await db
      .update(tasks)
      .set({ assignedTo: to.profileId, assignedBy: ctx.userId, updatedAt: new Date() })
      .where(and(eq(tasks.id, row.id), eq(tasks.engagementId, access.dbId)));
    return { ...base, kind: 'task', label: row.title };
  }

  if (ref.kind === 'step') {
    if (engagementDbId(ref.engagementId) !== access.dbId) throw new AssignmentError('Invalid item key', 400);
    const def = getItem(ref.stepId);
    if (!def) throw new AssignmentError('Invalid item key', 400);
    // The new owner must be able to open the step, so they join the engagement if needed.
    await addEngagementLead(ctx, access.dbId, to.leadKey);
    await patchChecklistItem(ctx, appEngagementId(access.dbId), def.id, { assigneeId: to.leadKey });
    return { ...base, kind: 'step', label: def.title };
  }

  throw new AssignmentError('Only steps, tasks and whole clients can be reassigned', 400);
}

/* ------------------------------------------------------------------ *
 * S-364: remove a lead — move their open work to another lead
 * ------------------------------------------------------------------ */

export interface RemoveLeadResult {
  from: LeadProfile;
  to: LeadProfile;
  /** Clients moved (app engagement ids and names). */
  clients: Array<{ engagementId: string; companyName: string }>;
  steps: number;
  tasks: number;
}

/**
 * Remove a project lead from every client the caller manages: on each one the lead is replaced
 * by `toLeadId` (`replaceEngagementLead`, which also hands over the primary seat), every step
 * reassigned to the lead moves to the new lead, and the lead's open tasks move too
 * (`assigned_by` = the caller). Managers touch only engagements they manage
 * (`assertEngagementAccess` per engagement); admins every engagement. One audit event per
 * client. The lead's account stays; People deletes accounts.
 */
export async function removeLead(
  ctx: AuthContext,
  input: { fromLeadId: string; toLeadId: string },
): Promise<RemoveLeadResult> {
  refuseNonManagers(ctx);
  const from = await findLead(input.fromLeadId);
  const to = await findLead(input.toLeadId);
  if (!from || !to) throw new AssignmentError('Project lead not found', 404);
  if (from.profileId === to.profileId) throw new AssignmentError('Pick another project lead', 400);

  const primary = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(eq(engagements.internId, from.leadKey));
  const co = await db
    .select({ id: engagementLeads.engagementId })
    .from(engagementLeads)
    .where(eq(engagementLeads.internId, from.leadKey));
  const ids = [...new Set([...primary, ...co].map((r) => r.id))];

  const result: RemoveLeadResult = { from, to, clients: [], steps: 0, tasks: 0 };
  for (const id of ids) {
    const access = await assertEngagementAccess(ctx, id);
    if (!access.ok) continue;
    const appId = appEngagementId(access.dbId);
    const state = (access.row.checklistState ?? {}) as Record<string, { assigneeId?: string | null } | undefined>;
    for (const [stepId, slice] of Object.entries(state)) {
      if (slice?.assigneeId?.trim() !== from.leadKey || !getItem(stepId)) continue;
      await patchChecklistItem(ctx, appId, stepId, { assigneeId: to.leadKey });
      result.steps += 1;
    }
    await replaceEngagementLead(ctx, access.dbId, from.leadKey, to.leadKey);
    const moved = await db
      .update(tasks)
      .set({ assignedTo: to.profileId, assignedBy: ctx.userId, updatedAt: new Date() })
      .where(and(eq(tasks.engagementId, access.dbId), eq(tasks.assignedTo, from.profileId), ne(tasks.status, 'done')))
      .returning({ id: tasks.id });
    result.tasks += moved.length;
    result.clients.push({ engagementId: appId, companyName: access.row.companyName });
    await recordAuditEvent(ctx, {
      engagementId: access.dbId,
      action: 'work.lead_removed',
      summary: `Removed ${from.name} as project lead; open work moved to ${to.name}`,
      metadata: { fromLeadProfileId: from.profileId, toLeadProfileId: to.profileId, tasks: moved.length },
    });
  }
  if (result.clients.length === 0) throw new AssignmentError('This lead is on none of your clients', 404);
  return result;
}

