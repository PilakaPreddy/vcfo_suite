import { ymdInNotificationTz } from '@/lib/notifications/notification-dismiss';
import { roleSettingsPath } from '@/lib/auth-routes';
import type { Role } from '@/lib/auth';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';

/* Pure helpers for the Notifications page (prototype NotificationsScreen): the tab filter, the
   counts on each tab, the "This month" card and the link to the person's notification settings. */

/** The page's groups, as the prototype names them. A Chatbot group waits for chatbot notifications to exist. */
export type NotificationGroup = 'Documents' | 'Steps' | 'Deadlines' | 'Messages';
export const NOTIFICATION_GROUPS: NotificationGroup[] = ['Documents', 'Steps', 'Deadlines', 'Messages'];

/** "all", "unread" or one type group. */
export type NotificationTab = 'all' | 'unread' | NotificationGroup;

export function groupOf(item: Pick<AppNotification, 'kind'>): NotificationGroup {
  const k = item.kind as string;
  if (k === 'docs.share' || k.startsWith('request.')) return 'Documents';
  if (k === 'schedule.window' || k.startsWith('compliance.') || k === 'board.meeting') return 'Deadlines';
  if (k === 'message.received' || k.startsWith('email.') || k.startsWith('team.')) return 'Messages';
  return 'Steps';
}

/** The one word on a row's chip (prototype `NOTIF_TYPE`). */
export function chipWordOf(item: Pick<AppNotification, 'kind'>): string {
  const k = item.kind as string;
  if (k === 'docs.share') return 'Document';
  if (k.startsWith('request.')) return 'Request';
  if (k === 'schedule.window') return 'Timeline';
  if (k.startsWith('compliance.') || k === 'board.meeting') return 'Deadline';
  if (k === 'message.received') return 'Message';
  if (k.startsWith('email.')) return 'Email';
  if (k.startsWith('team.')) return 'Team';
  return 'Step';
}

export function matchesTab(item: AppNotification, tab: NotificationTab, isUnread: (n: AppNotification) => boolean): boolean {
  if (tab === 'all') return true;
  if (tab === 'unread') return isUnread(item);
  return groupOf(item) === tab;
}

/** How many items each tab would show. */
export function tabCounts(
  items: AppNotification[],
  isUnread: (n: AppNotification) => boolean,
): Record<NotificationTab, number> {
  const out = { all: items.length, unread: 0 } as Record<NotificationTab, number>;
  for (const g of NOTIFICATION_GROUPS) out[g] = 0;
  for (const n of items) {
    if (isUnread(n)) out.unread += 1;
    out[groupOf(n)] += 1;
  }
  return out;
}

/** True when the item was made in the same calendar month as `now`, India time. */
export function isCreatedThisIstMonth(createdAtIso: string, now: Date): boolean {
  const created = new Date(createdAtIso);
  if (Number.isNaN(created.getTime())) return false;
  return ymdInNotificationTz(created).slice(0, 7) === ymdInNotificationTz(now).slice(0, 7);
}

/** Where the person changes how they get notifications: the Notifications section of Profile. */
export function notificationSettingsHref(role: Role | undefined): string {
  if (!role) return '/app';
  if (role === 'client') return '/app/client/settings#notifications';
  const base = roleSettingsPath(role);
  // Super admin's Settings page already uses `?tab=profile`; its profile view reads `section`.
  if (role === 'super_admin') return `${base}&section=notify`;
  if (role === 'developer') return base;
  return `${base}?tab=notify`;
}
