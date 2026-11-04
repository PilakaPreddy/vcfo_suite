/**
 * Home (client portal v7) — pure builders that turn the three real reads
 * (step model, ClientOverview, ClientHome) into what each prototype card draws.
 * No React, no fetch. Every value here comes from data; nothing is invented.
 */
import { getChecklistStepTimelineLabel, getItem } from '@/data/checklist';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { isReviewRejected } from '@/lib/checklist/checklist-item-review';
import { approvalStateOf } from '@/lib/checklist/checklist-step-approval';
import { isClientFillAwaitingClient } from '@/lib/checklist/checklist-client-fill';
import { complianceGroupForAuthority, type ClientOverview, type ComplianceGroup } from '@/lib/client/client-overview';
import type { PortalIncorporationModel, PortalStep } from '@/lib/client-portal/step-model';
import type { ClientHome, HomeFiling, NeedKind, TimelinePhaseDates } from '@/lib/client/client-home';
import type { DrillConfig, DrillRow, DrillStepMeta } from '@/components/client-portal/PortalProvider';
import { phaseHref, portalHref, stepHref } from '@/components/client-portal/routes';

export type Tone = 'ok' | 'due' | 'over' | 'prog' | 'up';

/* ------------------------------------------------------------------ dates */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ymd(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}
function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y: y!, m: m! - 1, d: d! };
}
/** "9 Oct" */
export function dShort(iso?: string): string {
  if (!iso) return '—';
  const p = parts(iso);
  return `${p.d} ${MON[p.m]}`;
}
/** "9 Oct 2026" */
export function dLong(iso?: string): string {
  if (!iso) return '—';
  const p = parts(iso);
  return `${p.d} ${MON[p.m]} ${p.y}`;
}
export function days(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
function plural(n: number, w: string) {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}
/** "Due 14 Oct" / "Today" / "Overdue 1 day". Statutory dates show the date,
    never "in N days" (K-13, rule R-29). */
function rel(today: string, iso: string): string {
  const n = days(today, iso);
  if (n < 0) return `Overdue ${plural(-n, 'day')}`;
  if (n === 0) return 'Today';
  return `Due ${dShort(iso)}`;
}

export const chipBg = (t: Tone) => `var(--${t}-chip)`;

/* -------------------------------------------------------------- steps */

const STEP_STATUS: Record<string, [string, Tone]> = {
  done: ['Completed', 'ok'],
  you: ['Waiting', 'due'],
  prog: ['In progress', 'prog'],
  with: ['In progress', 'prog'],
  next: ['Upcoming', 'up'],
  up: ['Upcoming', 'up'],
};

function stepStatus(s: PortalStep): [string, Tone] {
  if (s.late && s.kind !== 'done') return ['Overdue', 'over'];
  return STEP_STATUS[s.kind] ?? ['Upcoming', 'up'];
}

function stepTimelineText(s: PortalStep): string {
  return getChecklistStepTimelineLabel(s.item);
}

/** The ST5 part of a step row in a drill (C-138): mark, "Step n", owner chip, red date when late. */
function stepDrillMeta(s: PortalStep): DrillStepMeta {
  const late = Boolean(s.late && s.kind !== 'done');
  const live = s.kind === 'you' || s.kind === 'prog' || s.kind === 'with';
  return {
    n: s.n,
    state: s.kind === 'done' ? 'done' : live ? 'now' : 'next',
    tone: late ? 'bad' : s.kind === 'you' ? 'teal' : 'prog',
    owner: s.owner === 'client' ? 'client' : s.owner === 'mca' ? 'mca' : 'sbc',
    late,
  };
}

function stepDateLabel(s: PortalStep): string {
  if (s.kind === 'done') return s.doneOn ? dShort(s.doneOn) : 'Done';
  return s.due ? dShort(s.due) : '—';
}

/** Rows for the "Incorporation steps" drill: All / Completed / In progress / Waiting / Upcoming. */
export function spiceStepsDrill(model: PortalIncorporationModel, company: string, active: number): DrillConfig {
  const steps = model.steps.filter((s) => s.phaseNo <= 2);
  const row = (s: PortalStep): DrillRow => {
    const [label, tone] = stepStatus(s);
    return { title: s.title, meta: stepDateLabel(s), chip: label, chipColor: chipBg(tone), step: stepDrillMeta(s), href: stepHref(s.id) };
  };
  const by = (f: (s: PortalStep) => boolean) => steps.filter(f).map(row);
  return {
    title: 'Incorporation steps',
    active,
    tabs: [
      { label: 'All', rows: steps.map(row) },
      { label: 'Completed', rows: by((s) => s.kind === 'done') },
      { label: 'In progress', rows: by((s) => s.kind === 'prog' || s.kind === 'with') },
      { label: `Waiting for ${company}`, rows: by((s) => s.kind === 'you') },
      { label: 'Upcoming', rows: by((s) => s.kind === 'up' || s.kind === 'next') },
    ],
    link: { lead: 'These items live in Incorporation', text: 'Open Incorporation →', href: portalHref('incorporation'), where: 'Incorporation' },
  };
}

/* ------------------------------------------------------------- needs */

export interface NeedRow {
  key: string;
  title: string;
  /** (i) text: step / filing it belongs to. */
  sub: string;
  kind: NeedKind;
  due?: string;
  stepId?: string;
  stepN?: number;
  requestId?: string;
  askedBy?: string;
  href?: string;
  createdAt?: string;
  /** Why it was asked / sent back (request detail or rejection note). */
  note?: string;
  /** Short "where" for the phone sub-line: "Step 7", "ADT-1", "Payroll" (may be empty). */
  area: string;
}

function needArea(step: PortalStep | undefined, filing: HomeFiling | undefined): string {
  if (step) {
    if (step.phaseNo <= 2) return `Step ${step.n}`;
    const code = /\(([^)]{2,12})\)\s*$/.exec(step.title)?.[1];
    return code ?? step.title.replace(/\s+(Filing|Registration|Appointment)$/i, '');
  }
  if (filing) return groupOf(filing);
  return '';
}

