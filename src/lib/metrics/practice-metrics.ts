/**
 * PRACTICE, PEOPLE AND ANALYTICS METRICS — pure builders and the shapes the screens read
 * (G-13, G-14, G-27, G-29).
 *
 * The repository (`src/db/repositories/metrics.ts`) gathers the scoped rows and hands them
 * here. Nothing in this module touches `db` or React, so views may import the types and every
 * number is unit-tested in `practice-metrics.test.ts`.
 *
 * Sources, all stored: the checklist gate (current step, phases, registration cells), the
 * step events (opened at, days in step, stage days), `engagements.expected_coi_on`, the
 * manager-set windows in `engagements.schedule` (a step's due date is its window's end), and
 * the filed-against-due history in `compliance_instances` and `compliance_events`.
 */

import type { StageAverage, StepTiming } from '@/lib/metrics/step-timing';
import {
  filingMonths,
  isOnTime,
  loadOf,
  onTimeStats,
  type FilingMonth,
  type FilingRecord,
  type LoadValue,
  type OnTimeStats,
} from '@/lib/metrics/filing-metrics';

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** Days an engagement has spent on its current step, and that step's due date. */
export interface CurrentStepDays {
  stepId: string;
  title: string;
  /** Whole days since the step was opened; null when no event records the opening. */
  days: number | null;
  /** The end of the manager-set window for the step (YYYY-MM-DD), when one is set. */
  dueOn: string | null;
}

export interface StageRow extends StageAverage {
  /** Company name of the slowest open stage. */
  slowestCompany: string | null;
}

export interface ExpectedCoiRow {
  engagementId: string;
  slug: string | null;
  companyName: string;
  managerName: string | null;
  /** YYYY-MM-DD */
  expectedOn: string;
  currentStepTitle: string | null;
  /** Steps done over all steps, for the phase bar. */
  phases: Array<{ label: string; done: number; total: number }>;
}

export type RegistrationCell = 'done' | 'progress' | 'waiting' | 'overdue' | 'not-needed' | 'locked';

export interface RegistrationTypeSplit {
  id: string;
  title: string;
  done: number;
  inProgress: number;
  pending: number;
}

export interface PracticeMetrics {
  generatedAt: string;
  incorporation: {
    /** Clients not yet incorporated. */
    clients: number;
    /** Clients by the phase their current step sits in. */
    stages: Array<{ phaseId: string; label: string; clients: number }>;
    /** Average days from the engagement start to the certificate, over the last 12 months. */
    avgDaysToCoi: number | null;
    certificates: number;
    stageDays: StageRow[];
    expected: ExpectedCoiRow[];
    /** The client that has been on one step the longest. */
    longestInStep: { engagementId: string; companyName: string; stepTitle: string; days: number } | null;
  };
  registrations: {
    done: number;
    /** The firm is working the registration (gate active, or overdue). */
    inProgress: number;
    /** The registration is waiting on the client. */
    pending: number;
    byType: RegistrationTypeSplit[];
    /** The registration type with the most pending. */
    mostPending: string | null;
  };
  compliances: {
    /** "October" */
    monthLabel: string;
    total: number;
    overdue: number;
    late: number;
    dueThisWeek: number;
    upcoming: number;
    onTime: number;
    /** The authority with the most overdue or late filings this month. */
    worstAuthority: string | null;
  };
  /** App engagement id → its current step's days. */
  currentStep: Record<string, CurrentStepDays>;
  /** App engagement id → step id → days in step, for every opened step not finished yet. */
  openStepDays: Record<string, Record<string, number>>;
}

export interface PersonMetrics {
  profileId: string;
  /** Scoping key of a project lead. */
  internId: string | null;
  role: 'manager' | 'intern';
  name: string;
  capacity: number | null;
  lastSeenAt: string | null;
  clients: number;
  /** Open steps on their clients plus unfiled filings due within 30 days or overdue. */
  openItems: number;
  load: LoadValue;
  /** Filings on their clients with `filed_on <= due_date`, over those filed in the last 12 months. */
  onTime: OnTimeStats;
}

export interface StepTimeMetric {
  stepId: string;
  title: string;
  medianDays: number | null;
  finished: number;
  longestDays: number | null;
  longestCompany: string | null;
}

export interface AnalyticsMetrics {
  generatedAt: string;
  months: FilingMonth[];
  /** On time over filed in the last 12 months. */
  onTime: OnTimeStats;
  stepTime: StepTimeMetric[];
  stageDays: StageRow[];
}

/* ------------------------------------------------------------------ *
 * Inputs
 * ------------------------------------------------------------------ */

export interface MetricClient {
  /** App engagement id. */
  id: string;
  slug: string | null;
  companyName: string;
  managerName: string | null;
  incorporated: boolean;
  /** Pre-incorporation start, so the firm ran the COI. */
  startedPreInc: boolean;
  createdAt: string;
  certificateDate: string | null;
  expectedCoiOn: string | null;
  phases: Array<{ id: string; label: string; done: number; total: number }>;
  currentStep: { id: string; title: string } | null;
  /** Gate-open steps (the firm's and the client's). */
  openSteps: number;
  /** Registration step id → cell. */
  registrations: Record<string, RegistrationCell>;
  /** Registration step id → manager-set window end. */
  windowEnd: (stepId: string) => string | null;
  managerIds: string[];
  leadIds: string[];
}

