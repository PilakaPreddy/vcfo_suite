/**
 * CLIENT PORTAL · COMPLIANCES — pure view-model for the calendar and filings
 * pages (prototype s/comp/index.html + cal-views.js). No React, no db: the
 * repository uses it to shape rows, the pages use it to derive every count.
 *
 * Status keys follow the prototype: ok = filed · due = due soon · over =
 * overdue · up = upcoming. The portal's due-soon threshold is the prototype's
 * 7 days (QUESTIONS.md · compliances); staff views keep `filings.ts` (14 days).
 */
import { complianceGroupForAuthority } from '@/lib/client/client-overview';
import {
  EPFO,
  ESIC,
  FIRMS,
  FLAIR,
  GST_LOGIN,
  IT_FO,
  MCA_FO,
  STPI,
  TGCT,
  TRACES,
} from '@/lib/notifications/announcement-portals';

const PORTAL_DUE_SOON_DAYS = 7;

export type CompStatus = 'ok' | 'due' | 'over' | 'up';
export type AreaCode = 'MCA' | 'GST' | 'IT' | 'PAY' | 'FEMA';
export type AreaFilter = 'all' | AreaCode;

/** One register row as the client portal shows it. */
export interface PortalFiling {
  id: string;
  engagementId: string;
  companyName: string;
  /** Raw `compliance_obligations.particular` ("GSTR-3B Filing"). */
  particular: string;
  /** Short display name ("GSTR-3B"). */
  name: string;
  area: AreaCode;
  /** Authority code (GST, IT, MCA, EPFO, ESIC, RBI…). */
  authority: string;
  /** "GSTN", "Income Tax Dept"… */
  authorityName: string;
  /** monthly | quarterly | half-yearly | annual | one-time */
  frequency: string;
  /** "Monthly" */
  freqLabel: string;
  dueDate: string;
  filedOn: string | null;
  /** "Sep 2026" / "Jul–Sep 2026" / "FY 2025-26" */
  period: string;
  /** "1–30 Sep 2026" — detail facts; null when the register has no period dates. */
  periodLong: string | null;
  fyLabel: string | null;
  rawStatus: string;
  windowFrom: string | null;
  windowTo: string | null;
  /** low | medium | high */
  penaltyRisk: string;
  ownerName: string | null;
  acknowledgementNo: string | null;
  amountPaid: string | null;
  filedByName: string | null;
  dataReceivedOn: string | null;
  preparingSince: string | null;
  draftDueOn: string | null;
  approvalDueOn: string | null;
  approvedOn: string | null;
  proofCount: number;
  /** The caller's own reminder day for this filing, or null. */
  reminderOn: string | null;
}

export const AREAS: { id: AreaFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'MCA', label: 'MCA' },
  { id: 'GST', label: 'GST' },
  { id: 'IT', label: 'Income tax' },
  { id: 'PAY', label: 'Payroll' },
  { id: 'FEMA', label: 'FEMA' },
];
export const AREA_ORDER: AreaCode[] = ['MCA', 'GST', 'IT', 'PAY', 'FEMA'];
export const AREA_LABEL: Record<AreaCode, string> = { MCA: 'MCA', GST: 'GST', IT: 'Income tax', PAY: 'Payroll', FEMA: 'FEMA' };
export const AREA_FULL: Record<AreaCode, string> = {
  MCA: 'Ministry of Corporate Affairs',
  GST: 'Goods & Services Tax',
  IT: 'Income tax',
  PAY: 'Payroll · PF, ESI, PT',
  FEMA: 'FEMA · RBI & STPI',
};

const ST: Record<CompStatus, { l: string; c: string; v: string }> = {
  ok: { l: 'Filed', c: 'c-ok', v: '--ok' },
  due: { l: 'Due soon', c: 'c-due', v: '--due' },
  over: { l: 'Overdue', c: 'c-over', v: '--over' },
  up: { l: 'Upcoming', c: 'c-up', v: '--up' },
};
export const ST_TIP: Record<CompStatus, string> = {
  ok: 'Filed',
  due: `Due within ${PORTAL_DUE_SOON_DAYS} days`,
  over: 'Late · past the due date',
  up: 'Upcoming',
};
const RANK: Record<CompStatus, number> = { over: 3, due: 2, up: 1, ok: 0 };

