import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { listDocumentRequests } from '@/db/repositories/document-requests';
import { listExpiryItems } from '@/db/repositories/expiry-items';
import { listNoticeCases } from '@/db/repositories/notice-cases';
import { listRequestLists } from '@/db/repositories/request-lists';
import { listTasks } from '@/db/repositories/tasks';
import { loadStaffData } from '@/lib/ask/tools/staff-data';
import { pendingApprovals, routeKey, type StaffData } from '@/lib/ask/tools/staff';
import { askProjectPath, LEAD_BASE, type AskLinkBase } from '@/lib/ask/resolve-href';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { expiriesHref } from '@/lib/expiries/alerts';
import { noticesHref } from '@/lib/notices/model';
import { adminProjectStepPath, internEngagementStepPath, staffProjectBase, type StaffPathBase } from '@/lib/projects/project-step-path';
import { bandForDate, daysBetween, istDay, rankMyDay, type MyDayItem, type RankedMyDayItem } from './rank';

/**
 * Gathers one staff member's "My day" items through the same scoped repositories their pages use,
 * so a lead sees only their clients, a manager only theirs, and an admin the firm. Every source is
 * read on its own and a refusal or failure leaves that source out (and is logged) instead of
 * failing the whole plan. Nothing here writes.
 */

const NEAR_DAYS = 7;
/** A sent request list with no movement for this many days counts as stalled. */
export const STALLED_LIST_DAYS = 5;

export interface GatherOptions {
  now?: Date;
  /** Staff data the caller already loaded (Ask VCFO keeps one per turn). */
  data?: StaffData;
}

/** The shell each role's links open in. Super admins use the admin project pages. */
export function myDayBase(role: string): AskLinkBase {
  if (role === 'intern') return LEAD_BASE;
  if (role === 'manager') return '/app/manager';
  if (role === 'super_admin') return '/app/super';
  return '/app/admin';
}

function shellSegment(role: string): string {
  return role === 'super_admin' ? 'super' : role === 'intern' ? 'intern' : role === 'manager' ? 'manager' : 'admin';
}

async function safe<T>(label: string, read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch (error) {
    console.warn(`[my-day] ${label} unavailable`, error);
    return [];
  }
}

/** Resolves a repository's engagement id (db uuid or app id) to the route key and company. */
function engagementLookup(data: StaffData) {
  const byAny = new Map<string, { key: string; company: string }>();
  for (const e of data.engagements) {
    const value = { key: routeKey(e), company: e.engagement.companyName };
    byAny.set(e.dbId, value);
    byAny.set(e.engagement.id, value);
  }
  return (id: string, fallbackCompany?: string) => byAny.get(id) ?? { key: id, company: fallbackCompany ?? 'Unknown client' };
}

const CLOSED_TASK = new Set(['completed', 'not-applicable']);

/** Loads every source for the caller and returns the ranked plan (all items; slice for display). */
export async function gatherMyDay(ctx: AuthContext, opts: GatherOptions = {}): Promise<RankedMyDayItem[]> {
  return rankMyDay(await gatherMyDayItems(ctx, opts));
}

