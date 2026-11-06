import {
  notificationDirection,
  type AppNotification,
  type NotificationKind,
} from '@/lib/checklist/checklist-notifications';
import { isPersistedNotificationId } from '@/lib/notifications/notification-dismiss';

const NOTIFICATION_POPUP_PREFIX = 'vcfo.notifications.popup.';
const NOTIFICATION_POPUP_EVENT = 'vcfo-notifications-popup';
export const NOTIFICATION_GENIE_LAND_EVENT = 'vcfo-notifications-genie-land';
export const NOTIFICATION_SHOW_EVENT = 'vcfo-notifications-show';
export const NOTIFICATION_BELL_SELECTOR = '[data-notifications-bell]';
export const NOTIFICATION_BELL_TARGET_SELECTOR = '[data-notifications-bell-target]';
export const NOTIFICATION_LIVE_POLL_MS = 4_000;
export const NOTIFICATION_LIVE_POPUP_CAP = 8;

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  'checklist.deliver': 'Deliver',
  'checklist.submit': 'Submit',
  'checklist.review': 'Review',
  'checklist.unlock': 'Unlock',
  'docs.share': 'Docs',
  'request.created': 'Request',
  'request.uploaded': 'Upload',
  'message.received': 'Message',
  'schedule.window': 'Dates',
  'compliance.reminder': 'Reminder',
  'compliance.task': 'Task',
  'board.meeting': 'Meeting',
  'budget.update': 'Budget',
  'watch.update': 'Update',
  'watch.alert': 'Source',
  'team.assigned': 'Assigned',
  'team.removed': 'Removed',
  'email.sent': 'Sent',
  'email.skipped': 'Skipped',
  'email.failed': 'Failed',
};

export function notificationPopupStorageKey(userId: string): string {
  return `${NOTIFICATION_POPUP_PREFIX}${userId}`;
}

function parseStoredIdSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Ids already presented as a live popup. `null` means this browser has never initialized the set. */
export function readNotificationPopupIds(userId: string): Set<string> | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(notificationPopupStorageKey(userId));
    if (raw == null) return null;
    return parseStoredIdSet(raw);
  } catch {
    return null;
  }
}

function writeNotificationPopupIds(userId: string, ids: Iterable<string>): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(notificationPopupStorageKey(userId), JSON.stringify([...new Set(ids)]));
    window.dispatchEvent(new Event(NOTIFICATION_POPUP_EVENT));
  } catch {
    /* ignore */
  }
}

export function addNotificationPopupIds(userId: string, ids: Iterable<string>): Set<string> {
  const incoming = [...ids].filter(Boolean);
  const existing = readNotificationPopupIds(userId);
  const next = existing ?? new Set<string>();
  let changed = existing === null;
  for (const id of incoming) {
    if (next.has(id)) continue;
    next.add(id);
    changed = true;
  }
  if (!changed) return next;
  writeNotificationPopupIds(userId, next);
  return next;
}

export type NotificationShowDetail = { notification: AppNotification };

/** Explicit reopen — ignores the auto-popup seen set. */
export function requestNotificationPopup(item: AppNotification): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<NotificationShowDetail>(NOTIFICATION_SHOW_EVENT, { detail: { notification: item } }),
  );
}

function isLivePopupCandidate(item: AppNotification): boolean {
  if (!isPersistedNotificationId(item.id)) return false;
  if (item.dismissedAt) return false;
  return notificationDirection(item.kind) === 'received';
}

export function selectNotificationPopups(input: {
  items: AppNotification[];
  poppedIds: Set<string> | null;
}): { queue: AppNotification[]; seedIds: string[] } {
  const received = input.items.filter(isLivePopupCandidate);

  if (input.poppedIds === null) {
    return { queue: [], seedIds: received.map((item) => item.id) };
  }

  const fresh = received.filter((item) => !input.poppedIds!.has(item.id));
  return {
    queue: fresh.slice(0, NOTIFICATION_LIVE_POPUP_CAP),
    seedIds: fresh.map((item) => item.id),
  };
}