export interface MetricFiling extends FilingRecord {
  authority: string | null;
}

export interface MetricPerson {
  profileId: string;
  internId: string | null;
  role: 'manager' | 'intern';
  name: string;
  capacity: number | null;
  lastSeenAt: string | null;
}

/* ------------------------------------------------------------------ *
 * Builders
 * ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  return ymd(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** Index of the phase the client's current step sits in; -1 when every phase is done. */
export function currentPhaseIndex(client: Pick<MetricClient, 'phases'>): number {
  return client.phases.findIndex((phase) => phase.done < phase.total);
}

/** Current step days for every client with a current step. */
function currentStepDays(
  clients: MetricClient[],
  timings: Map<string, Record<string, StepTiming>>,
): Record<string, CurrentStepDays> {
  const out: Record<string, CurrentStepDays> = {};
  for (const client of clients) {
    if (!client.currentStep) continue;
    const timing = timings.get(client.id)?.[client.currentStep.id];
    out[client.id] = {
      stepId: client.currentStep.id,
      title: client.currentStep.title,
      days: timing && !timing.finishedAt ? timing.daysInStep : null,
      dueOn: client.windowEnd(client.currentStep.id),
    };
  }
  return out;
}

function withSlowestCompany(stages: StageAverage[], clients: MetricClient[]): StageRow[] {
  const names = new Map(clients.map((c) => [c.id, c.companyName]));
  return stages.map((stage) => ({
    ...stage,
    slowestCompany: stage.slowest ? (names.get(stage.slowest.engagementId) ?? null) : null,
  }));
}

export function buildPracticeMetrics(params: {
  clients: MetricClient[];
  filings: MetricFiling[];
  timings: Map<string, Record<string, StepTiming>>;
  stageDays: StageAverage[];
  registrationTypes: Array<{ id: string; title: string }>;
  now: Date;
}): PracticeMetrics {
  const { clients, filings, timings, stageDays, registrationTypes, now } = params;
  const today = ymd(now);
  const yearAgo = addDays(today, -365);

  /* Incorporation */
  const incorporating = clients.filter((c) => !c.incorporated);
  const phaseShape = clients[0]?.phases ?? [];
  const stages = phaseShape.map((phase, index) => ({
    phaseId: phase.id,
    label: phase.label,
    clients: incorporating.filter((c) => currentPhaseIndex(c) === index).length,
  }));
  const coiDays = clients.flatMap((c) => {
    if (!c.startedPreInc || !c.certificateDate || c.certificateDate < yearAgo) return [];
    const start = c.createdAt.slice(0, 10);
    const days = daysBetween(start, c.certificateDate);
    return days >= 0 ? [days] : [];
  });
  const expected = incorporating
    .filter((c) => c.expectedCoiOn)
    .sort((a, b) => (a.expectedCoiOn ?? '').localeCompare(b.expectedCoiOn ?? '') || a.companyName.localeCompare(b.companyName))
    .map((c) => ({
      engagementId: c.id,
      slug: c.slug,
      companyName: c.companyName,
      managerName: c.managerName,
      expectedOn: c.expectedCoiOn!,
      currentStepTitle: c.currentStep?.title ?? null,
      phases: c.phases.map((p) => ({ label: p.label, done: p.done, total: p.total })),
    }));

  const stepDays = currentStepDays(clients, timings);
  let longestInStep: PracticeMetrics['incorporation']['longestInStep'] = null;
  for (const c of incorporating) {
    const row = stepDays[c.id];
    if (!row || row.days === null) continue;
    if (!longestInStep || row.days > longestInStep.days) {
      longestInStep = { engagementId: c.id, companyName: c.companyName, stepTitle: row.title, days: row.days };
    }
  }

  /* Registrations (only clients whose registrations have started to matter: incorporated) */
  const byType: RegistrationTypeSplit[] = registrationTypes.map((type) => ({ ...type, done: 0, inProgress: 0, pending: 0 }));
  const typeIndex = new Map(byType.map((t) => [t.id, t]));
  for (const c of clients) {
    if (!c.incorporated) continue;
    for (const [stepId, cell] of Object.entries(c.registrations)) {
      const row = typeIndex.get(stepId);
      if (!row) continue;
      if (cell === 'done') row.done += 1;
      else if (cell === 'progress' || cell === 'overdue') row.inProgress += 1;
      else if (cell === 'waiting') row.pending += 1;
    }
  }
  const sum = (key: 'done' | 'inProgress' | 'pending') => byType.reduce((n, t) => n + t[key], 0);
  const mostPendingRow = [...byType].sort((a, b) => b.pending - a.pending)[0];

  /* Compliances this month */
  const monthKey = today.slice(0, 7);
  const weekEnd = addDays(today, 7);
  const thisMonth = filings.filter((f) => f.dueDate.slice(0, 7) === monthKey);
  const tally = { overdue: 0, late: 0, dueThisWeek: 0, upcoming: 0, onTime: 0 };
  const badByAuthority = new Map<string, number>();
  for (const f of thisMonth) {
    const onTime = isOnTime(f);
    let bad = false;
    if (onTime === true) tally.onTime += 1;
    else if (onTime === false) {
      tally.late += 1;
      bad = true;
    } else if (f.status === 'filed') tally.onTime += 1;
    else if (f.dueDate < today) {
      tally.overdue += 1;
      bad = true;
    } else if (f.dueDate <= weekEnd) tally.dueThisWeek += 1;
    else tally.upcoming += 1;
    if (bad && f.authority) badByAuthority.set(f.authority, (badByAuthority.get(f.authority) ?? 0) + 1);
  }
  const worst = [...badByAuthority.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    generatedAt: now.toISOString(),
    incorporation: {
      clients: incorporating.length,
      stages,
      avgDaysToCoi: average(coiDays),
      certificates: coiDays.length,
      stageDays: withSlowestCompany(stageDays, clients),
      expected,
      longestInStep,
    },
    registrations: {
      done: sum('done'),
      inProgress: sum('inProgress'),
      pending: sum('pending'),
      byType: byType.filter((t) => t.done + t.inProgress + t.pending > 0),
      mostPending: mostPendingRow && mostPendingRow.pending > 0 ? mostPendingRow.title : null,
    },
    compliances: {
      monthLabel: MONTH_LONG[now.getUTCMonth()] ?? '',
      total: thisMonth.length,
      ...tally,
      worstAuthority: worst ? worst[0] : null,
    },
    currentStep: stepDays,
    openStepDays: openStepDays(timings),
  };
}