export function buildNeeds(model: PortalIncorporationModel, home: ClientHome | undefined, filingsById: Map<string, HomeFiling>): NeedRow[] {
  const out: NeedRow[] = [];
  for (const r of home?.needs ?? []) {
    const step = r.stepId ? model.byId[r.stepId] : undefined;
    const filing = r.complianceInstanceId ? filingsById.get(r.complianceInstanceId) : undefined;
    const due = r.dueDate ?? (filing ? filing.dueDate : step?.due);
    out.push({
      key: `req:${r.id}`,
      title: r.title,
      sub: step ? step.title : filing ? `${filing.title}${filing.periodLabel ? ` · ${filing.periodLabel}` : ''}` : r.detail ?? 'Requested by SBC',
      kind: r.kind,
      due,
      stepId: step?.id,
      stepN: step?.n,
      requestId: r.id,
      askedBy: r.requestedByName,
      href: step ? stepHref(step.id) : filing ? portalHref('compliances') : portalHref('documents'),
      createdAt: r.createdAt,
      note: r.detail?.trim() || undefined,
      area: needArea(step, filing),
    });
  }
  // A client step the client has started but not sent (`prog`) is still waiting on the client,
  // so it is a "Fill" need too; this matches the step holder rule behind the trend lines.
  for (const s of model.steps) {
    if (s.kind !== 'you' && s.kind !== 'prog') continue;
    const slice = s.slice;
    let kind: NeedKind = 'fill';
    let title = s.title;
    if (isReviewRejected(slice)) {
      kind = 'correct';
      const note = slice?.rejectionNote?.trim();
      title = note ? (note.length > 48 ? `${note.slice(0, 46)}…` : note) : `${s.title} — sent back`;
    } else if (approvalStateOf(slice) === 'pending_client') {
      kind = 'sign';
      title = `Approve ${s.title}`;
    } else if (isClientFillAwaitingClient(slice?.clientFillRequest)) {
      kind = 'fill';
    }
    out.push({ key: `step:${s.id}`, title, sub: s.title, kind, due: s.due, stepId: s.id, stepN: s.n, href: stepHref(s.id), area: needArea(s, undefined), note: kind === 'correct' ? slice?.rejectionNote?.trim() || undefined : undefined });
  }
  return out;
}

const NEED_TABS: [NeedKind, string][] = [
  ['upload', 'Upload'],
  ['fill', 'Fill'],
  ['correct', 'Correct'],
  ['sign', 'Sign'],
];

/* ---------------------------------------------------------- filings */

export type FilingBucket = 'filed' | 'dueSoon' | 'overdue' | 'upcoming';
const DUE_SOON_DAYS = 15;

export function bucketOf(f: HomeFiling, today: string): FilingBucket {
  if (f.status === 'filed' || f.filedOn) return 'filed';
  if (f.status === 'overdue' || f.dueDate < today) return 'overdue';
  if (days(today, f.dueDate) <= DUE_SOON_DAYS) return 'dueSoon';
  return 'upcoming';
}
export const BUCKET_LABEL: Record<FilingBucket, string> = { filed: 'Filed', dueSoon: 'Due soon', overdue: 'Overdue', upcoming: 'Upcoming' };
const BUCKET_TONE: Record<FilingBucket, Tone> = { filed: 'ok', dueSoon: 'due', overdue: 'over', upcoming: 'up' };
export const BUCKETS: FilingBucket[] = ['filed', 'dueSoon', 'overdue', 'upcoming'];

