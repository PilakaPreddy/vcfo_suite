/**
 * EXPIRY TRACKER MODEL — the kinds, the alert stages, the red/amber/green band and the renewal
 * rules shared by the seed, the daily job, the repository, the chat action and the page.
 * Pure: no database, no clock (every function takes `today` as an ISO date).
 */

export const EXPIRY_KINDS = ['dsc', 'dir3_kyc', 'gst', 'pf', 'esi', 'pt', 'shops', 'fssai', 'trade_licence', 'iec', 'msme', 'lei', 'other'] as const;
export type ExpiryKind = (typeof EXPIRY_KINDS)[number];

export const EXPIRY_SOURCES = ['checklist', 'registration', 'manual', 'ask'] as const;
export type ExpirySource = (typeof EXPIRY_SOURCES)[number];

export type SubjectKind = 'person' | 'company';

export const EXPIRY_KIND_LABEL: Record<ExpiryKind, string> = {
  dsc: 'DSC',
  dir3_kyc: 'DIR-3 KYC',
  gst: 'GST registration',
  pf: 'PF registration',
  esi: 'ESI registration',
  pt: 'PT registration',
  shops: 'Shops & Establishment',
  fssai: 'FSSAI licence',
  trade_licence: 'Trade licence',
  iec: 'IEC',
  msme: 'MSME (Udyam)',
  lei: 'LEI',
  other: 'Other',
};

/** Kinds that belong to a person (a director); the rest belong to the company. */
export function subjectKindOf(kind: ExpiryKind): SubjectKind {
  return kind === 'dsc' || kind === 'dir3_kyc' ? 'person' : 'company';
}

/** The alert stages in days before expiry; 0 is the day of expiry and every day after it. */
export const ALERT_STAGES = [60, 30, 7, 0] as const;
export type AlertStage = (typeof ALERT_STAGES)[number];

const DAY_MS = 86_400_000;