/** Days in step for every opened step that has not finished. */
function openStepDays(timings: Map<string, Record<string, StepTiming>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [engagementId, steps] of timings) {
    for (const [stepId, timing] of Object.entries(steps)) {
      if (timing.finishedAt || timing.daysInStep === null) continue;
      (out[engagementId] ??= {})[stepId] = timing.daysInStep;
    }
  }
  return out;
}

/** Unfiled and due within 30 days, or already overdue. */
function isOpenFiling(f: FilingRecord, horizon: string): boolean {
  return !f.filedOn && f.status !== 'filed' && f.dueDate <= horizon;
}

export function buildPeopleMetrics(params: {
  people: MetricPerson[];
  clients: MetricClient[];
  filings: MetricFiling[];
  now: Date;
}): PersonMetrics[] {
  const { people, clients, filings, now } = params;
  const today = ymd(now);
  const horizon = addDays(today, 30);
  const since = addDays(today, -365);
  const byEngagement = new Map<string, MetricFiling[]>();
  for (const f of filings) {
    const list = byEngagement.get(f.engagementId) ?? [];
    list.push(f);
    byEngagement.set(f.engagementId, list);
  }
  return people.map((person) => {
    const mine = clients.filter((c) =>
      person.role === 'manager'
        ? c.managerIds.includes(person.profileId)
        : Boolean(person.internId) && c.leadIds.includes(person.internId!),
    );
    const myFilings = mine.flatMap((c) => byEngagement.get(c.id) ?? []);
    const openItems =
      mine.reduce((n, c) => n + c.openSteps, 0) + myFilings.filter((f) => isOpenFiling(f, horizon)).length;
    return {
      ...person,
      clients: mine.length,
      openItems,
      load: loadOf(openItems, person.capacity),
      onTime: onTimeStats(myFilings, since),
    };
  });
}

export function buildAnalyticsMetrics(params: {
  clients: MetricClient[];
  filings: MetricFiling[];
  stepRows: Array<{ stepId: string; medianDays: number | null; finished: number; longest: { engagementId: string; days: number } | null }>;
  stepTitle: (stepId: string) => string;
  stageDays: StageAverage[];
  months: number;
  now: Date;
}): AnalyticsMetrics {
  const { clients, filings, stepRows, stepTitle, stageDays, months, now } = params;
  const names = new Map(clients.map((c) => [c.id, c.companyName]));
  const since = addDays(ymd(now), -365);
  return {
    generatedAt: now.toISOString(),
    months: filingMonths(filings, now, months),
    onTime: onTimeStats(filings, since),
    stepTime: stepRows
      .map((row) => ({
        stepId: row.stepId,
        title: stepTitle(row.stepId),
        medianDays: row.medianDays,
        finished: row.finished,
        longestDays: row.longest?.days ?? null,
        longestCompany: row.longest ? (names.get(row.longest.engagementId) ?? null) : null,
      }))
      .sort((a, b) => (b.longestDays ?? -1) - (a.longestDays ?? -1) || (b.medianDays ?? -1) - (a.medianDays ?? -1)),
    stageDays: withSlowestCompany(stageDays, clients),
  };
}
