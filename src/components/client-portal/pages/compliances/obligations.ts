/**
 * Client portal · Obligations: the register rows the client already sees in Filings and the
 * Calendar, grouped by filing (one obligation per engagement and `particular`). Pure: no
 * React, no fetch. Every date and count comes from the rows; nothing is invented.
 */
import {
  daysBetween,
  focusNodes,
  freqLabel,
  fyStartOfMonth,
  slugOf,
  sortByDue,
  statusOf,
  type AreaCode,
  type CompStatus,
  type PortalFiling,
} from '@/lib/client-portal/compliances';

export interface Obligation {
  /** URL segment: the filing name as a slug, with the engagement when the client has more than one. */
  id: string;
  name: string;
  particular: string;
  engagementId: string;
  companyName: string;
  area: AreaCode;
  authority: string;
  authorityName: string;
  frequency: string;
  freqLabel: string;
  penaltyRisk: string;
  /** Every period on the register, oldest due date first. */
  instances: PortalFiling[];
  /** The periods due in the current financial year (all periods when none fall in it). */
  fyRows: PortalFiling[];
  filed: number;
  total: number;
  /** The earliest period not filed yet (overdue ones included). */
  next: PortalFiling | null;
  /** The latest filed period. */
  last: PortalFiling | null;
  /** Worst open state: Overdue, then Due soon, then Not started; Done when nothing is open. */
  status: CompStatus;
  /** The date the list tile shows: the next due date, else the last filed date. */
  tileDate: string;
  ownerName: string | null;
}

/** FY start year of an ISO date (April to March). */
function fyOf(iso: string): number {
  return fyStartOfMonth(iso.slice(0, 7));
}

export function groupObligations(rows: PortalFiling[], today: string): Obligation[] {
  const engagements = new Set(rows.map((r) => r.engagementId));
  const many = engagements.size > 1;
  const groups = new Map<string, PortalFiling[]>();
  for (const r of rows) {
    const k = `${r.engagementId}\u0000${r.particular}`;
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }
  const curFy = fyOf(today);
  const out: Obligation[] = [];
  for (const list of groups.values()) {
    const instances = sortByDue(list);
    const head = instances[0]!;
    const inFy = instances.filter((r) => fyOf(r.dueDate) === curFy);
    const fyRows = inFy.length ? inFy : instances;
    const open = instances.filter((r) => !r.filedOn);
    const filedRows = instances.filter((r) => r.filedOn);
    const next = open[0] ?? null;
    const last = filedRows.length ? [...filedRows].sort((a, b) => (a.filedOn ?? '').localeCompare(b.filedOn ?? '')).at(-1)! : null;
    const states = open.map((r) => statusOf(r, today));
    const status: CompStatus = states.includes('over') ? 'over' : states.includes('due') ? 'due' : open.length ? 'up' : 'ok';
    const id = many ? `${slugOf(head.particular)}--${slugOf(head.engagementId)}` : slugOf(head.particular);
    out.push({
      id,
      name: head.name,
      particular: head.particular,
      engagementId: head.engagementId,
      companyName: head.companyName,
      area: head.area,
      authority: head.authority,
      authorityName: head.authorityName,
      frequency: head.frequency,
      freqLabel: head.freqLabel || freqLabel(head.frequency),
      penaltyRisk: head.penaltyRisk,
      instances,
      fyRows,
      filed: fyRows.filter((r) => r.filedOn).length,
      total: fyRows.length,
      next,
      last,
      status,
      tileDate: next?.dueDate ?? last?.filedOn ?? head.dueDate,
      ownerName: next?.ownerName ?? last?.ownerName ?? null,
    });
  }
  return out.sort((a, b) => a.tileDate.localeCompare(b.tileDate) || a.name.localeCompare(b.name));
}

/** Frequency groups of the list, in the register's order. */
export const FREQ_ORDER = ['monthly', 'quarterly', 'half-yearly', 'annual', 'one-time'] as const;

export function freqKey(o: Pick<Obligation, 'frequency'>): string {
  const f = o.frequency.trim().toLowerCase();
  return (FREQ_ORDER as readonly string[]).includes(f) ? f : 'other';
}

/** Periods not filed yet and due within `days` days (overdue periods included), soonest first. */
export function dueWithin(obligations: Obligation[], today: string, days = 15): Array<{ o: Obligation; f: PortalFiling }> {
  const hits: Array<{ o: Obligation; f: PortalFiling }> = [];
  for (const o of obligations) for (const f of o.instances) if (!f.filedOn && daysBetween(today, f.dueDate) <= days) hits.push({ o, f });
  return hits.sort((a, b) => a.f.dueDate.localeCompare(b.f.dueDate) || a.o.name.localeCompare(b.o.name));
}

/**
 * The obligations whose next period waits on the client: its live workflow step is the
 * client's (send the data, or approve the draft), and the period is open now (its filing
 * window has started, or it is due within 30 days when the register has no window).
 */
export function waitingOnClient(obligations: Obligation[], today: string, companyShort: string): Array<{ o: Obligation; f: PortalFiling; step: string }> {
  const out: Array<{ o: Obligation; f: PortalFiling; step: string }> = [];
  for (const o of obligations) {
    const f = o.next;
    if (!f) continue;
    const open = f.windowFrom ? f.windowFrom <= today : daysBetween(today, f.dueDate) <= 30;
    if (!open) continue;
    const cur = focusNodes(f, companyShort, today).find((n) => n.st === 'cur');
    if (cur && (cur.icon === 'file' || cur.icon === 'person')) out.push({ o, f, step: cur.label });
  }
  return out.sort((a, b) => a.f.dueDate.localeCompare(b.f.dueDate));
}
