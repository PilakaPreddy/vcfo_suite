/**
 * REMINDER DAYS — each person's "remind me N days before a due date" (notification_prefs
 * .remind_days: 7, 3 or 1; null means the firm default). Pure rules shared by the two jobs:
 *
 *  - compliance-reminders ("Remind me" on a filing): the stored remind_on came from the firm's
 *    default days when the reminder was set; a person who chose their own days gets it on
 *    due − N instead.
 *  - compliance-generate (WhatsApp due nudges to clients): by default a monthly filing nudges
 *    5 days before and a quarterly one 7 days before; a client who chose their own days is
 *    nudged N days before instead, for any frequency.
 */

const PERSONAL_REMIND_DAYS = [7, 3, 1] as const;

/** Default WhatsApp due-nudge days before the due date, by frequency (unchanged behaviour). */
const DEFAULT_DUE_NUDGE_DAYS: Record<string, number> = { monthly: 5, quarterly: 7 };

/** A valid personal choice, or null for the firm default. */
export function personalRemindDays(value: number | null | undefined): number | null {
  return value != null && (PERSONAL_REMIND_DAYS as readonly number[]).includes(value) ? value : null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day a "Remind me" email goes out: due − N for a personal choice, else the stored day. */
export function reminderSendDay(r: { remindOn: string; dueDate: string; remindDays: number | null | undefined }): string {
  const own = personalRemindDays(r.remindDays);
  return own === null ? r.remindOn.slice(0, 10) : addDaysIso(r.dueDate, -own);
}

/** True when the reminder's send day has come. */
export function reminderIsDue(r: { remindOn: string; dueDate: string; remindDays: number | null | undefined }, today: string): boolean {
  return reminderSendDay(r) <= today;
}

/**
 * True when a due nudge goes to this recipient today. `daysToDue` counts India days from
 * today to the due date.
 */
export function dueNudgeToday(remindDays: number | null | undefined, frequency: string, daysToDue: number): boolean {
  const own = personalRemindDays(remindDays);
  if (own !== null) return daysToDue === own;
  return DEFAULT_DUE_NUDGE_DAYS[frequency] === daysToDue;
}
