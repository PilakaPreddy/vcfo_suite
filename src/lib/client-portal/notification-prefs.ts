
const EMAIL_OPTIONAL = ['announcements', 'feed', 'weeklyDigest'] as const;
const WHATSAPP_CATEGORIES = ['docs', 'steps', 'deadlines', 'timeline', 'announcements', 'feed'] as const;

export type EmailOptional = (typeof EMAIL_OPTIONAL)[number];

/**
 * Staff alerts by role (P-627): admin and super get "escalations", managers "approvalsWaiting".
 * The super admin also gets "partnerReport" (P-639): off holds their monthly scheduled partner
 * reports. Every staff member may turn on "myDayEmail", the weekday "My day" plan email (IDEAS-PLAN F),
 * which is off by default. They are stored as keys in the same `email` jsonb as the optional categories.
 */
const STAFF_ALERTS = ['approvalsWaiting', 'escalations', 'partnerReport', 'myDayEmail'] as const;
export type StaffAlert = (typeof STAFF_ALERTS)[number];

/** Days before a due date to send the reminder (C-831); null keeps the firm default. */
export const REMIND_DAYS = [7, 3, 1] as const;
export type RemindDays = (typeof REMIND_DAYS)[number];
export type WhatsAppCategory = (typeof WHATSAPP_CATEGORIES)[number];

export interface NotificationPrefs {
  email: Record<EmailOptional, boolean>;
  whatsapp: Record<WhatsAppCategory, boolean>;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  /** Staff alerts (P-627). Optional so older callers that build prefs by hand still type-check. */
  alerts?: Record<StaffAlert, boolean>;
  /** Reminder lead time in days; null is the firm default. */
  remindDays?: RemindDays | null;
  /** Daily digest time, "HH:MM"; null is no daily digest (P-626). */
  digestTime?: string | null;
}

export interface NotificationPrefsPatch {
  email?: Partial<Record<EmailOptional, boolean>>;
  whatsapp?: Partial<Record<WhatsAppCategory, boolean>>;
  quietHours?: boolean;
  /** `HH:MM`, 24-hour clock, in the person's time zone (staff Profile, G-25). */
  quietStart?: string;
  quietEnd?: string;
  alerts?: Partial<Record<StaffAlert, boolean>>;
  /** 7, 3 or 1; null goes back to the firm default. */
  remindDays?: RemindDays | null;
  /** "HH:MM"; null turns the daily digest off. */
  digestTime?: string | null;
}

/** The board's defaults (settings_redesign: em {ann:on, feed:off, digest:on}, wa on except news). */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  email: { announcements: true, feed: false, weeklyDigest: true },
  whatsapp: { docs: true, steps: true, deadlines: true, timeline: true, announcements: false, feed: false },
  quietHours: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  alerts: { approvalsWaiting: true, escalations: true, partnerReport: true, myDayEmail: false },
  remindDays: null,
  digestTime: null,
};

export function normalizeNotificationPrefsPatch(input: unknown): NotificationPrefsPatch {
  const out: NotificationPrefsPatch = {};
  if (!input || typeof input !== 'object') return out;
  const p = input as Record<string, unknown>;
  if (p.email && typeof p.email === 'object') {
    const e: Partial<Record<EmailOptional, boolean>> = {};
    for (const k of EMAIL_OPTIONAL) {
      const v = (p.email as Record<string, unknown>)[k];
      if (typeof v === 'boolean') e[k] = v;
    }
    out.email = e;
  }
  if (p.whatsapp && typeof p.whatsapp === 'object') {
    const w: Partial<Record<WhatsAppCategory, boolean>> = {};
    for (const k of WHATSAPP_CATEGORIES) {
      const v = (p.whatsapp as Record<string, unknown>)[k];
      if (typeof v === 'boolean') w[k] = v;
    }
    out.whatsapp = w;
  }
  if (typeof p.quietHours === 'boolean') out.quietHours = p.quietHours;
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof p.quietStart === 'string' && clock.test(p.quietStart)) out.quietStart = p.quietStart;
  if (typeof p.quietEnd === 'string' && clock.test(p.quietEnd)) out.quietEnd = p.quietEnd;
  if (p.alerts && typeof p.alerts === 'object') {
    const a: Partial<Record<StaffAlert, boolean>> = {};
    for (const k of STAFF_ALERTS) {
      const v = (p.alerts as Record<string, unknown>)[k];
      if (typeof v === 'boolean') a[k] = v;
    }
    out.alerts = a;
  }
  if (p.remindDays === null || (REMIND_DAYS as readonly unknown[]).includes(p.remindDays)) out.remindDays = p.remindDays as RemindDays | null;
  if (p.digestTime === null || (typeof p.digestTime === 'string' && clock.test(p.digestTime))) out.digestTime = p.digestTime as string | null;
  return out;
}
