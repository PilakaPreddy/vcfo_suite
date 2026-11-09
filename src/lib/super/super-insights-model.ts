/**
 * SUPER ADMIN INSIGHTS — pure shape builder for the practice, team, risk, growth and report
 * screens.
 *
 * The repository (`src/db/repositories/super-overview.ts`, `getSuperFirmInsights`) gathers the
 * scoped rows and hands them here. Nothing in this module touches `db`, `server-only` or React,
 * so the views can import the types and every derivation stays unit-testable.
 *
 * Every number comes from a stored date or a stored status: engagement `created_at`, the
 * certificate date (`incorporation_date`, or the Pre-12 step), checklist step states read
 * through the same gate the wizard uses, and compliance instances with their `due_date` and
 * `filed_on`. Nothing is estimated, and there is no money anywhere (rule R-37).
 */

import type { SuperEngagementSummary, SuperActivityEntry } from '@/lib/super/super-overview';
import {
  countKnown,
  filedAsOf,
  trailingKnown,
  type FilingHistoryRow,
  type FilingReopen,
  type TrendPeriod,
} from '@/lib/metrics/home-trends';
import { titleWithPeriod } from '@/lib/compliance/period-title';

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** One registration step for one client, as the gate and the stored status say. */
export type SuperRegCell = 'done' | 'progress' | 'waiting' | 'overdue' | 'not-needed' | 'locked';

export interface SuperRegistrationType {
  id: string;
  title: string;
}

export interface SuperOverdueStep {
  id: string;
  title: string;
  href: string;
}

export interface SuperInsightClient {
  summary: SuperEngagementSummary;
  /** True when the engagement started before incorporation, so SBC ran the COI. */
  startedPreInc: boolean;
  /** Certificate of incorporation date (YYYY-MM-DD), when one is recorded. */
  certificateDate: string | null;
  /** Days from the engagement start to the certificate, for engagements SBC incorporated. */
  daysToCoi: number | null;
  /** Primary manager plus co-managers (profile ids). */
  managerIds: string[];
  /** Primary lead plus co-leads (`intern_id` scoping keys). */
  leadIds: string[];
  overdueSteps: SuperOverdueStep[];
  /** Registration step id to its cell. */
  registrations: Record<string, SuperRegCell>;
  /** Staff workspace of the current step, when there is one. */
  currentStepHref: string | null;
  /** Earliest open filing due date (YYYY-MM-DD), when any. */
  nextDueDate: string | null;
  /** End of the manager-set window on the current step (YYYY-MM-DD), when one is set. */
  currentStepDue: string | null;
}

export interface SuperInsightFiling {
  id: string;
  engagementId: string;
  companyName: string;
  title: string;
  authority: string;
  dueDate: string;
  filedOn: string | null;
  status: string;
  periodLabel?: string;
  href: string;
}

export type SuperFilingOutcome = 'on-time' | 'late' | 'overdue' | 'open';

export interface SuperMonth {
  /** YYYY-MM */
  key: string;
  /** "Oct" */
  label: string;
  /** "October 2026" */
  longLabel: string;
  engagementsStarted: number;
  certificatesIssued: number;
  /** Average days to COI over the certificates issued this month; null without any. */
  avgDaysToCoi: number | null;
  filingsDue: number;
  filedOnTime: number;
  filedLate: number;
  /** Due this month, not filed, and the due date has passed. */
  overdue: number;
  /** Due this month, not filed, and not yet due. */
  open: number;
}

export interface SuperTeamLead {
  id: string;
  name: string;
  email: string;
  internId: string | null;
  status: string;
  lastActiveAt: string | null;
  clients: number;
  openSteps: number;
  overdueSteps: number;
  attention: number;
}

export interface SuperTeamManager {
  id: string;
  name: string;
  email: string;
  status: string;
  lastActiveAt: string | null;
  clients: number;
  incorporating: number;
  openSteps: number;
  overdueSteps: number;
  approvalsPending: number;
  attention: number;
  overdueFilings: number;
  filedOnTime: number;
  filedLate: number;
  /** Average days to COI over this manager's certificates; null without any. */
  avgDaysToCoi: number | null;
  leads: SuperTeamLead[];
}