/* ------------------------------------------------------------------ dates */

const DAY = 86_400_000;
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Today in India (yyyy-mm-dd) — the firm works on IST dates. */
export function todayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
export function D(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, n: number): string {
  return isoOf(new Date(D(iso).getTime() + n * DAY));
}
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((D(toIso).getTime() - D(fromIso).getTime()) / DAY);
}
/** "15 Oct" */
export function fmtDM(iso: string): string {
  const d = D(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
/** "15 Oct 2026" */
export function fmtDMY(iso: string): string {
  const d = D(iso);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "Thu" */
export function dow(iso: string): string {
  return WD_SHORT[D(iso).getUTCDay()]!;
}
/** Date-tile sub-label: the weekday inside `refMonth` ("YYYY-MM"), else the
 *  month ("Dec") so two "15" tiles from different months never look alike. */
export function tileSub(iso: string, refMonth: string): string {
  return iso.slice(0, 7) === refMonth ? dow(iso) : MON[Number(iso.slice(5, 7)) - 1]!;
}
/** "Thu 15 Oct" */
export function fmtWDM(iso: string): string {
  return `${dow(iso)} ${fmtDM(iso)}`;
}
/** "Thursday 15 October" */
export function fmtLong(iso: string): string {
  const d = D(iso);
  return `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
/** "Thursday, 15 October" */
export function fmtLongComma(iso: string): string {
  const d = D(iso);
  return `${WD_LONG[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
export function stepMonth(key: string, k: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function fyStartOfMonth(key: string): number {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return m >= 4 ? y : y - 1;
}
export function fyLabelOf(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
/** Apr → Mar month keys of an FY. */
export function fyMonths(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, k) => {
    const m = (3 + k) % 12;
    const y = startYear + (3 + k >= 12 ? 1 : 0);
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  });
}

/* ---------------------------------------------------------------- status */

export function statusOf(f: Pick<PortalFiling, 'filedOn' | 'dueDate'>, today: string): CompStatus {
  if (f.filedOn) return 'ok';
  const d = daysBetween(today, f.dueDate);
  if (d < 0) return 'over';
  if (d <= PORTAL_DUE_SOON_DAYS) return 'due';
  return 'up';
}
export function worstStatus(rows: Pick<PortalFiling, 'filedOn' | 'dueDate'>[], today: string): CompStatus {
  return rows.reduce<CompStatus>((w, r) => (RANK[statusOf(r, today)] > RANK[w] ? statusOf(r, today) : w), 'ok');
}
export function countByStatus(rows: PortalFiling[], today: string): Record<CompStatus, number> {
  const c: Record<CompStatus, number> = { ok: 0, due: 0, over: 0, up: 0 };
  for (const r of rows) c[statusOf(r, today)]++;
  return c;
}
/** Date tile ground (K-30, audit 162): a soft tint of the status, never a solid block. */
export function tileVar(s: CompStatus): string {
  return `var(${ST[s].v}-light)`;
}
/** Date tile text: the status's text-safe colour, paired with tileVar. */
export function tileInk(s: CompStatus): string {
  return `var(${ST[s].v}-text)`;
}
export function sortByDue<T extends { dueDate: string; name?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.name ?? '').localeCompare(b.name ?? ''));
}
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------- shaping */

export function areaOf(authority: string, complianceArea = ''): AreaCode {
  const g = complianceGroupForAuthority(authority);
  if (g === 'GST') return 'GST';
  if (g === 'Income tax') return 'IT';
  if (g === 'Payroll') return 'PAY';
  if (g === 'MCA') return 'MCA';
  if (g === 'FEMA') return 'FEMA';
  // 'Other': fall back to the obligation's compliance area, then MCA.
  const a = `${authority} ${complianceArea}`.toUpperCase();
  if (/GST/.test(a)) return 'GST';
  if (/INCOME|TDS|TAX/.test(a)) return 'IT';
  if (/LABOUR|PAYROLL|PF|ESI|PT\b/.test(a)) return 'PAY';
  if (/FEMA|RBI|STPI|SEZ/.test(a)) return 'FEMA';
  return 'MCA';
}

export function displayName(particular: string): string {
  return particular
    .replace(/\s+Filing\b/i, '')
    .replace(/^Advance Tax Payment\b/i, 'Advance tax')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const AUTHORITY_NAME: Record<string, string> = {
  IT: 'Income Tax Dept',
  'INCOME TAX': 'Income Tax Dept',
  CBDT: 'Income Tax Dept',
  GST: 'GSTN',
  MCA: 'MCA',
  ROC: 'MCA · ROC',
  EPFO: 'EPFO',
  ESIC: 'ESIC',
  PT: 'State PT Dept',
  LWF: 'State Labour Dept',
  RBI: 'RBI',
  FEMA: 'RBI',
  STPI: 'STPI',
};
export function authorityName(code: string): string {
  return AUTHORITY_NAME[code.trim().toUpperCase()] ?? code;
}
export function freqLabel(f: string): string {
  const t = f.trim().toLowerCase();
  if (t === 'half-yearly') return 'Half-yearly';
  if (t === 'one-time') return 'One-time';
  return t ? t[0]!.toUpperCase() + t.slice(1) : '—';
}

const QUARTER_MONTHS: Record<string, [number, number]> = { '1': [3, 5], '2': [6, 8], '3': [9, 11], '4': [0, 2] };

/**
 * The filing's period, never repeating the filing name. The register's
 * `period_label` often is "<particular> <year>" ("Advance Tax Payment Q2 2027"),
 * so it is only a last resort: period dates first, then months named in the
 * particular ("MSME-1 (Apr–Sep)", "… Q2") placed by the due date, then the
 * label with the particular stripped.
 */
export function displayPeriod(
  start: string | null,
  end: string | null,
  label: string | null,
  fyLabel: string | null,
  particular?: string | null,
  dueDate?: string | null,
): string {
  if (start && end) {
    const s = D(start);
    const e = D(end);
    const sm = s.getUTCMonth();
    const em = e.getUTCMonth();
    const sy = s.getUTCFullYear();
    const ey = e.getUTCFullYear();
    if (em === 2 && e.getUTCDate() === 31 && sm >= 3 && ey === sy + 1) return fyLabelOf(sy);
    if (sy === ey && sm === em) return `${MON[sm]} ${sy}`;
    if (sy === ey) return `${MON[sm]}–${MON[em]} ${sy}`;
    return `${MON[sm]} ${sy}–${MON[em]} ${ey}`;
  }
  const p = (particular ?? '').trim();
  if (p && dueDate) {
    const due = D(dueDate);
    const months = p.match(/\(([A-Z][a-z]{2})\s*[–-]\s*([A-Z][a-z]{2})\)/);
    const q = p.match(/\bQ([1-4])\b/);
    let range: [number, number] | null = null;
    if (months && MON.includes(months[1]!) && MON.includes(months[2]!)) range = [MON.indexOf(months[1]!), MON.indexOf(months[2]!)];
    else if (q) range = QUARTER_MONTHS[q[1]!]!;
    if (range) {
      // the period ends before the due date: same year unless it ends after the due month
      const y = range[1] > due.getUTCMonth() ? due.getUTCFullYear() - 1 : due.getUTCFullYear();
      const y0 = range[0] > range[1] ? y - 1 : y;
      return y0 === y ? `${MON[range[0]]}–${MON[range[1]]} ${y}` : `${MON[range[0]]} ${y0}–${MON[range[1]]} ${y}`;
    }
  }
  let l = label?.trim() ?? '';
  if (p && l.toLowerCase().startsWith(p.toLowerCase())) l = l.slice(p.length).trim();
  const dn = p ? displayName(p) : '';
  if (dn && l.toLowerCase().startsWith(dn.toLowerCase())) l = l.slice(dn.length).trim();
  return l || fyLabel?.trim() || '—';
}
export function periodLong(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const s = D(start);
  const e = D(end);
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth())
    return `${s.getUTCDate()}–${e.getUTCDate()} ${MON[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  return `${fmtDMY(start)} – ${fmtDMY(end)}`;
}

/** Rule 15 portal per filing (official login pages; deep-linked where the portal allows). */
export function portalFor(f: Pick<PortalFiling, 'area' | 'name'>): [string, string] {
  const n = f.name;
  if (f.area === 'GST') return ['GST portal', GST_LOGIN];
  if (f.area === 'MCA') return ['MCA portal', MCA_FO];
  if (f.area === 'IT') return /TDS|TCS|Form 16/i.test(n) ? ['TRACES', TRACES] : ['Income-tax portal', IT_FO];
  if (f.area === 'PAY') {
    if (/\bESI/i.test(n)) return ['ESIC portal', ESIC];
    if (/\bE?PF\b|EPF/i.test(n)) return ['EPFO portal', EPFO];
    return ['State PT portal', TGCT];
  }
  if (/Softex|STPI/i.test(n)) return ['STPI portal', STPI];
  if (/FLA/i.test(n)) return ['RBI FLAIR', FLAIR];
  return ['RBI FIRMS', FIRMS];
}

/* ------------------------------------------------------------ calendar */

export interface GridCell {
  iso: string;
  day: number;
  out: boolean;
}
/** Monday-first month grid; only the weeks the month needs. */
export function mondayMonthGrid(key: string): GridCell[] {
  const [y, m] = key.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = (first.getUTCDay() + 6) % 7;
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const cells: GridCell[] = [];
  const prevKey = stepMonth(key, -1);
  const nextKey = stepMonth(key, 1);
  for (let i = 0; i < start; i++) {
    const d = prevDays - start + 1 + i;
    cells.push({ iso: `${prevKey}-${String(d).padStart(2, '0')}`, day: d, out: true });
  }
  for (let d = 1; d <= days; d++) cells.push({ iso: `${key}-${String(d).padStart(2, '0')}`, day: d, out: false });
  const tail = (7 - ((start + days) % 7)) % 7;
  for (let i = 1; i <= tail; i++) cells.push({ iso: `${nextKey}-${String(i).padStart(2, '0')}`, day: i, out: true });
  return cells;
}
/** Mon…Sun week containing `iso`. */
export function weekOf(iso: string): string[] {
  const start = addDays(iso, -((D(iso).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function byDate<T extends { dueDate: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.dueDate.slice(0, 10);
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  }
  return m;
}
export function nextDeadline(rows: PortalFiling[], today: string): PortalFiling | null {
  return sortByDue(rows.filter((r) => !r.filedOn && r.dueDate >= today))[0] ?? null;
}
export function overdueRows(rows: PortalFiling[], today: string): PortalFiling[] {
  return sortByDue(rows.filter((r) => statusOf(r, today) === 'over'));
}
/** Coming up rail: unfiled + recently filed from today − 1, first n. */
export function comingUp(rows: PortalFiling[], today: string, n = 7): PortalFiling[] {
  return sortByDue(rows.filter((r) => r.dueDate >= addDays(today, -1))).slice(0, n);
}
export function filterArea<T extends { area: AreaCode }>(rows: T[], area: AreaFilter): T[] {
  return area === 'all' ? rows : rows.filter((r) => r.area === area);
}

/* -------------------------------------------------------- focus track */

export interface TrackNode {
  st: 'done' | 'cur' | 'next' | 'you';
  label: string;
  sub: string;
  tip: string;
  icon?: 'gear' | 'person' | 'check' | 'file';
}
/** The four workflow steps; dates come only from data (never invented). */
export function focusNodes(f: PortalFiling, companyShort: string, today: string): TrackNode[] {
  const filed = Boolean(f.filedOn);
  const dataDone = filed || Boolean(f.dataReceivedOn) || Boolean(f.preparingSince) || Boolean(f.approvedOn);
  const prepDone = filed || Boolean(f.approvedOn) || (Boolean(f.draftDueOn) && f.draftDueOn! < today && f.rawStatus !== 'in-progress');
  const apprDone = filed || Boolean(f.approvedOn);
  const steps: { done: boolean; label: string; doneLabel: string; at: string | null; pending: string; tip: string; icon: TrackNode['icon']; you?: boolean }[] = [
    // While pending this is the client's move: 'Send data', not a done-sounding 'Data received' (TL-21).
    { done: dataDone, label: 'Send data', doneLabel: filed ? 'Data' : 'Data received', at: f.dataReceivedOn, pending: 'waiting on you', tip: 'Waiting on you · send the data', icon: 'file', you: true },
    {
      done: prepDone,
      label: 'SBC preparing',
      doneLabel: 'Prepared',
      at: null,
      pending: [f.preparingSince ? `Since ${fmtDM(f.preparingSince)}` : '', f.ownerName ?? ''].filter(Boolean).join(' · ') || 'With SBC',
      tip: `With SBC${f.ownerName ? ` · ${f.ownerName}` : ''}`,
      icon: 'gear',
    },
    {
      done: apprDone,
      label: `${companyShort} approves`,
      doneLabel: `${companyShort} approved`,
      at: f.approvedOn,
      pending: f.approvalDueOn ? `by ${fmtDM(f.approvalDueOn)}` : '',
      tip: f.approvalDueOn ? `Upcoming · waiting on ${companyShort} by ${fmtDM(f.approvalDueOn)}` : `Upcoming · waiting on ${companyShort}`,
      icon: 'person',
      you: true,
    },
    { done: filed, label: 'Filed', doneLabel: 'Filed', at: f.filedOn, pending: `due ${fmtDM(f.dueDate)}`, tip: `Upcoming · due ${fmtDM(f.dueDate)}`, icon: 'check' },
  ];
  const cur = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => {
    if (s.done) {
      const early = i === 3 && f.filedOn ? daysBetween(f.filedOn, f.dueDate) : null;
      const tail = early && early > 0 ? ` · ${plural(early, 'day')} early` : '';
      return { st: 'done', label: s.doneLabel, sub: s.at ? fmtDM(s.at) : '', tip: s.at ? `Done · ${fmtDM(s.at)}${tail}` : 'Done' };
    }
    if (i === cur) return { st: 'cur', label: s.label, sub: s.pending, tip: s.you ? s.tip : s.tip, icon: s.icon };
    return { st: 'next', label: s.label, sub: s.pending, tip: s.tip };
  });
}

/* --------------------------------------------------------------- csv / ics */

function csvEscape(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  // spreadsheet formula injection: a cell starting with = + - @ is text
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function filingsCsv(rows: PortalFiling[], today: string): string {
  const head = ['Due date', 'Area', 'Filing', 'Period', 'Frequency', 'Authority', 'Status', 'Filed on', 'ARN', 'Tax paid (INR)', 'Proof files'];
  const lines = sortByDue(rows).map((r) =>
    [r.dueDate, AREA_LABEL[r.area], r.name, r.period, r.freqLabel, r.authorityName, ST[statusOf(r, today)].l, r.filedOn ?? '', r.acknowledgementNo ?? '', r.amountPaid ?? '', r.proofCount]
      .map(csvEscape)
      .join(','),
  );
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
export function filingsIcs(rows: PortalFiling[], stamp: Date = new Date()): string {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ev = rows.map((r) => {
    const d = r.dueDate.replace(/-/g, '');
    const next = addDays(r.dueDate, 1).replace(/-/g, '');
    const [portal, url] = portalFor(r);
    return [
      'BEGIN:VEVENT',
      `UID:${r.id}@vcfo-suite`,
      `DTSTAMP:${dt}`,
      `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${icsText(`${r.name} · ${r.period} due`)}`,
      `DESCRIPTION:${icsText(`${r.companyName} · ${AREA_LABEL[r.area]} · ${r.authorityName}. File on the ${portal}: ${url}`)}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'TRIGGER:-P3D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`${r.name} due in 3 days`)}`,
      'END:VALARM',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VCFO Suite//Compliances//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