export const AREA_ORDER: ComplianceGroup[] = ['MCA', 'GST', 'Income tax', 'Payroll', 'FEMA', 'Other'];
export const AREA_NAME: Record<ComplianceGroup, string> = {
  MCA: 'MCA / ROC',
  GST: 'GST',
  'Income tax': 'Income tax / TDS',
  Payroll: 'Payroll (PF / ESI / PT)',
  FEMA: 'FEMA / RBI',
  Other: 'Other',
};
export const groupOf = (f: HomeFiling) => complianceGroupForAuthority(f.authority);

export function filingName(f: HomeFiling, withPeriod = true): string {
  return withPeriod && f.periodLabel ? `${f.title} · ${f.periodLabel}` : f.title;
}

const PORTALS: Record<string, [string, string]> = {
  GST: ['https://www.gst.gov.in', 'GST portal'],
  'Income tax': ['https://www.incometax.gov.in', 'Income-tax portal'],
  Payroll: ['https://unifiedportal-emp.epfindia.gov.in', 'EPFO portal'],
  MCA: ['https://www.mca.gov.in', 'MCA portal'],
  FEMA: ['https://firms.rbi.org.in', 'RBI FIRMS'],
};
export function filingPortal(f: HomeFiling): [string, string] | undefined {
  const a = f.authority.trim().toUpperCase();
  if (a === 'ESIC') return ['https://www.esic.gov.in', 'ESIC portal'];
  if (a === 'PT') return undefined;
  if (a === 'IT' || a === 'INCOME TAX' || a === 'CBDT') {
    if (/tds|24q|26q|27q/i.test(f.title)) return ['https://www.tdscpc.gov.in', 'TRACES'];
  }
  return PORTALS[groupOf(f)];
}

export function filingRow(f: HomeFiling, today: string): DrillRow {
  const b = bucketOf(f, today);
  return {
    title: filingName(f),
    meta: b === 'filed' && f.filedOn ? `Filed ${dShort(f.filedOn)}` : dShort(f.dueDate),
    chip: BUCKET_LABEL[b],
    chipColor: chipBg(BUCKET_TONE[b]),
    href: portalHref('filings'),
  };
}

export function complianceDrill(rows: HomeFiling[], today: string, fyLabel: string, active: number, title?: string): DrillConfig {
  const by = (b: FilingBucket) => rows.filter((f) => bucketOf(f, today) === b).map((f) => filingRow(f, today));
  return {
    title: title ?? `Compliances · ${fyLabel}`,
    active,
    tabs: [
      { label: 'All', rows: rows.map((f) => filingRow(f, today)) },
      { label: 'Filed', rows: by('filed') },
      { label: 'Due soon', rows: by('dueSoon') },
      { label: 'Overdue', rows: by('overdue') },
      { label: 'Upcoming', rows: by('upcoming') },
    ],
    link: { lead: 'These items live in Filings', text: 'Open Filings →', href: portalHref('filings'), where: 'Filings' },
  };
}

/* ---------------------------------------------------------- alerts */

export interface AlertRow {
  key: string;
  title: string;
  meta: string;
  date: string;
  tone: Tone;
  href: string;
  /** The hero (overdue) row's button. */
  action?: string;
  /** The Needs row this alert repeats, when it comes from one (C-02: the card drops it then). */
  needKey?: string;
}

/**
 * The needs the home card's Overdue tile counts and Needs puts first: a correction SBC sent
 * back, or any open need past its due date (HM-01).
 */
export function isOverdueNeed(n: NeedRow, today: string): boolean {
  return n.kind === 'correct' || Boolean(n.due && n.due < today);
}

/** Needs in the order Needs from <company> shows them: sent back or late first, then by due date. */
export function sortNeeds(needs: NeedRow[], today: string): NeedRow[] {
  return [...needs].sort(
    (a, b) => Number(isOverdueNeed(b, today)) - Number(isOverdueNeed(a, today)) || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
  );
}

