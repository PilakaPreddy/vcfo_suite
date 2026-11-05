import { sep } from '@/lib/date-format';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { buildIncorporationModel, type PortalPhase, type PortalStep } from '@/lib/client-portal/step-model';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';

/**
 * RECORD TIMELINE MODEL (R-21; prototype `ganttOf`, `GanttTimeline`): the Gantt rows of one
 * client's incorporation, derived only from stored data.
 *
 *   - The phases, their steps and their done or open state come from the same step model the
 *     client portal reads (`buildIncorporationModel`), so staff and client see one plan.
 *   - Plan windows are the manager's windows (`engagements.schedule`): the incorporation window
 *     covers SPICe+ Part A and Part B, a step's own window narrows Part A, and Post-incorporation
 *     and Registration run from the COI to the latest step date in the phase. These are the same
 *     rules as the client Incorporation timeline (`phPlan` in the client portal).
 *   - The COI is the real incorporation date, else the expected COI the firm set, else the end of
 *     the incorporation window.
 *   - Done dates are the step slices' own dates (approval, completion, delivery, review).
 *
 * A row without any date draws no bar; the card shows its empty state when no row has one. Pure:
 * no React, no `db`, unit-tested in `timeline-model.test.ts`.
 */

export type BarKind = 'done' | 'late' | 'cur' | 'rest' | 'plan';
export type RowStatus = 'done' | 'current' | 'planned';

export interface TimelineBar {
  /** ISO dates (yyyy-mm-dd), inclusive. */
  from: string;
  to: string;
  kind: BarKind;
}

export interface TimelineRow {
  id: string;
  name: string;
  status: RowStatus;
  bars: TimelineBar[];
  /** The orange COI diamond (R-21). */
  milestone?: string;
  /** Right column on the compliance-stage timeline: "5/5". */
  count?: string;
  /** Right column note, red when `bad`: "Overdue". */
  note?: { text: string; bad?: boolean };
  /** Text after the last bar or the diamond on the incorporating timeline: "Done 28 Sep", "3/9". */
  label?: string;
  /** The phase this row stands for, when it is one (`pre-inc-phase-1`, …). */
  phaseId?: string;
}

export interface RecordTimeline {
  /** Axis start and end (ISO). Null when no row has a date. */
  start: string | null;
  end: string | null;
  ticks: string[];
  rows: TimelineRow[];
  /** True before the certificate: names are wide, labels sit after the bars, no count column. */
  incorporating: boolean;
  /** The COI date the timeline draws, and where it comes from. */
  coi: { on: string; source: 'actual' | 'expected' | 'window' } | null;
}

export interface RecordTimelineInput {
  state: Record<string, ChecklistItemStateSlice | undefined> | undefined;
  schedule?: EngagementSchedule | null;
  expectedCoiOn?: string | null;
  incorporationDate?: string | null;
  /** ISO date; defaults to today (UTC). */
  today?: string;
}

const DAY = 86_400_000;
const MCA_REVIEW_STEP_IDS = ['pre-11', 'pre-12'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ymd(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
}

/** "14 Oct" (R-29). */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return sep(`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`);
}

/** Position of a date on the axis, 0 to 1. */
export function axisFraction(iso: string, start: string, end: string): number {
  const span = daysBetween(start, end);
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, daysBetween(start, iso) / span));
}

const PHASE_NAMES: Record<string, { inc: string; after: string }> = {
  'pre-inc-phase-1': { inc: 'Phase 1 · Name application', after: 'Name application' },
  'pre-inc-phase-2': { inc: 'Phase 2 · Incorporation', after: 'Incorporation' },
  'post-inc-phase-3': { inc: 'Phase 3 · Post-incorporation', after: 'Post-incorporation' },
  'registration-phase-4': { inc: 'Phase 4 · Registrations', after: 'Registrations' },
};

function doneEnd(steps: readonly PortalStep[]): string | undefined {
  return steps.map((s) => s.doneOn).filter(Boolean).sort().at(-1) as string | undefined;
}

/** The phase's plan window, by the client timeline's rules. */
function planOf(p: PortalPhase, coi: string | undefined): [string, string] | null {
  if (p.no === 1) {
    const own = p.steps.filter((s) => s.ownWindow && s.due);
    if (own.length) {
      return [own.map((s) => s.windowFrom ?? s.due!).sort()[0]!, own.map((s) => s.due!).sort().at(-1)!];
    }
  }
  if (p.no <= 2) return p.start && p.end ? [p.start, p.end] : null;
  const dates = p.steps.map((s) => s.due ?? s.doneOn).filter(Boolean).sort() as string[];
  const end = dates.at(-1);
  const start = coi ?? p.start;
  if (!start) return null;
  if (!end) return [start, addDays(start, p.no === 3 ? 30 : 45)];
  return start <= end ? [start, end] : [end, start];
}

/**
 * Bars of one phase (R-21). A done phase is green to its last done date, with a red tail when it
 * finished after the plan. The current phase is solid blurple for its done share and blurple
 * hatch for the rest, with a red tail when today is past the plan. A later phase is a grey plan.
 */