export interface SuperTeamAdmin {
  id: string;
  name: string;
  email: string;
  role: string;
  lastActiveAt: string | null;
  /** Audit rows this person wrote in the last 30 days (within the recent audit window). */
  actions30d: number;
  /** This calendar month: managers, leads and tasks this person assigned (audit rows). */
  assignedMonth: number;
  /** This calendar month: clients and work this person moved to someone else (audit rows). */
  reassignedMonth: number;
  /** This calendar month: steps this person accepted in review (`engagement_step_events`). */
  approvalsMonth: number;
}

/**
 * Month-end values behind the Overview tiles' change against last month and trend lines.
 * Oldest first, without the live point; a series stops where the stored dates cannot say.
 */
export interface SuperHistory {
  /** Filings not filed and due in the 90 days up to each month end. */
  overdueFilings: number[];
  /** Filed on time over every filing due in the report window up to each month end, in percent. */
  filedOnTime: number[];
}

export interface SuperInsights {
  generatedAt: string;
  clients: SuperInsightClient[];
  registrationTypes: SuperRegistrationType[];
  filings: SuperInsightFiling[];
  months: SuperMonth[];
  team: {
    managers: SuperTeamManager[];
    /** Leads with no manager set on their profile. */
    unassignedLeads: SuperTeamLead[];
    admins: SuperTeamAdmin[];
  };
  /** What admins and super admins did recently, newest first. */
  adminFeed: SuperActivityEntry[];
  /** Month-end history for the Overview tiles. */
  history: SuperHistory;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** YYYY-MM-DD in UTC. */
function ymdOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The YYYY-MM-DD part of a date or timestamp string; null when it does not parse. */
export function dayOf(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : ymdOf(parsed);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetweenDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The last `count` month keys ending with the month of `now`, oldest first. */
export function monthKeys(now: Date, count = 12): string[] {
  const out: string[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** First day (YYYY-MM-DD) of the oldest month in the report window. */
export function windowFloor(now: Date, count = 12): string {
  return `${monthKeys(now, count)[0]}-01`;
}

function monthLabels(key: string): { label: string; longLabel: string } {
  const [y, m] = key.split('-').map(Number);
  const i = (m ?? 1) - 1;
  return { label: MONTH_SHORT[i] ?? key, longLabel: `${MONTH_LONG[i] ?? key} ${y}` };
}

/* ------------------------------------------------------------------ *
 * Filings
 * ------------------------------------------------------------------ */

/** Filed when the status says so or a filing date is recorded. */
export function isFiled(filing: Pick<SuperInsightFiling, 'status' | 'filedOn'>): boolean {
  return filing.status === 'filed' || Boolean(filing.filedOn?.trim());
}

/**
 * On time, late, overdue or still open. A filing without a filing date but marked filed counts
 * as on time, because the stored status is the only evidence there is.
 */
export function filingOutcome(filing: SuperInsightFiling, today: string): SuperFilingOutcome {
  if (isFiled(filing)) {
    const filed = dayOf(filing.filedOn);
    return filed && filed > filing.dueDate ? 'late' : 'on-time';
  }
  return filing.dueDate < today || filing.status === 'overdue' ? 'overdue' : 'open';
}

/* ------------------------------------------------------------------ *
 * Months
 * ------------------------------------------------------------------ */

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function buildMonths(
  clients: SuperInsightClient[],
  filings: SuperInsightFiling[],
  now: Date,
  count = 12,
): SuperMonth[] {
  const today = ymdOf(now);
  const months = new Map<string, SuperMonth & { coi: number[] }>();
  for (const key of monthKeys(now, count)) {
    months.set(key, {
      key,
      ...monthLabels(key),
      engagementsStarted: 0,
      certificatesIssued: 0,
      avgDaysToCoi: null,
      filingsDue: 0,
      filedOnTime: 0,
      filedLate: 0,
      overdue: 0,
      open: 0,
      coi: [],
    });
  }

  for (const client of clients) {
    const started = dayOf(client.summary.createdAt);
    const startMonth = started ? months.get(started.slice(0, 7)) : undefined;
    if (startMonth) startMonth.engagementsStarted += 1;

    if (client.startedPreInc && client.certificateDate) {
      const month = months.get(client.certificateDate.slice(0, 7));
      if (month) {
        month.certificatesIssued += 1;
        if (client.daysToCoi !== null) month.coi.push(client.daysToCoi);
      }
    }
  }

  for (const filing of filings) {
    const month = months.get(filing.dueDate.slice(0, 7));
    if (!month) continue;
    month.filingsDue += 1;
    const outcome = filingOutcome(filing, today);
    if (outcome === 'on-time') month.filedOnTime += 1;
    else if (outcome === 'late') month.filedLate += 1;
    else if (outcome === 'overdue') month.overdue += 1;
    else month.open += 1;
  }

  return [...months.values()].map(({ coi, ...month }) => ({ ...month, avgDaysToCoi: average(coi) }));
}

/* ------------------------------------------------------------------ *
 * Team
 * ------------------------------------------------------------------ */

export interface SuperStaffInput {
  id: string;
  name: string;
  email: string;
  role: string;
  internId: string | null;
  reportsToManagerId: string | null;
  status: string;
}

function openOf(summary: SuperEngagementSummary): number {
  return summary.ballInCourt.firm + summary.ballInCourt.client;
}

export function buildTeam(params: {
  staff: SuperStaffInput[];
  clients: SuperInsightClient[];
  filings: SuperInsightFiling[];
  lastActive: Map<string, string>;
  actions30d: Map<string, number>;
  /** This month's counts per person id; absent maps read as zero. */
  monthCounts?: { assigned?: Map<string, number>; reassigned?: Map<string, number>; approvals?: Map<string, number> };
  isAttention: (summary: SuperEngagementSummary) => boolean;
  now: Date;
}): SuperInsights['team'] {
  const { staff, clients, filings, lastActive, actions30d, isAttention, now } = params;
  const month = params.monthCounts ?? {};
  const today = ymdOf(now);

  const filingsByEngagement = new Map<string, SuperInsightFiling[]>();
  for (const filing of filings) {
    const list = filingsByEngagement.get(filing.engagementId) ?? [];
    list.push(filing);
    filingsByEngagement.set(filing.engagementId, list);
  }

  const leadRow = (person: SuperStaffInput): SuperTeamLead => {
    const mine = person.internId
      ? clients.filter((client) => client.leadIds.includes(person.internId!))
      : [];
    return {
      id: person.id,
      name: person.name,
      email: person.email,
      internId: person.internId,
      status: person.status,
      lastActiveAt: lastActive.get(person.id) ?? null,
      clients: mine.length,
      openSteps: mine.reduce((sum, client) => sum + openOf(client.summary), 0),
      overdueSteps: mine.reduce((sum, client) => sum + client.summary.steps.overdue, 0),
      attention: mine.filter((client) => isAttention(client.summary)).length,
    };
  };

  const leads = staff.filter((person) => person.role === 'intern');
  const managerIds = new Set(staff.filter((p) => p.role === 'manager').map((p) => p.id));

  const managers: SuperTeamManager[] = staff
    .filter((person) => person.role === 'manager')
    .map((person) => {
      const mine = clients.filter((client) => client.managerIds.includes(person.id));
      const myFilings = mine.flatMap((client) => filingsByEngagement.get(client.summary.id) ?? []);
      const outcomes = myFilings.map((filing) => filingOutcome(filing, today));
      return {
        id: person.id,
        name: person.name,
        email: person.email,
        status: person.status,
        lastActiveAt: lastActive.get(person.id) ?? null,
        clients: mine.length,
        incorporating: mine.filter((client) => !client.summary.incorporated).length,
        openSteps: mine.reduce((sum, client) => sum + openOf(client.summary), 0),
        overdueSteps: mine.reduce((sum, client) => sum + client.summary.steps.overdue, 0),
        approvalsPending: mine.reduce((sum, client) => sum + client.summary.approvalsPending, 0),
        attention: mine.filter((client) => isAttention(client.summary)).length,
        overdueFilings: outcomes.filter((o) => o === 'overdue').length,
        filedOnTime: outcomes.filter((o) => o === 'on-time').length,
        filedLate: outcomes.filter((o) => o === 'late').length,
        avgDaysToCoi: average(
          mine.flatMap((client) => (client.daysToCoi === null ? [] : [client.daysToCoi])),
        ),
        leads: leads
          .filter((lead) => lead.reportsToManagerId === person.id)
          .map(leadRow)
          .sort((a, b) => b.openSteps - a.openSteps || a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name));

  const unassignedLeads = leads
    .filter((lead) => !lead.reportsToManagerId || !managerIds.has(lead.reportsToManagerId))
    .map(leadRow)
    .sort((a, b) => b.openSteps - a.openSteps || a.name.localeCompare(b.name));

  const admins: SuperTeamAdmin[] = staff
    .filter((person) => person.role === 'admin' || person.role === 'super_admin')
    .map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role === 'super_admin' ? 'Super admin' : 'Admin',
      lastActiveAt: lastActive.get(person.id) ?? null,
      actions30d: actions30d.get(person.id) ?? 0,
      assignedMonth: month.assigned?.get(person.id) ?? 0,
      reassignedMonth: month.reassigned?.get(person.id) ?? 0,
      approvalsMonth: month.approvals?.get(person.id) ?? 0,
    }));

  return { managers, unassignedLeads, admins };
}

/* ------------------------------------------------------------------ *
 * Risks
 * ------------------------------------------------------------------ */

export type SuperRiskKind = 'step' | 'filing' | 'stuck' | 'owner' | 'lead';

export const SUPER_RISK_LABEL: Record<SuperRiskKind, string> = {
  step: 'Overdue step',
  filing: 'Overdue filing',
  stuck: 'Stuck',
  owner: 'No manager',
  lead: 'No one assigned',
};

/** A client with open work and no move for this many days is stuck. */
export const SUPER_STUCK_DAYS = 14;

export interface SuperRisk {
  id: string;
  kind: SuperRiskKind;
  title: string;
  engagementId: string;
  companyName: string;
  href: string;
  /** Primary manager's profile id, so a screen can name the admin over them. */
  managerId: string | null;
  managerName: string | null;
  leadName: string | null;
  /** Days overdue, idle or unassigned; null when no date says. */
  ageDays: number | null;
  /** 1 to 3, from the kind and the age. */
  severity: 1 | 2 | 3;
}

/* ------------------------------------------------------------------ *
 * Month-end history (R-18 trend lines and the change against last month)
 * ------------------------------------------------------------------ */

const OVERDUE_WINDOW_DAYS = 90;

/**
 * Overdue filings and the filed-on-time share at each month end, rebuilt from `due_date`,
 * `filed_on`, `created_at` and the `compliance.reopened` events. The rules match the live
 * tiles: overdue is not filed and due in the 90 days up to the moment; on time is over every
 * filing due in the 12-month report window by then, plus older ones still not filed. A filing
 * marked filed without a filed date cannot be placed in time, so it ends the series there.
 */
export function buildFilingHistory(
  rows: FilingHistoryRow[],
  reopens: FilingReopen[],
  periods: TrendPeriod[],
): SuperHistory {
  const overdue: Array<number | null> = [];
  const onTime: Array<number | null> = [];
  for (const period of periods) {
    const existed = rows.filter((row) => row.createdAt.getTime() < period.end.getTime());
    const due = existed.filter((row) => row.dueDate.slice(0, 10) <= period.ymd);
    const floor90 = new Date(Date.parse(`${period.ymd}T00:00:00Z`) - OVERDUE_WINDOW_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    overdue.push(
      countKnown(due, (row) => {
        if (row.dueDate.slice(0, 10) < floor90) return false;
        const filed = filedAsOf(row, reopens, period);
        return filed === null ? null : !filed;
      }),
    );

    const floor = windowFloor(new Date(`${period.ymd}T00:00:00Z`));
    let known = true;
    let total = 0;
    let good = 0;
    for (const row of due) {
      const filed = filedAsOf(row, reopens, period);
      if (filed === null) {
        known = false;
        break;
      }
      if (row.dueDate.slice(0, 10) < floor && filed) continue;
      total += 1;
      if (filed && row.filedOn && row.filedOn.slice(0, 10) <= row.dueDate.slice(0, 10)) good += 1;
    }
    onTime.push(known && total > 0 ? Math.round((good / total) * 100) : null);
  }
  return { overdueFilings: trailingKnown(overdue), filedOnTime: trailingKnown(onTime) };
}

/** "+2", "−3", "0": the change against last month for a tile's small text. */
export function changeText(live: number | null, past: number[] | undefined, unit = ''): string | undefined {
  const last = past?.[past.length - 1];
  if (live === null || last === undefined) return undefined;
  const d = live - last;
  const n = d > 0 ? `+${d}` : d < 0 ? `\u2212${Math.abs(d)}` : '0';
  return unit ? `${n} ${unit}` : n;
}

/** "Today", "1 day", "N days", or a dash when no date says (prototype `ageOf`). */
export function riskAgeLabel(ageDays: number | null): string {
  if (ageDays === null) return '–';
  if (ageDays === 0) return 'Today';
  return ageDays === 1 ? '1 day' : `${ageDays} days`;
}

function severityFor(kind: SuperRiskKind, age: number | null): 1 | 2 | 3 {
  if (kind === 'filing') return age !== null && age > 30 ? 3 : age !== null && age > 7 ? 2 : 1;
  if (kind === 'step') return 3;
  if (kind === 'stuck') return age !== null && age > 30 ? 3 : 2;
  return 2;
}

/** Overdue steps, overdue filings, stuck clients and clients with nobody on them. */
export function buildRisks(insights: Pick<SuperInsights, 'clients' | 'filings'>, now: Date): SuperRisk[] {
  const today = ymdOf(now);
  const out: SuperRisk[] = [];
  const byId = new Map(insights.clients.map((client) => [client.summary.id, client]));

  for (const client of insights.clients) {
    const s = client.summary;
    const base = {
      engagementId: s.id,
      companyName: s.companyName,
      managerId: s.managerId,
      managerName: s.managerName,
      leadName: s.leadName,
    };

    for (const step of client.overdueSteps) {
      out.push({
        ...base,
        id: `step:${s.id}:${step.id}`,
        kind: 'step',
        title: step.title,
        href: step.href,
        ageDays: s.idleDays,
        severity: severityFor('step', s.idleDays),
      });
    }

    const open = s.currentStep !== null;
    if (open && (s.stuckReason === 'blocked' || (s.idleDays ?? 0) >= SUPER_STUCK_DAYS)) {
      out.push({
        ...base,
        id: `stuck:${s.id}`,
        kind: 'stuck',
        title: s.currentStep ? `No move on ${s.currentStep.title}` : 'No move',
        href: s.href,
        ageDays: s.idleDays,
        severity: severityFor('stuck', s.idleDays),
      });
    }

    const createdDay = dayOf(s.createdAt);
    const sinceCreated = createdDay ? Math.max(0, daysBetweenDays(createdDay, today)) : null;
    if (open && client.managerIds.length === 0) {
      out.push({
        ...base,
        id: `owner:${s.id}`,
        kind: 'owner',
        title: 'No manager on this client',
        href: s.href,
        ageDays: sinceCreated,
        severity: severityFor('owner', sinceCreated),
      });
    }
    if (open && client.leadIds.length === 0) {
      out.push({
        ...base,
        id: `lead:${s.id}`,
        kind: 'lead',
        title: 'No project lead on this client',
        href: s.href,
        ageDays: sinceCreated,
        severity: severityFor('lead', sinceCreated),
      });
    }
  }

  for (const filing of insights.filings) {
    if (filingOutcome(filing, today) !== 'overdue') continue;
    const client = byId.get(filing.engagementId);
    const age = Math.max(0, daysBetweenDays(filing.dueDate, today));
    out.push({
      id: `filing:${filing.id}`,
      kind: 'filing',
      title: titleWithPeriod(filing.title, filing.periodLabel),
      engagementId: filing.engagementId,
      companyName: filing.companyName,
      href: filing.href,
      managerId: client?.summary.managerId ?? null,
      managerName: client?.summary.managerName ?? null,
      leadName: client?.summary.leadName ?? null,
      ageDays: age,
      severity: severityFor('filing', age),
    });
  }

  return out.sort(
    (a, b) =>
      b.severity - a.severity ||
      (b.ageDays ?? -1) - (a.ageDays ?? -1) ||
      a.companyName.localeCompare(b.companyName),
  );
}

/* ------------------------------------------------------------------ *
 * Registrations
 * ------------------------------------------------------------------ */

export interface SuperRegTypeCounts {
  id: string;
  title: string;
  done: number;
  progress: number;
  waiting: number;
  overdue: number;
  /** Clients for whom this registration applies (not marked not needed). */
  needed: number;
}

/** Per registration type: how many clients are done, working, waiting or overdue. */
export function registrationCounts(insights: Pick<SuperInsights, 'clients' | 'registrationTypes'>): SuperRegTypeCounts[] {
  return insights.registrationTypes.map((type) => {
    const row: SuperRegTypeCounts = { ...type, done: 0, progress: 0, waiting: 0, overdue: 0, needed: 0 };
    for (const client of insights.clients) {
      const cell = client.registrations[type.id];
      if (!cell || cell === 'not-needed') continue;
      row.needed += 1;
      if (cell === 'done') row.done += 1;
      else if (cell === 'progress') row.progress += 1;
      else if (cell === 'waiting') row.waiting += 1;
      else if (cell === 'overdue') row.overdue += 1;
    }
    return row;
  });
}

/** True when the client has reached the registration phase (any step settled or open). */
export function inRegistrations(client: SuperInsightClient): boolean {
  return Object.values(client.registrations).some((cell) => cell !== 'locked' && cell !== 'not-needed');
}

/* ------------------------------------------------------------------ *
 * Overview tiles and the Practice areas grid
 * ------------------------------------------------------------------ */

/**
 * Filings not filed and due in the 90 days before today: the same rule as the month-end
 * history (`buildFilingHistory`), so the tile and its change against last month agree.
 */
export function overdueFilingsNow(filings: SuperInsightFiling[], now: Date): number {
  const today = ymdOf(now);
  const floor = ymdOf(new Date(now.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS));
  return filings.filter((f) => f.dueDate < today && f.dueDate >= floor && !isFiled(f)).length;
}

/** Registration items still open (in progress, waiting or overdue) across every client. */
export function openRegistrations(insights: Pick<SuperInsights, 'clients' | 'registrationTypes'>): number {
  return registrationCounts(insights).reduce((sum, c) => sum + c.progress + c.waiting + c.overdue, 0);
}

export type SuperAreaHealth = 'On track' | 'Watch' | 'At risk';

export interface SuperPracticeArea {
  area: 'Incorporation' | 'Registrations' | 'Compliances';
  href: string;
  /** Clients with open work in the area. */
  active: number;
  /** Finished this calendar month; null when no stored date says (registration items). */
  doneThisMonth: number | null;
  /** Active clients with overdue work in the area. */
  overdue: number;
  health: SuperAreaHealth;
  /** The manager who holds most of the area's active clients. */
  leadManager: string | null;
}

/** On track with nothing overdue, Watch up to a fifth overdue, At risk above that. */
export function areaHealth(active: number, overdue: number): SuperAreaHealth {
  if (overdue === 0) return 'On track';
  return active > 0 && overdue / active <= 0.2 ? 'Watch' : 'At risk';
}

function mostCommon(names: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const n of names) if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best: string | null = null;
  let top = 0;
  for (const [n, c] of counts) {
    if (c > top) {
      best = n;
      top = c;
    }
  }
  return best;
}

/**
 * One row per practice area from stored states and dates. Incorporation: clients without a
 * certificate, certificates dated this month, and clients with an overdue step. Registrations:
 * clients with an open registration item and clients with an overdue one; items store no
 * finish date, so "done this month" stays empty. Compliances: clients with an unfiled filing,
 * filings filed this month, and clients with a filing past due.
 */
export function buildPracticeAreas(
  insights: Pick<SuperInsights, 'clients' | 'filings'>,
  hrefs: Record<SuperPracticeArea['area'], string>,
  now: Date,
): SuperPracticeArea[] {
  const today = ymdOf(now);
  const month = today.slice(0, 7);
  const byId = new Map(insights.clients.map((c) => [c.summary.id, c]));

  const incorporating = insights.clients.filter((c) => !c.summary.incorporated);
  const incOverdue = incorporating.filter((c) => c.summary.steps.overdue > 0 || c.overdueSteps.length > 0).length;

  const regOpen = insights.clients.filter((c) =>
    Object.values(c.registrations).some((cell) => cell === 'progress' || cell === 'waiting' || cell === 'overdue'),
  );
  const regOverdue = regOpen.filter((c) => Object.values(c.registrations).some((cell) => cell === 'overdue')).length;

  const openFilings = insights.filings.filter((f) => !isFiled(f));
  const compActive = new Set(openFilings.map((f) => f.engagementId));
  const compOverdue = new Set(openFilings.filter((f) => f.dueDate < today).map((f) => f.engagementId));
  const managerOf = (ids: Iterable<string>) => [...ids].map((id) => byId.get(id)?.summary.managerName ?? null);

  const row = (
    area: SuperPracticeArea['area'],
    active: number,
    doneThisMonth: number | null,
    overdue: number,
    managers: Array<string | null>,
  ): SuperPracticeArea => ({
    area,
    href: hrefs[area],
    active,
    doneThisMonth,
    overdue,
    health: areaHealth(active, overdue),
    leadManager: mostCommon(managers),
  });

  return [
    row(
      'Incorporation',
      incorporating.length,
      insights.clients.filter((c) => c.certificateDate?.slice(0, 7) === month).length,
      incOverdue,
      incorporating.map((c) => c.summary.managerName),
    ),
    row('Registrations', regOpen.length, null, regOverdue, regOpen.map((c) => c.summary.managerName)),
    row(
      'Compliances',
      compActive.size,
      insights.filings.filter((f) => isFiled(f) && f.filedOn?.slice(0, 7) === month).length,
      compOverdue.size,
      managerOf(compActive),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 * Capacity
 * ------------------------------------------------------------------ */

/** Capacity bands (prototype): over 80% red, 70 to 80% amber, under 70% blurple. */
export function capacityTone(pct: number): 'bad' | 'warn' | 'prog' {
  if (pct > 80) return 'bad';
  if (pct >= 70) return 'warn';
  return 'prog';
}

/** Open items left under the capacity, summed over the managers who have one set. */
export function roomAcross(managers: SuperTeamManager[], people: Map<string, { load: { open: number; capacity: number | null } }>): number | null {
  let room: number | null = null;
  for (const m of managers) {
    const load = people.get(m.id)?.load;
    if (load?.capacity == null) continue;
    room = (room ?? 0) + Math.max(0, load.capacity - load.open);
  }
  return room;
}

/** Median of a list of durations in ms, as "<1 h", "N h" or "N d"; a dash with none. */
export function medianResponse(ms: number[]): string {
  if (ms.length === 0) return '–';
  const sorted = [...ms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const hours = m / 3_600_000;
  if (hours < 1) return '<1 h';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