export function buildAlerts(
  after: boolean,
  today: string,
  model: PortalIncorporationModel,
  needs: NeedRow[],
  filings: HomeFiling[],
  company: string,
): { hero?: AlertRow; rows: AlertRow[] } {
  const rows: AlertRow[] = [];
  let hero: AlertRow | undefined;
  if (!after) {
    // Overdue needs first (the set the greeting's Overdue count holds): a
    // sent-back correction, or any open need past its due date (HM-01).
    const overdueNeed = needs
      .filter((n) => (n.kind === 'correct' && n.key.startsWith('req:')) || (n.due && n.due < today))
      .sort((a, b) => (a.kind === 'correct' ? 0 : 1) - (b.kind === 'correct' ? 0 : 1) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))[0];
    const rejected = model.steps.find((s) => s.kind === 'you' && isReviewRejected(s.slice));
    if (overdueNeed) {
      hero = {
        key: `needhero:${overdueNeed.key}`,
        title: overdueNeed.kind === 'correct' ? `${overdueNeed.title} sent back` : `${overdueNeed.title} overdue`,
        meta: `${overdueNeed.kind === 'correct' && overdueNeed.note ? overdueNeed.note : overdueNeed.sub} · waiting on ${company}`,
        date: overdueNeed.due ?? ymd(overdueNeed.createdAt) ?? today,
        tone: 'over',
        href: overdueNeed.href ?? portalHref('documents'),
        action: overdueNeed.kind === 'correct' ? 'Fix' : overdueNeed.kind === 'upload' ? 'Upload' : 'Open',
        needKey: overdueNeed.key,
      };
    } else if (rejected) {
      const at = ymd(rejected.slice?.reviewedAt) ?? rejected.due ?? today;
      const note = rejected.slice?.rejectionNote?.trim();
      hero = {
        key: `rej:${rejected.id}`,
        title: `${rejected.title} sent back`,
        meta: `${note ? `${note} · ` : ''}waiting on ${company}`,
        date: at,
        tone: 'over',
        href: stepHref(rejected.id),
        action: 'Fix',
        needKey: `step:${rejected.id}`,
      };
    } else {
      const late = model.steps.find((s) => s.late && (s.kind === 'you' || s.kind === 'prog'));
      if (late && late.due) {
        // A late step the client fills is also a Needs row (`step:<id>`); a step in progress is not.
        const needKey = needs.some((n) => n.key === `step:${late.id}`) ? `step:${late.id}` : undefined;
        hero = { key: `late:${late.id}`, title: `${late.title} is late`, meta: `Step ${late.n} · waiting on ${company}`, date: late.due, tone: 'over', href: stepHref(late.id), action: 'Continue', needKey };
      }
    }
    // open needs with a date, grouped by step
    const groups = new Map<string, NeedRow[]>();
    for (const n of needs) {
      if (!n.due || n.due < today || n.key.startsWith('step:')) continue;
      const k = n.stepId ?? n.key;
      groups.set(k, [...(groups.get(k) ?? []), n]);
    }
    for (const [k, list] of groups) {
      const due = list.map((n) => n.due!).sort()[0]!;
      rows.push({
        key: `need:${k}`,
        title: list.length > 1 ? `${list.length} documents` : list[0]!.title,
        meta: list[0]!.sub,
        date: due,
        tone: days(today, due) <= 7 ? 'due' : 'prog',
        href: list[0]!.href ?? portalHref('documents'),
      });
    }
    // client steps with a date
    for (const s of model.steps) {
      if ((s.kind !== 'you' && s.kind !== 'prog') || !s.due || s.due < today) continue;
      if (rows.some((r) => r.key === `need:${s.id}`)) continue;
      rows.push({ key: `step:${s.id}`, title: s.title, meta: `Step ${s.n} · ${company} fills this`, date: s.due, tone: days(today, s.due) <= 7 ? 'due' : 'prog', href: stepHref(s.id) });
    }
    // approved name expiry (pre-5) while SPICe+ Part B is not filed
    const pre5 = getItem('pre-5');
    const filed = model.byId['pre-10']?.kind === 'done' || model.byId['pre-12']?.kind === 'done';
    if (pre5 && !filed) {
      const exp = ymd(extractItemResponses(pre5, model.byId['pre-5']?.slice ?? null).nameApprovalExpiryDate);
      if (exp && exp >= today) rows.push({ key: 'name-expiry', title: 'Approved name expires', meta: 'File Part B before', date: exp, tone: days(today, exp) <= 7 ? 'due' : 'prog', href: stepHref('pre-10') });
    }
  } else {
    const open = filings.filter((f) => bucketOf(f, today) !== 'filed');
    const over = open.filter((f) => bucketOf(f, today) === 'overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const h = over[0];
    if (h) {
      const late = days(h.dueDate, today);
      hero = {
        key: `fil:${h.id}`,
        title: `${h.title} overdue ${plural(late, 'day')}`,
        meta: h.owner === 'client' ? `Interest runs until paid · waiting on ${company}` : 'Interest runs until paid · with SBC',
        date: h.dueDate,
        tone: 'over',
        href: portalHref('compliances'),
        action: h.owner === 'client' ? 'Fill details' : 'Open',
      };
    }
    const groups = new Map<string, HomeFiling[]>();
    for (const f of open) {
      if (f === h || bucketOf(f, today) === 'overdue') continue;
      const k = `${groupOf(f)}|${f.periodLabel ?? f.dueDate}`;
      groups.set(k, [...(groups.get(k) ?? []), f]);
    }
    for (const [k, list] of groups) {
      const due = list.map((f) => f.dueDate).sort()[0]!;
      const g = groupOf(list[0]!);
      rows.push({
        key: `fg:${k}`,
        title: list.length > 1 ? `${list.length} ${g === 'Payroll' ? 'payroll' : g} dues` : `${list[0]!.title} due`,
        meta: list.length > 1 ? `${list.map((f) => f.title).join(' · ')}${list[0]!.periodLabel ? ` for ${list[0]!.periodLabel}` : ''}` : list[0]!.needTitle ? `${list[0]!.needTitle} needed` : `${list[0]!.periodLabel ?? ''}${list[0]!.periodLabel ? ' · ' : ''}${AREA_NAME[g]}`,
        date: due,
        tone: days(today, due) <= 7 ? 'due' : 'prog',
        href: portalHref('compliances'),
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { hero, rows };
}

export function alertsDrill(hero: AlertRow | undefined, rows: AlertRow[], today: string, after: boolean): DrillConfig {
  const all = [...(hero ? [hero] : []), ...rows];
  const r = (a: AlertRow): DrillRow => ({
    title: a.title,
    meta: dShort(a.date),
    chip: a === hero ? 'Overdue' : rel(today, a.date),
    chipColor: chipBg(a.tone),
    href: a.href,
  });
  const n15 = rows.filter((a) => days(today, a.date) <= 15);
  const later = rows.filter((a) => days(today, a.date) > 15);
  return {
    title: 'Important alerts',
    tabs: [
      { label: 'All', rows: all.map(r) },
      { label: 'Overdue', rows: hero ? [r(hero)] : [] },
      { label: 'Next 15 days', rows: n15.map(r) },
      ...(after || later.length ? [{ label: 'Later', rows: later.map(r) }] : []),
    ],
    link: { lead: 'These items live in Notifications', text: 'Open Notifications →', href: portalHref('notifications'), where: 'Notifications' },
  };
}

/* ---------------------------------------------------------- timeline */

export interface TlPhase {
  id: TimelinePhaseDates['id'];
  name: string;
  from: string;
  to: string;
  done: boolean;
  pct?: number;
  milestone?: boolean;
}

function spanOf(steps: PortalStep[]): { from?: string; to?: string; done: boolean } {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const s of steps) {
    const a = s.windowFrom ?? s.doneOn;
    const b = s.kind === 'done' ? s.doneOn ?? s.due : s.due;
    if (a) starts.push(a);
    if (b) ends.push(b);
  }
  starts.sort();
  ends.sort();
  return { from: starts[0], to: ends.at(-1), done: steps.length > 0 && steps.every((s) => s.kind === 'done') };
}

export function buildTimeline(model: PortalIncorporationModel, incorporationDate?: string): TlPhase[] | null {
  const p1 = model.phases[0];
  const p2 = model.phases[1];
  if (!p1 || !p2) return null;
  const a = spanOf(p1.steps);
  const b = spanOf(p2.steps.filter((s) => s.id !== 'pre-11' && s.id !== 'pre-12'));
  const mcaStep = model.byId['pre-11'];
  const coiStep = model.byId['pre-12'];
  const coi = ymd(incorporationDate) ?? (coiStep?.kind === 'done' ? coiStep.doneOn : undefined) ?? model.coiExpected ?? coiStep?.due;
  if (!coi) return null;
  const aFrom = a.from ?? b.from;
  if (!aFrom) return null;
  const aTo = a.to && a.to >= aFrom ? a.to : aFrom;
  // Phase 2 follows straight on from a finished Phase 1 (prototype, TL-14).
  const bFrom = a.done ? aTo : b.from && b.from >= aTo ? b.from : aTo;
  let bTo = b.to && b.to >= bFrom ? b.to : bFrom;
  if (bTo > coi) bTo = coi;
  const mcaOwn = mcaStep?.windowFrom && model.byId['pre-11']?.due !== model.coiExpected ? { from: mcaStep.windowFrom, to: mcaStep.kind === 'done' ? mcaStep.doneOn ?? mcaStep.due : mcaStep.due } : undefined;
  const mFrom = mcaOwn?.from && mcaOwn.from >= bTo ? mcaOwn.from : bTo;
  const mTo = mcaOwn?.to && mcaOwn.to >= mFrom && mcaOwn.to <= coi ? mcaOwn.to : coi;
  const p2pct = p2.total ? Math.round((p2.done / p2.total) * 100) : 0;
  return [
    { id: 'p1', name: `Phase 1 · ${p1.name}`, from: aFrom, to: aTo, done: a.done },
    { id: 'p2', name: `Phase 2 · ${p2.name}`, from: bFrom, to: bTo, done: b.done, pct: p2pct },
    { id: 'mca', name: 'MCA review', from: mFrom, to: mTo, done: mcaStep?.kind === 'done' },
    { id: 'coi', name: 'COI', from: coi, to: coi, done: coiStep?.kind === 'done' || Boolean(incorporationDate), milestone: true },
  ];
}

export function timelineAxis(phases: TlPhase[], today: string): { t0: string; span: number; ticks: { iso: string; pct: number }[] } {
  const t0 = phases[0]!.from;
  // When today is long past the COI, end the axis a little after it (the card
  // then pins a 'Today →' chip at the right edge) so the bars keep their width.
  const coiEnd = phases[3]!.to;
  const end = today <= addDays(coiEnd, 21) ? [coiEnd, today].sort().at(-1)! : addDays(coiEnd, 14);
  const span = Math.max(14, days(t0, end) + 11);
  const ticks: { iso: string; pct: number }[] = [];
  // At most ~9 ticks (TL-06); never a tick hard against the right edge (TL-14).
  const step = [7, 14, 21, 28, 56, 91, 182].find((st) => Math.floor(span / st) + 1 <= 9) ?? 364;
  for (let n = 0; n <= span; n += step) {
    const pct = (n / span) * 100;
    if (pct > 96) break;
    ticks.push({ iso: addDays(t0, n), pct });
  }
  return { t0, span, ticks };
}

export function timelineDrill(model: PortalIncorporationModel, active: number): DrillConfig {
  const p1 = model.phases[0]?.steps ?? [];
  const p2 = (model.phases[1]?.steps ?? []).filter((s) => s.id !== 'pre-11' && s.id !== 'pre-12');
  const row = (s: PortalStep): DrillRow => {
    const [label, tone] = stepStatus(s);
    return { title: s.title, meta: stepDateLabel(s), chip: label === 'Waiting' ? 'Waiting' : label, chipColor: chipBg(tone), step: stepDrillMeta(s), href: stepHref(s.id) };
  };
  const one = (id: string) => (model.byId[id] ? [row(model.byId[id]!)] : []);
  return {
    title: 'Timeline phases',
    active,
    tabs: [
      { label: 'Phase 1 · Name', rows: p1.map(row) },
      { label: `Phase 2 · ${model.phases[1]?.name ?? 'Incorporation'}`, rows: p2.map(row) },
      { label: 'MCA review', rows: one('pre-11') },
      { label: 'COI', rows: one('pre-12') },
    ],
    link: { lead: 'These items live in Incorporation', text: 'Open Incorporation →', href: portalHref('incorporation'), where: 'Incorporation' },
  };
}

/* ------------------------------------------------------- registrations */

export type RegCat = 'Tax' | 'Labour' | 'Business' | 'IP' | 'FEMA';
export const REG_CATS: RegCat[] = ['Tax', 'Labour', 'Business', 'IP', 'FEMA'];
const REG_META: Record<string, [RegCat, string, string?]> = {
  'reg-4': ['Tax', 'GSTN', 'https://www.gst.gov.in'],
  'reg-5': ['Tax', 'GSTN', 'https://www.gst.gov.in'],
  'reg-1': ['Labour', 'EPFO', 'https://unifiedportal-emp.epfindia.gov.in'],
  'reg-3': ['Labour', 'ESIC', 'https://www.esic.gov.in'],
  'reg-7': ['Labour', 'State PT department'],
  'reg-9': ['Labour', 'State Labour Dept'],
  'reg-13': ['Labour', 'Labour Dept'],
  'reg-14': ['Labour', 'Local Committee'],
  'reg-15': ['Business', 'Ministry of MSME', 'https://udyamregistration.gov.in'],
  'reg-8': ['Business', 'DGFT', 'https://www.dgft.gov.in'],
  'reg-10': ['Business', 'Municipal corporation'],
  'reg-6': ['Business', 'LEIL', 'https://www.lei-india.org'],
  'reg-16': ['Business', 'CBIC · ICEGATE', 'https://www.icegate.gov.in'],
  'reg-11': ['Business', 'STPI', 'https://stpi.in'],
  'reg-19': ['Business', 'ICDR'],
  'reg-12': ['IP', 'IP India', 'https://ipindia.gov.in'],
  'reg-17': ['IP', 'IP India', 'https://ipindia.gov.in'],
  'reg-18': ['IP', 'IP India', 'https://ipindia.gov.in'],
  'reg-20': ['FEMA', 'RBI · FIRMS', 'https://firms.rbi.org.in'],
  'reg-21': ['FEMA', 'RBI · FIRMS', 'https://firms.rbi.org.in'],
  'reg-22': ['FEMA', 'RBI · FIRMS', 'https://firms.rbi.org.in'],
  'reg-23': ['FEMA', 'RBI', 'https://flair.rbi.org.in'],
  'reg-24': ['FEMA', 'RBI · FIRMS', 'https://firms.rbi.org.in'],
};

export interface RegRow {
  step: PortalStep;
  name: string;
  cat: RegCat;
  authority: string;
  portal?: string;
  number?: string;
  date?: string;
  dateLabel: string;
  status: 'Registered' | 'In progress' | 'Upcoming';
  tone: Tone;
  certPath?: string;
  certName?: string;
}

export function buildRegistrations(model: PortalIncorporationModel): RegRow[] {
  const phase = model.phases[3];
  if (!phase) return [];
  return phase.steps
    .filter((s) => (s.slice?.status as string | undefined) !== 'not-applicable')
    .map((s) => {
      const meta = REG_META[s.id] ?? ['Business', 'SBC'];
      const fields = getClientResponseFields(s.item);
      const resp = extractItemResponses(s.item, s.slice ?? null);
      const numF = fields.find((f) => /(number|arn|code|gstin)$/i.test(f.id) && f.type !== 'file');
      const dateF = fields.find((f) => /(registration|filing)Date$/i.test(f.id)) ?? fields.find((f) => /Date$/.test(f.id));
      const certF = fields.find((f) => f.type === 'file' && /certificate/i.test(f.id));
      const number = numF ? resp[numF.id]?.trim() || undefined : undefined;
      const date = dateF ? ymd(resp[dateF.id]) : undefined;
      const done = s.kind === 'done';
      const working = s.kind === 'with' || s.kind === 'you' || s.kind === 'prog';
      const certPath = certF ? resp[certF.id]?.trim() || undefined : undefined;
      return {
        step: s,
        name: s.title,
        cat: meta[0],
        authority: meta[1],
        portal: meta[2],
        number,
        date: done ? date ?? s.doneOn : s.due,
        dateLabel: done ? dLong(date ?? s.doneOn) : s.due ? `${working ? 'Est.' : 'By'} ${dLong(s.due)}` : '—',
        status: done ? 'Registered' : working ? 'In progress' : 'Upcoming',
        tone: done ? 'ok' : working ? 'prog' : 'up',
        certPath,
        certName: certPath ? `${s.title} certificate` : undefined,
      } satisfies RegRow;
    });
}

/* --------------------------------------------------------- post-inc */

export interface PostRow {
  step: PortalStep;
  limitDays?: number;
  dueDate?: string;
  day?: number;
  usedPct: number;
  /** Days past the statutory due date (0 when not overdue). */
  overDays: number;
  owner: 'client' | 'sbc';
  info: string;
}

export function buildPostInc(model: PortalIncorporationModel, incorporationDate: string | undefined, today: string): { open: PostRow[]; done: PortalStep[]; dayN?: number } {
  const phase = model.phases[2];
  const anchor = ymd(incorporationDate);
  const open: PostRow[] = [];
  const done: PortalStep[] = [];
  for (const s of phase?.steps ?? []) {
    if (s.kind === 'done') {
      done.push(s);
      continue;
    }
    const text = stepTimelineText(s);
    const m = /within\s+(\d+)\s+days/i.exec(text);
    const limit = m ? Number(m[1]) : undefined;
    const dueDate = anchor && limit ? addDays(anchor, limit) : s.due;
    const day = anchor ? Math.max(0, days(anchor, today)) : undefined;
    const overDays = dueDate && dueDate < today ? days(dueDate, today) : 0;
    const usedPct = overDays ? 100 : limit && day != null ? Math.min(100, (day / limit) * 100) : 0;
    open.push({
      step: s,
      limitDays: limit,
      dueDate,
      day: limit && day != null ? Math.min(day, limit) : day,
      usedPct,
      overDays,
      owner: s.kind === 'you' || s.kind === 'prog' ? 'client' : 'sbc',
      info: `${text}${STEP_STATUS[s.kind] ? ` · ${STEP_STATUS[s.kind]![0].toLowerCase()}` : ''}`,
    });
  }
  // Nearest deadline first (overdue at the top), undated last (TL-11).
  open.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  return { open, done, dayN: anchor ? Math.max(0, days(anchor, today)) : undefined };
}

export function postIncDrill(open: PostRow[], done: PortalStep[], active: number): DrillConfig {
  const o = open.map<DrillRow>((p) => ({
    title: p.step.title,
    meta: p.overDays
      ? `overdue ${p.overDays} day${p.overDays === 1 ? '' : 's'} · due ${dShort(p.dueDate)}`
      : p.limitDays && p.day != null
        ? `day ${p.day} of ${p.limitDays} · ${dShort(p.dueDate)}`
        : dShort(p.dueDate),
    chip: p.overDays ? 'Overdue' : 'Open',
    chipColor: chipBg(p.overDays ? 'over' : p.owner === 'client' ? 'due' : 'prog'),
    href: stepHref(p.step.id),
  }));
  const d = done.map<DrillRow>((s) => ({ title: s.title, meta: dShort(s.doneOn), chip: 'Completed', chipColor: chipBg('ok'), href: stepHref(s.id) }));
  return {
    title: 'Post-incorporation setup',
    active,
    tabs: [
      { label: 'All', rows: [...o, ...d] },
      { label: 'Open', rows: o },
      { label: 'Completed', rows: d },
    ],
    link: { lead: 'These items live in Incorporation', text: 'Open Incorporation →', href: portalHref('incorporation'), where: 'Incorporation' },
  };
}

/* --------------------------------------------------------- documents */

export interface DocItem {
  id: string;
  name: string;
  type: string;
  date?: string;
  from: 'client' | 'firm';
  kind: 'doc' | 'milestone';
  ref: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  stepId?: string | null;
}

function fileType(name: string, contentType?: string | null): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || contentType === 'application/pdf') return 'PDF';
  if (ext === 'jpg' || ext === 'jpeg' || contentType === 'image/jpeg') return 'JPG';
  if (ext === 'png' || contentType === 'image/png') return 'PNG';
  if (ext === 'docx' || ext === 'doc') return 'DOCX';
  if (ext === 'xlsx' || ext === 'xls') return 'XLSX';
  return (ext || 'FILE').toUpperCase().slice(0, 4);
}

export function buildDocs(home: ClientHome | undefined, overview: ClientOverview | undefined): DocItem[] {
  const out: DocItem[] = [];
  for (const d of home?.docs ?? []) {
    out.push({ id: d.id, name: d.fileName.replace(/\.[a-z0-9]{2,5}$/i, ''), type: fileType(d.fileName, d.contentType), date: ymd(d.createdAt), from: d.from, kind: 'doc', ref: d.id, contentType: d.contentType, sizeBytes: d.sizeBytes, stepId: d.stepId });
  }
  for (const v of overview?.documents.deliverables ?? []) {
    const file = v.storagePath.split('/').pop() ?? v.name;
    out.push({ id: v.id, name: v.name, type: fileType(file), date: ymd(v.issuedAt), from: 'firm', kind: 'milestone', ref: v.storagePath, stepId: v.stepId });
  }
  return out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 6);
}