/** Whole days from `today` to `expiresOn` (negative once expired). */
export function daysUntil(expiresOn: string, today: string): number {
  return Math.round((Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

/** The stage a number of days left falls in, or null when it is further out than 60 days. */
export function stageForDays(days: number): AlertStage | null {
  if (days <= 0) return 0;
  if (days <= 7) return 7;
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  return null;
}

/**
 * The stage to alert today, or null. An item alerts once per stage: a stage is due when it is
 * nearer than the last one alerted. An item first seen 5 days out alerts once at T-7 and does
 * not replay T-60 and T-30. A renewed item never alerts.
 */
export function dueAlertStage(
  item: { expiresOn: string; lastAlertStage: number | null; renewedAt: Date | string | null },
  today: string,
): AlertStage | null {
  if (item.renewedAt) return null;
  const stage = stageForDays(daysUntil(item.expiresOn, today));
  if (stage === null) return null;
  if (item.lastAlertStage !== null && item.lastAlertStage <= stage) return null;
  return stage;
}

/**
 * Days past expiry after which an item never alerted before is backlog: the first run after a
 * deploy or a backfill does not open tasks and drafts for items that lapsed long ago.
 */
export const EXPIRED_BACKLOG_DAYS = 30;

/** True for an item that has never alerted and expired more than EXPIRED_BACKLOG_DAYS ago. */
export function isExpiryBacklog(item: { expiresOn: string; lastAlertStage: number | null; renewedAt: Date | string | null }, today: string): boolean {
  if (item.renewedAt || item.lastAlertStage !== null) return false;
  return daysUntil(item.expiresOn, today) < -EXPIRED_BACKLOG_DAYS;
}

export type ExpiryBand = 'red' | 'amber' | 'green';

/** Red when expired or 7 days or fewer away, amber within 30 days, green otherwise or once renewed. */
export function expiryBand(days: number, renewed: boolean): ExpiryBand {
  if (renewed) return 'green';
  if (days <= 7) return 'red';
  if (days <= 30) return 'amber';
  return 'green';
}

/** The words on the page and in alerts: "Expired 3 days ago", "Expires today", "12 days left". */
export function daysLeftLabel(days: number): string {
  if (days < 0) return days === -1 ? 'Expired yesterday' : `Expired ${-days} days ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * DIR-3 KYC due date rule, kept in this one function: every person holding a DIN files DIR-3 KYC
 * (or the DIR-3 KYC web form) by 30 September each year, so the next due date is 30 September of
 * this year until that day has passed, then 30 September of the next year.
 * MCA has proposed moving to a triennial cycle (once every three years, with an update only on a
 * change of details); when that is notified, change this function and `nextExpiryAfterRenewal`.
 */
export function dir3KycDueOn(today: string): string {
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-09-30`;
  return today.slice(0, 10) <= thisYear ? thisYear : `${year + 1}-09-30`;
}

/**
 * LEI renews yearly from its issue (or last renewal) date. With only the registration date on
 * file, the next anniversary on or after today is used, on the assumption that earlier renewals
 * were done; staff set the exact expiry on the registration when they know it.
 */
export function leiNextExpiry(issuedOn: string, today: string): string {
  let next = addMonthsIso(issuedOn, 12);
  for (let i = 0; i < 100 && next < today.slice(0, 10); i += 1) next = addMonthsIso(next, 12);
  return next;
}

/**
 * The next expiry when staff mark an item renewed without giving a date, for kinds whose cycle
 * is fixed: DIR-3 KYC moves to the next 30 September after the one just filed, and LEI moves one
 * year on. Null for every other kind (the person must give the new date, or the item is closed).
 */
export function nextExpiryAfterRenewal(kind: ExpiryKind, expiresOn: string): string | null {
  if (kind === 'dir3_kyc') return `${Number(expiresOn.slice(0, 4)) + 1}-09-30`;
  if (kind === 'lei') return addMonthsIso(expiresOn, 12);
  return null;
}

/** What the client usually sends for a renewal; the draft request list starts from these. */
export const RENEWAL_DOCUMENTS: Record<ExpiryKind, Array<{ kind: 'document' | 'answer' | 'confirmation'; label: string }>> = {
  dsc: [
    { kind: 'document', label: 'PAN card copy' },
    { kind: 'document', label: 'Aadhaar card copy' },
    { kind: 'document', label: 'Recent passport-size photograph' },
    { kind: 'answer', label: 'Mobile number and email for the DSC video verification' },
  ],
  dir3_kyc: [
    { kind: 'confirmation', label: 'Mobile number and personal email are unchanged (OTP will be sent to both)' },
    { kind: 'document', label: 'PAN card copy' },
    { kind: 'document', label: 'Address proof (Aadhaar, passport or a utility bill under two months old)' },
  ],
  gst: [{ kind: 'confirmation', label: 'Business details on the GST registration are unchanged' }],
  pf: [{ kind: 'confirmation', label: 'Establishment details on the PF registration are unchanged' }],
  esi: [{ kind: 'confirmation', label: 'Establishment details on the ESI registration are unchanged' }],
  pt: [{ kind: 'document', label: 'Latest PT payment challan' }],
  shops: [
    { kind: 'document', label: 'Current rental deed of the office' },
    { kind: 'answer', label: 'Number of employees at the establishment' },
  ],
  fssai: [
    { kind: 'document', label: 'Current FSSAI licence copy' },
    { kind: 'document', label: 'Food safety management plan (if updated)' },
  ],
  trade_licence: [
    { kind: 'document', label: 'Latest municipal property-tax receipt' },
    { kind: 'document', label: 'Current rental deed of the office' },
  ],
  iec: [{ kind: 'confirmation', label: 'IEC details are unchanged (the annual update is due)' }],
  msme: [{ kind: 'confirmation', label: 'Turnover and investment details for the Udyam update' }],
  lei: [{ kind: 'confirmation', label: 'Entity details for the LEI renewal are unchanged' }],
  other: [{ kind: 'document', label: 'Documents needed for the renewal' }],
};

/** "Ravi Kumar's DSC", "Acme Private Limited's GST registration". */
export function itemTitle(item: { kind: ExpiryKind; subjectName: string; referenceLabel?: string | null }): string {
  const what = item.kind === 'other' && item.referenceLabel ? item.referenceLabel : EXPIRY_KIND_LABEL[item.kind];
  return `${item.subjectName}'s ${what}`;
}

/** A stable slug for a name, used in source keys of items added by hand or from the chat. */
export function subjectSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** How far ahead the DSC check looks for filings the director must sign. */
export const DSC_FILING_HORIZON_DAYS = 90;

/**
 * Unfiled filings due between today and the horizon whose due date falls on or after the DSC's
 * expiry: the DSC will have lapsed when that filing must be signed. Soonest first.
 */
export function filingsAfterDscExpiry<F extends { dueDate: string; filedOn: string | null }>(
  expiresOn: string,
  today: string,
  filings: F[],
  horizonDays: number = DSC_FILING_HORIZON_DAYS,
): F[] {
  return filings
    .filter((f) => !f.filedOn?.trim())
    .filter((f) => {
      const days = daysUntil(f.dueDate, today);
      return days >= 0 && days <= horizonDays && f.dueDate.slice(0, 10) >= expiresOn.slice(0, 10);
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Mar 2027". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return `${d} ${MON[m - 1]} ${y}`;
}

/** The bell and email wording of one alert. */
export function alertCopy(input: {
  item: { kind: ExpiryKind; subjectName: string; referenceLabel?: string | null; expiresOn: string };
  companyName: string;
  stage: AlertStage;
  days: number;
  /** Filings the DSC will not cover (from `filingsAfterDscExpiry`). */
  blockedFilings?: Array<{ particular: string; dueDate: string }>;
}): { title: string; body: string; taskTitle: string } {
  const what = itemTitle(input.item);
  const title = input.stage === 0 ? `Expired: ${what}` : `Renew within ${input.days} ${input.days === 1 ? 'day' : 'days'}: ${what}`;
  const when = input.days < 0 ? `expired on ${shortDate(input.item.expiresOn)}` : input.days === 0 ? 'expires today' : `expires on ${shortDate(input.item.expiresOn)} (${daysLeftLabel(input.days)})`;
  const parts = [`${what} for ${input.companyName} ${when}.`];
  const blocked = input.blockedFilings ?? [];
  if (input.item.kind === 'dsc' && blocked.length > 0) {
    const first = blocked[0]!;
    const more = blocked.length > 1 ? ` and ${blocked.length - 1} more` : '';
    parts.push(`It lapses before ${first.particular} due ${shortDate(first.dueDate)}${more}, which the director must sign.`);
  }
  parts.push('A renewal task is open and a draft request for the renewal documents is ready to review and send.');
  return { title, body: parts.join(' '), taskTitle: `Renew ${what} (${input.companyName})` };
}
