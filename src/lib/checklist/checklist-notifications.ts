import { getItem } from '@/data/checklist';
import type { Role } from '@/lib/auth';
import type { EngagementChecklistState } from '@/lib/projects/engagements-db';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import {
  adminProjectStepPath,
  clientBoardResolutionPath,
  internBoardResolutionPath,
  internEngagementPath,
  internEngagementStepPath,
} from '@/lib/projects/project-step-path';
import type { Engagement } from '@/data/engagements';
import { directFlowRoleLabel, isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';

const NOTIFICATION_KINDS = [
  'checklist.deliver',
  'checklist.submit',
  'checklist.review',
  'checklist.unlock',
  'docs.share',
  'request.created',
  'request.uploaded',
  /** A client wrote to the lead (G-09, G-11). */
  'message.received',
  /** A date change request on a manager-set window, or its decision (G-17). */
  'schedule.window',
  /** One of the six compliance reminders (COMPLIANCE-MODEL 3.4), statutory or non-statutory. */
  'compliance.reminder',
  /** A non-statutory task was assigned, submitted, approved, sent back or commented on. */
  'compliance.task',
  /** A board meeting notice, reply, MoM or resolution needs someone (board-meetings). */
  'board.meeting',
  /** A budget tab, publish, approval or overspend needs someone (budgets). */
  'budget.update',
  'team.assigned',
  'team.removed',
  'email.sent',
  'email.skipped',
  'email.failed',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const NOTIFICATION_KIND_SET: ReadonlySet<string> = new Set(NOTIFICATION_KINDS);

export function isNotificationKind(value: unknown): value is NotificationKind {
  return typeof value === 'string' && NOTIFICATION_KIND_SET.has(value);
}

/** Outbound email confirmations vs inbound process updates. */
export type NotificationDirection = 'sent' | 'received';

export function notificationDirection(kind: NotificationKind): NotificationDirection {
  if (kind === 'email.sent' || kind === 'email.skipped' || kind === 'email.failed') {
    return 'sent';
  }
  return 'received';
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  engagementId: string;
  companyName: string;
  itemId?: string;
  href: string;
  createdAt: string;
  read: boolean;
  /** ISO time when cleared from the bell inbox; null/absent = still in inbox. */
  dismissedAt?: string | null;
  /** Who caused it (C-759): the person's profile id and name; absent for system notices. */
  actorId?: string;
  actorName?: string;
}

export type NotificationDraft = Omit<AppNotification, 'id' | 'read' | 'createdAt'>;

export function notificationsInDirection(
  items: AppNotification[],
  direction: NotificationDirection,
): AppNotification[] {
  return items.filter((n) => notificationDirection(n.kind) === direction);
}

function itemTitle(itemId: string): string {
  return getItem(itemId)?.title ?? itemId;
}

function notificationHref(
  role: Role,
  engagement: Pick<Engagement, 'id' | 'slug'>,
  itemId: string,
  kind: NotificationKind,
): string {
  if (role === 'client') {
    if (itemId === 'pre-2' || itemId === 'pre-3') return clientBoardResolutionPath();
    return '/app/client/incorporation';
  }
  if (role === 'intern') {
    if (kind === 'request.uploaded' || kind === 'request.created') {
      return internEngagementPath(engagement);
    }
    if (itemId === 'pre-2' || itemId === 'pre-3') return internBoardResolutionPath(engagement);
    return internEngagementStepPath(engagement, itemId);
  }
  return adminProjectStepPath(engagement, itemId, role);
}

function sharedDocsGrew(
  prev?: ChecklistItemStateSlice,
  next?: ChecklistItemStateSlice,
): boolean {
  const prevLen = prev?.sharedIncorpDraftDocs?.length ?? 0;
  const nextLen = next?.sharedIncorpDraftDocs?.length ?? 0;
  return nextLen > prevLen;
}

export function diffChecklistForNotifications(
  prev: EngagementChecklistState | undefined,
  next: EngagementChecklistState,
  ctx: {
    engagement: Pick<Engagement, 'id' | 'slug' | 'companyName'>;
    viewerRole: Role;
    viewerUserId: string;
  },
): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const itemIds = new Set([
    ...Object.keys(prev ?? {}),
    ...Object.keys(next),
  ]);

  for (const itemId of itemIds) {
    const prevItem = prev?.[itemId];
    const nextItem = next[itemId];
    if (!nextItem) continue;

    const engagementId = ctx.engagement.id;
    const companyName = ctx.engagement.companyName;
    const title = itemTitle(itemId);
    const href = notificationHref(ctx.viewerRole, ctx.engagement, itemId, 'checklist.deliver');

    // Pre-incorporation direct flow: a submit is one event for everyone
    // ("{step} submitted"), not a delivery, a review request or an accept.
    const directFlow = isDirectFlowStep(itemId);
    if (directFlow) {
      const submittedNow =
        !prevItem?.clientSubmittedAt?.trim() &&
        Boolean(nextItem.clientSubmittedAt?.trim()) &&
        nextItem.reviewedBy !== ctx.viewerUserId;
      if (submittedNow) {
        const who = nextItem.submittedByName?.trim();
        out.push({
          kind: 'checklist.submit',
          title: `${title} submitted`,
          body: who
            ? `${who} (${directFlowRoleLabel(nextItem.submittedByRole)}) submitted this step for ${companyName}.`
            : `This step was submitted for ${companyName}.`,
          engagementId,
          companyName,
          itemId,
          href: notificationHref(ctx.viewerRole, ctx.engagement, itemId, 'checklist.submit'),
        });
      }
    }

    if (
      !directFlow &&
      ctx.viewerRole === 'client' &&
      !prevItem?.deliveredToClientAt?.trim() &&
      nextItem.deliveredToClientAt?.trim()
    ) {
      const isBoardResolution = itemId === 'pre-2';
      out.push({
        kind: 'checklist.deliver',
        title: isBoardResolution ? 'Board resolution ready' : 'New from your VCFO team',
        body: isBoardResolution
          ? 'The board resolution is ready to download and sign.'
          : `${title} is ready on your portal.`,
        engagementId,
        companyName,
        itemId,
        href,
      });
    }

    if (ctx.viewerRole === 'client') {
      const bulkShared =
        !prevItem?.incorpDraftsSharedAt?.trim() && Boolean(nextItem.incorpDraftsSharedAt?.trim());
      const partialShare = sharedDocsGrew(prevItem, nextItem) && !bulkShared;
      if (bulkShared || partialShare) {
        out.push({
          kind: 'docs.share',
          title: bulkShared ? 'Incorporation drafts shared' : 'New draft available',
          body: bulkShared
            ? 'All draft incorporation forms are on your portal for download and upload.'
            : `A new incorporation draft for ${title} is available to download.`,
          engagementId,
          companyName,
          itemId,
          href: '/app/client/incorporation',
        });
      }
    }

    if (
      !directFlow &&
      (ctx.viewerRole === 'admin' ||
        ctx.viewerRole === 'manager' ||
        ctx.viewerRole === 'intern') &&
      !prevItem?.clientSubmittedAt?.trim() &&
      nextItem.clientSubmittedAt?.trim()
    ) {
      const leadRequest = nextItem.reviewSource === 'lead_manager_request';
      out.push({
        kind: 'checklist.submit',
        title: leadRequest ? 'Manager approval requested' : 'Client submission',
        body: leadRequest
          ? `${companyName}: ${title} is waiting for your approval.`
          : `${companyName} submitted ${title} for review.`,
        engagementId,
        companyName,
        itemId,
        href: notificationHref(ctx.viewerRole, ctx.engagement, itemId, 'checklist.submit'),
      });
    }

    // A manager accepting the LEAD's step is the delivery above, not a verdict
    // on anything the client sent — one toast, not two.
    if (
      !directFlow &&
      ctx.viewerRole === 'client' &&
      nextItem.reviewSource !== 'lead_manager_request' &&
      prevItem?.reviewStatus !== nextItem.reviewStatus &&
      (nextItem.reviewStatus === 'accepted' || nextItem.reviewStatus === 'rejected') &&
      nextItem.reviewedBy !== ctx.viewerUserId
    ) {
      const accepted = nextItem.reviewStatus === 'accepted';
      out.push({
        kind: 'checklist.review',
        title: accepted ? 'Submission accepted' : 'Corrections requested',
        body: accepted
          ? `${title} was approved by your engagement team.`
          : nextItem.rejectionNote?.trim()
            ? `${title}: ${nextItem.rejectionNote.trim()}`
            : `${title} needs updates — check the milestone for details.`,
        engagementId,
        companyName,
        itemId,
        href: '/app/client/incorporation',
      });
    }
  }

  return out;
}

/** Stable key for suppressing duplicate realtime toasts after a local mutation. */
export function checklistNotifySuppressKey(
  engagementId: string,
  itemId: string,
  kind: NotificationKind,
): string {
  return `${engagementId}:${itemId}:${kind}`;
}