/** C-066: "This week" under 7 days old, "Last week" under 14, then "Earlier". */
export function docGroup(today: string, iso?: string): 'This week' | 'Last week' | 'Earlier' {
  if (!iso) return 'Earlier';
  const age = days(iso.slice(0, 10), today);
  if (age < 7) return 'This week';
  if (age < 14) return 'Last week';
  return 'Earlier';
}

export async function docUrl(d: DocItem): Promise<string> {
  const res = await fetch(
    d.kind === 'doc' ? `/api/documents/${encodeURIComponent(d.ref)}/signed-url` : `/api/milestone-documents/signed-url?path=${encodeURIComponent(d.ref)}`,
  );
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !body.url) throw new Error('Could not open the file');
  return body.url;
}

/* --------------------------------------------------- home card drills */

const NEED_WORD: Record<NeedKind, string> = { upload: 'Upload', fill: 'Fill', correct: 'Sent back', sign: 'Approve' };

/** One open need as a drill row: the date, and a chip that says overdue, due soon or the kind. */
function needRow(n: NeedRow, today: string): DrillRow {
  const late = isOverdueNeed(n, today);
  const chip = n.kind === 'correct' ? 'Sent back' : late ? 'Overdue' : NEED_WORD[n.kind];
  return {
    title: n.title,
    meta: n.due ? `Due ${dShort(n.due)}` : n.area || undefined,
    chip,
    tone: late || n.kind === 'correct' ? 'bad' : n.due && days(today, n.due) <= 7 ? 'warn' : 'teal',
    href: n.href,
  };
}