/** The unranked items, exported for tests and for callers that merge their own. */
export async function gatherMyDayItems(ctx: AuthContext, opts: GatherOptions = {}): Promise<MyDayItem[]> {
  const now = opts.now ?? new Date();
  const today = istDay(now);
  const base = myDayBase(ctx.role);
  const lead = ctx.role === 'intern';
  const firmWide = isFirmWideAdmin(ctx.role);
  // A lead's project links use their own pages; this base serves the other roles.
  const staffBase: StaffPathBase = base === LEAD_BASE ? '/app/manager' : (base as StaffPathBase);
  const projectBase = staffProjectBase(staffBase);
  const seg = shellSegment(ctx.role);

  const data =
    opts.data ??
    (await loadStaffData(ctx, now).catch((error) => {
      console.warn('[my-day] staff data unavailable', error);
      return { engagements: [], filings: [], now } as StaffData;
    }));
  const lookup = engagementLookup(data);

  const [tasks, docRequests, expiries, notices, lists] = await Promise.all([
    safe('tasks', () => listTasks(ctx)),
    safe('document requests', () => listDocumentRequests(ctx)),
    safe('expiries', () => listExpiryItems(ctx, { withinDays: NEAR_DAYS })),
    safe('notices', () => listNoticeCases(ctx, { open: true })),
    safe('request lists', () => listRequestLists(ctx, { status: ['sent'] })),
  ]);

  const items: MyDayItem[] = [];
  const projectHref = (key: string) => askProjectPath(key, base);
  const stepHref = (key: string, stepId: string) =>
    lead ? internEngagementStepPath({ slug: key, id: key }, stepId) : adminProjectStepPath({ slug: key, id: key }, stepId, staffBase);

  // Filings: unfiled and due today or earlier.
  for (const f of data.filings) {
    if (f.filedOn || !f.dueDate || f.dueDate > today) continue;
    const e = lookup(f.engagementId, f.companyName);
    const late = daysBetween(f.dueDate, today);
    items.push({
      id: `filing:${f.id}`,
      kind: late > 0 ? 'overdue' : 'due_today',
      title: f.particular,
      detail: `${f.compliance}${f.periodLabel ? ` · ${f.periodLabel}` : ''}${late > 0 ? ` · ${late} day${late === 1 ? '' : 's'} late` : ''}`,
      engagementId: e.key,
      companyName: e.company,
      dueOn: f.dueDate,
      href: `${lead ? LEAD_BASE : projectBase}/compliances/filings`,
      weight: late,
    });
  }

  // Approvals and client submissions on checklist steps.
  for (const row of pendingApprovals(data)) {
    // A lead does not decide approvals; a client submission is a reply for them to review.
    if (lead && row.kind !== 'client_submit') continue;
    const kind = !lead && isAdminOrManager(ctx.role) ? 'approval' : 'client_reply';
    items.push({
      id: `step:${row.engagementId}:${row.stepId}`,
      kind,
      title: row.stepTitle,
      detail: kind === 'approval' ? 'Waiting on your decision' : 'Client submitted, review it',
      engagementId: row.engagementId,
      companyName: row.company,
      href: stepHref(row.engagementId, row.stepId),
      weight: row.daysWaiting ?? 0,
    });
  }

  // Tasks assigned to me; a lead also picks up unassigned tasks on their projects.
  for (const t of tasks) {
    if (CLOSED_TASK.has(t.status)) continue;
    const mine = t.assigneeId === ctx.userId || (lead && !t.assigneeId);
    if (!mine) continue;
    const e = lookup(t.engagementId);
    const dueOn = t.dueAt ? istDay(new Date(t.dueAt)) : undefined;
    const kind = bandForDate(dueOn, today, 'task');
    const idle = t.updatedAt ? Math.max(0, daysBetween(istDay(new Date(t.updatedAt)), today)) : 0;
    items.push({
      id: `task:${t.id}`,
      kind,
      title: t.title || getItem(t.checklistKey)?.title || 'Task',
      detail: t.assignedByName ? `From ${t.assignedByName}` : 'Task',
      engagementId: e.key,
      companyName: e.company,
      ...(dueOn ? { dueOn } : {}),
      href: lead ? `${LEAD_BASE}/tasks` : ctx.role === 'manager' ? '/app/manager/work' : projectHref(e.key),
      weight: kind === 'overdue' && dueOn ? daysBetween(dueOn, today) : idle,
    });
  }

  // Documents the client uploaded that wait for review.
  for (const r of docRequests) {
    if (r.status !== 'uploaded') continue;
    const e = lookup(r.engagementId);
    items.push({
      id: `docreq:${r.id}`,
      kind: 'client_reply',
      title: r.label,
      detail: 'Client uploaded, review it',
      engagementId: e.key,
      companyName: e.company,
      href: lead ? `${LEAD_BASE}/requests` : projectHref(e.key),
      weight: r.uploadedAt ? Math.max(0, daysBetween(istDay(new Date(r.uploadedAt)), today)) : 0,
    });
  }

  // Registrations, licences and signatures expiring within a week (or already lapsed).
  for (const x of expiries) {
    if (x.renewedAt) continue;
    const e = lookup(x.engagementId, x.companyName);
    const kind = x.daysLeft < 0 ? 'overdue' : x.daysLeft === 0 ? 'due_today' : 'expiry';
    items.push({
      id: `expiry:${x.id}`,
      kind,
      title: `${x.kindLabel}: ${x.subjectName}`,
      detail: x.daysLeft < 0 ? `Expired ${-x.daysLeft} day${x.daysLeft === -1 ? '' : 's'} ago` : `Expires in ${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'}`,
      engagementId: e.key,
      companyName: e.company,
      dueOn: x.expiresOn,
      href: expiriesHref(ctx.role),
      weight: kind === 'overdue' ? -x.daysLeft : NEAR_DAYS - x.daysLeft,
    });
  }

  // Open notices with a reply due within a week. An admin sees the ones they own or nobody owns.
  for (const n of notices) {
    if (!n.open || n.daysLeft === null || n.daysLeft > NEAR_DAYS) continue;
    if (firmWide && n.ownerId && n.ownerId !== ctx.userId) continue;
    const e = lookup(n.engagementId, n.companyName);
    const kind = n.daysLeft < 0 ? 'overdue' : n.daysLeft === 0 ? 'due_today' : 'notice';
    items.push({
      id: `notice:${n.id}`,
      kind,
      title: n.label,
      detail: n.daysLeft < 0 ? `Reply ${-n.daysLeft} day${n.daysLeft === -1 ? '' : 's'} late` : `Reply due in ${n.daysLeft} day${n.daysLeft === 1 ? '' : 's'}`,
      engagementId: e.key,
      companyName: e.company,
      ...(n.responseDueOn ? { dueOn: n.responseDueOn } : {}),
      href: noticesHref(ctx.role),
      weight: kind === 'overdue' ? -n.daysLeft : NEAR_DAYS - n.daysLeft,
    });
  }

  // Client request lists that were sent and have stalled.
  for (const l of lists) {
    const idle = stalledDays(l, today);
    if (idle === null) continue;
    const e = lookup(l.engagementId, l.companyName);
    items.push({
      id: `reqlist:${l.id}`,
      kind: 'request_list',
      title: l.title,
      detail: `${l.progress.done} of ${l.progress.total} received · ${idle} day${idle === 1 ? '' : 's'} quiet`,
      engagementId: e.key,
      companyName: e.company,
      ...(l.dueOn ? { dueOn: l.dueOn } : {}),
      href: `/app/${seg}/requests`,
      weight: idle,
    });
  }

  return items;
}

/**
 * Days a sent request list has been quiet when it counts as stalled, else null. Stalled means not
 * fully received and either past its due date or with no reminder or send for `STALLED_LIST_DAYS`.
 */
export function stalledDays(
  l: { status: string; dueOn: string | null; lastRemindedAt: string | null; firstSentAt: string | null; progress: { percent: number } },
  today: string,
): number | null {
  if (l.status !== 'sent' || l.progress.percent >= 100) return null;
  const lastMove = l.lastRemindedAt ?? l.firstSentAt;
  const idle = lastMove ? Math.max(0, daysBetween(istDay(new Date(lastMove)), today)) : 0;
  const pastDue = l.dueOn ? daysBetween(l.dueOn, today) > 0 : false;
  if (!pastDue && idle < STALLED_LIST_DAYS) return null;
  return idle;
}