function barsOf(p: PortalPhase, plan: [string, string] | null, today: string): TimelineBar[] {
  if (!plan) return [];
  const [from, to] = plan;
  if (p.state === 'done') {
    const end = doneEnd(p.steps);
    if (end && end > to) return [{ from, to, kind: 'done' }, { from: to, to: end, kind: 'late' }];
    return [{ from, to: end && end >= from ? end : to, kind: 'done' }];
  }
  if (p.state === 'active') {
    const span = Math.max(1, daysBetween(from, to));
    const share = p.total ? p.done / p.total : 0;
    const cut = addDays(from, Math.round(span * share));
    const out: TimelineBar[] = [];
    if (cut > from) out.push({ from, to: cut, kind: 'cur' });
    if (cut < to) out.push({ from: cut, to, kind: 'rest' });
    if (today > to) out.push({ from: to, to: today, kind: 'late' });
    return out;
  }
  return [{ from, to, kind: 'plan' }];
}

function statusOf(p: PortalPhase): RowStatus {
  return p.state === 'done' ? 'done' : p.state === 'active' ? 'current' : 'planned';
}

function isLate(p: PortalPhase, plan: [string, string] | null, today: string): boolean {
  if (p.state === 'done') return false;
  return p.steps.some((s) => s.late) || (p.state === 'active' && !!plan && today > plan[1]);
}

/** Monday ticks across the axis, every week, or every second or fourth week when the labels would touch. */
function ticksOf(start: string, end: string): string[] {
  const span = daysBetween(start, end);
  const every = span > 224 ? 28 : span > 112 ? 14 : 7;
  const first = new Date(`${start}T00:00:00Z`);
  const toMonday = (8 - first.getUTCDay()) % 7;
  const out: string[] = [];
  for (let t = addDays(start, toMonday || 7); t <= addDays(end, -2); t = addDays(t, every)) out.push(t);
  return out;
}

export function buildRecordTimeline(input: RecordTimelineInput): RecordTimeline {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const model = buildIncorporationModel(input.state, input.schedule ?? null, today);
  const actual = ymd(input.incorporationDate);
  const expected = ymd(input.expectedCoiOn);
  const windowEnd = ymd(input.schedule?.incorporation?.to);
  const coi = actual
    ? { on: actual, source: 'actual' as const }
    : expected
      ? { on: expected, source: 'expected' as const }
      : windowEnd
        ? { on: windowEnd, source: 'window' as const }
        : null;
  const incorporating = !actual;

  const plans = model.phases.map((p) => planOf(p, coi?.on));
  // Part B starts where Part A's plan ends (prototype PLAN[2]).
  const a = plans[0];
  const b = plans[1];
  if (a && b && b[0] < a[1] && a[1] < b[1]) plans[1] = [a[1], b[1]];

  const phaseRow = (p: PortalPhase, i: number): TimelineRow => {
    const plan = plans[i] ?? null;
    const names = PHASE_NAMES[p.id] ?? { inc: p.title, after: p.name };
    const status = statusOf(p);
    const late = isLate(p, plan, today);
    const end = doneEnd(p.steps);
    return {
      id: p.id,
      phaseId: p.id,
      name: incorporating ? names.inc : names.after,
      status,
      bars: barsOf(p, plan, today),
      count: `${p.done}/${p.total}`,
      note: late ? { text: 'Stuck', bad: true } : undefined,
      label: status === 'done' ? (end ? `Done ${shortDate(end)}` : 'Done') : status === 'current' ? `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` : undefined,
    };
  };

  const rows: TimelineRow[] = [];
  const [p1, p2, p3] = model.phases;
  if (incorporating) {
    if (p1) rows.push(phaseRow(p1, 0));
    if (p2) rows.push(phaseRow(p2, 1));
    // MCA review: the two MCA steps of Part B, drawn on their own windows when the manager set them.
    const mca = MCA_REVIEW_STEP_IDS.map((id) => model.byId[id]).filter(Boolean) as PortalStep[];
    if (mca.length) {
      const froms = mca.map((s) => s.windowFrom).filter(Boolean).sort() as string[];
      const dues = mca.map((s) => s.due).filter(Boolean).sort() as string[];
      const allDone = mca.every((s) => s.kind === 'done');
      const open = mca.some((s) => s.kind === 'with' || s.kind === 'you' || s.kind === 'prog');
      const from = froms[0];
      const to = dues.at(-1);
      const end = doneEnd(mca);
      rows.push({
        id: 'mca-review',
        name: 'MCA review',
        status: allDone ? 'done' : open ? 'current' : 'planned',
        bars: from && to ? [{ from, to: allDone && end ? end : to, kind: allDone ? 'done' : open ? 'cur' : 'plan' }] : [],
        label: allDone ? (end ? `Done ${shortDate(end)}` : 'Done') : undefined,
      });
    }
    if (coi) {
      rows.push({ id: 'coi', name: 'COI', status: 'planned', bars: [], milestone: coi.on, label: shortDate(coi.on) });
    }
    if (p3) rows.push(phaseRow(p3, 2));
  } else {
    model.phases.forEach((p, i) => {
      const row = phaseRow(p, i);
      if (p.id === 'pre-inc-phase-2' && coi) row.milestone = coi.on;
      rows.push(row);
    });
  }

  const dates = rows.flatMap((r) => [...r.bars.flatMap((bar) => [bar.from, bar.to]), ...(r.milestone ? [r.milestone] : [])]);
  if (!dates.length) return { start: null, end: null, ticks: [], rows, incorporating, coi };
  dates.push(today);
  dates.sort();
  const start = addDays(dates[0]!, -7);
  const end = addDays(dates.at(-1)!, 7);
  return { start, end, ticks: ticksOf(start, end), rows, incorporating, coi };
}