/** The Waiting on tile after the COI (C-026): every open need, by kind. */
export function needsDrill(needs: NeedRow[], today: string, company: string): DrillConfig {
  const sorted = sortNeeds(needs, today);
  return {
    title: `Waiting on ${company}`,
    sub: `${needs.length} open`,
    tabs: [
      { label: 'All', rows: sorted.map((n) => needRow(n, today)) },
      ...NEED_TABS.map(([k, label]) => ({ label, rows: sorted.filter((n) => n.kind === k).map((n) => needRow(n, today)) })).filter((t) => t.rows.length > 0),
    ],
    link: { lead: 'Requests live in Documents', text: 'Open Documents →', href: portalHref('documents'), where: 'Documents' },
  };
}

/** The Registrations tile (C-031): granted, in progress and upcoming registrations. */
export function regsDrill(regs: RegRow[]): DrillConfig {
  const row = (r: RegRow): DrillRow => ({
    title: r.name,
    meta: r.number ?? r.dateLabel,
    chip: r.status,
    tone: r.status === 'Registered' ? 'ok' : r.status === 'In progress' ? 'prog' : 'idle',
    step: stepDrillMeta(r.step),
    href: stepHref(r.step.id),
  });
  const by = (st: RegRow['status']) => regs.filter((r) => r.status === st).map(row);
  return {
    title: 'Registrations',
    sub: `${regs.filter((r) => r.status === 'Registered').length} of ${regs.length} granted`,
    tabs: [
      { label: 'All', rows: regs.map(row) },
      { label: 'Registered', rows: by('Registered') },
      { label: 'In progress', rows: by('In progress') },
      { label: 'Upcoming', rows: by('Upcoming') },
    ],
    link: { lead: 'Registrations live in phase 4', text: 'Open Registration →', href: phaseHref(4), where: 'Registration' },
  };
}
