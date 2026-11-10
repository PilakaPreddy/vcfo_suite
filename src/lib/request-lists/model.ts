/**
 * Request lists: the pure rules the repository, the reminder job and the screens share. Nothing
 * here reads the database, so every decision is testable on its own.
 */

export const REQUEST_LIST_STATUSES = ['draft', 'sent', 'complete', 'cancelled'] as const;
export type RequestListStatus = (typeof REQUEST_LIST_STATUSES)[number];

export const REQUEST_ITEM_STATUSES = ['pending', 'received', 'accepted', 'rejected'] as const;
export type RequestItemStatus = (typeof REQUEST_ITEM_STATUSES)[number];

/** WhatsApp joins the email from this reminder on, for clients who opted in. */
export const WHATSAPP_FROM_REMINDER = 2;
/** After this reminder the lead gets one "call the client" task. */
export const CALL_TASK_AFTER_REMINDER = 3;
/** Reminders stop after this many, so a forgotten list never mails a client for ever. */
export const MAX_REMINDERS = 8;
/** Reminders go out only in these India hours (09:00 to 18:59), never at night. */
export const SEND_HOURS_IST = { from: 9, to: 19 } as const;

const DAY_MS = 86_400_000;
/** The job runs hourly; a little slack keeps a 3-day cadence from slipping by an hour each time. */
const SLACK_MS = 30 * 60_000;

/** An item counts as done once the client has given it, whether or not staff accepted it yet. */
export function isItemDone(status: string): boolean {
  return status === 'received' || status === 'accepted';
}

export function listProgress(items: ReadonlyArray<{ status: string }>): { total: number; done: number; percent: number } {
  const total = items.length;
  const done = items.filter((i) => isItemDone(i.status)).length;
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * The item status a linked document request implies. `document_requests.status` stores
 * pending | fulfilled (uploaded) | approved | cancelled (rejected). Null means "leave it".
 */
export function itemStatusFromDocumentRequest(docStatus: string | null | undefined, current: string): RequestItemStatus | null {
  if (!docStatus) return null;
  const next: RequestItemStatus | null =
    docStatus === 'approved' ? 'accepted' : docStatus === 'fulfilled' || docStatus === 'uploaded' ? 'received' : docStatus === 'cancelled' ? 'rejected' : null;
  return next && next !== current ? next : null;
}

export interface ReminderListState {
  status: string;
  reminderCount: number;
  cadenceDays: number;
  firstSentAt: Date | string | null;
  lastRemindedAt: Date | string | null;
  callTaskId: string | null;
}

export type ReminderDecision =
  | { kind: 'complete' }
  | { kind: 'none'; reason: 'not_sent' | 'not_due' | 'quiet_hours' | 'max_reached' }
  | { kind: 'remind'; reminder: number; whatsapp: boolean; callTask: boolean };

function toMs(v: Date | string | null): number | null {
  if (!v) return null;
  const ms = typeof v === 'string' ? Date.parse(v) : v.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The hour in India (UTC+05:30) for a moment. */
export function istHour(now: Date): number {
  return new Date(now.getTime() + 330 * 60_000).getUTCHours();
}

/**
 * Which reminder step, if any, a list is due for now. Order matters: a list whose items are all in
 * is complete before anything else is asked, so a client who just finished never gets a reminder.
 */
export function decideReminder(list: ReminderListState, items: ReadonlyArray<{ status: string }>, now: Date): ReminderDecision {
  if (list.status !== 'sent') return { kind: 'none', reason: 'not_sent' };
  if (items.length > 0 && items.every((i) => isItemDone(i.status))) return { kind: 'complete' };
  if (list.reminderCount >= MAX_REMINDERS) return { kind: 'none', reason: 'max_reached' };
  const since = toMs(list.lastRemindedAt) ?? toMs(list.firstSentAt);
  if (since === null) return { kind: 'none', reason: 'not_sent' };
  const cadence = Math.max(1, list.cadenceDays) * DAY_MS;
  if (now.getTime() - since < cadence - SLACK_MS) return { kind: 'none', reason: 'not_due' };
  const hour = istHour(now);
  if (hour < SEND_HOURS_IST.from || hour >= SEND_HOURS_IST.to) return { kind: 'none', reason: 'quiet_hours' };
  const reminder = list.reminderCount + 1;
  return {
    kind: 'remind',
    reminder,
    whatsapp: reminder >= WHATSAPP_FROM_REMINDER,
    callTask: reminder >= CALL_TASK_AFTER_REMINDER && !list.callTaskId,
  };
}

/** A short "3 of 7 in" line for lists and emails. */
export function progressLine(items: ReadonlyArray<{ status: string }>): string {
  const p = listProgress(items);
  return p.total === 0 ? 'No items' : `${p.done} of ${p.total} in`;
}

/** The staff Requests page for a role: /app/{intern,manager,admin,super}/requests. */
export function requestsPageHref(role: string): string {
  if (role === 'super_admin') return '/app/super/requests';
  if (role === 'admin') return '/app/admin/requests';
  if (role === 'intern') return '/app/intern/requests';
  if (role === 'client') return '/app/client/requests';
  return '/app/manager/requests';
}
