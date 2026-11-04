import type { NotifyEvent } from '@/lib/notify/types';

/**
 * A person's own WhatsApp choices, applied to the outbound WhatsApp path (G-25).
 *
 * PURE: no db, no env. The stored preferences come from `notification_prefs`
 * (Profile › Notifications for staff, Settings › Notifications for clients).
 *
 * - Category: each WhatsApp event belongs to one category the person can switch
 *   off. `welcome` belongs to none, because it is the consent confirmation itself.
 * - Quiet hours: no WhatsApp inside the window. The background job waits for the
 *   window to end instead of dropping the nudge.
 *
 * Email is never gated here. Email for steps, deadlines and documents stays
 * locked on for everyone; email remains the system of record.
 */

export type WhatsAppGatePrefs = {
  whatsapp: Record<string, boolean>;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  tz: string;
};

/**
 * The preference category each event falls under. Null, or an event missing
 * from this map, means it cannot be switched off. Add new events here.
 */
const WHATSAPP_EVENT_CATEGORY: Partial<Record<NotifyEvent, 'docs' | 'steps' | 'deadlines' | null>> = {
  welcome: null,
  // A staff reminder about an item the client owes ("Deadlines and reminders").
  client_reminder: 'deadlines',
  coi_issued: 'steps',
  document_delivered: 'docs',
  compliance_due_monthly: 'deadlines',
  compliance_due_quarterly: 'deadlines',
  compliance_overdue: 'deadlines',
};

/** True unless the person switched this event's category off. A category never saved counts as on. */
export function whatsappCategoryAllows(prefs: WhatsAppGatePrefs | null | undefined, event: NotifyEvent): boolean {
  if (!prefs) return true;
  const category = WHATSAPP_EVENT_CATEGORY[event] ?? null;
  if (!category) return true;
  return prefs.whatsapp?.[category] !== false;
}

/** `HH:MM` on a 24-hour clock. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** Hours and minutes of `at` on the wall clock of `tz` (falls back to India time on a bad zone). */
function localMinutes(at: Date, tz: string): number {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  };
  try {
    return read(tz || 'Asia/Kolkata');
  } catch {
    return read('Asia/Kolkata');
  }
}

/**
 * When the quiet window that contains `now` ends, or null when `now` is outside
 * it (or quiet hours are off). The window may cross midnight (21:00 to 08:00);
 * the start is inclusive and the end exclusive. Equal start and end means no window.
 */
export function quietHoursEnd(prefs: WhatsAppGatePrefs | null | undefined, now: Date = new Date()): Date | null {
  if (!prefs?.quietHours) return null;
  if (!isClockTime(prefs.quietStart) || !isClockTime(prefs.quietEnd)) return null;
  const start = minutesOf(prefs.quietStart);
  const end = minutesOf(prefs.quietEnd);
  if (start === end) return null;
  const cur = localMinutes(now, prefs.tz);
  const inside = start < end ? cur >= start && cur < end : cur >= start || cur < end;
  if (!inside) return null;
  const minutesLeft = (end - cur + 1440) % 1440;
  const wake = new Date(now.getTime() + minutesLeft * 60_000);
  // Land on the start of the end minute, not partway through it.
  wake.setUTCSeconds(0, 0);
  return wake;
}
