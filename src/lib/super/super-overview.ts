/**
 * SUPER ADMIN OVERVIEW — pure shape builder.
 *
 * One scoped read powers the whole super admin observatory. This module is
 * deliberately free of `db`, `server-only`, and React so that:
 *   - `src/db/repositories/super-overview.ts` can call it after gathering rows,
 *   - views can import the types without dragging the server graph in,
 *   - every derivation here is unit-testable.
 *
 * Sequencing, health, and "who owns the next move" are NOT reimplemented.
 * `gateActiveCatalog` (`@/lib/checklist/checklist-step-gate`) and `deriveStuckReason`
 * (`@/lib/projects/project-stuck`) stay the single sources of truth, exactly as the
 * lead and client surfaces use them — so the three dashboards can never
 * disagree about the same engagement.
 */

import {
  coerceStatusCode,
  getActiveCatalogItems,
  getIncorporationPhases,
  type StatusCode,
} from '@/data/checklist';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import {
  gateActiveCatalog,
  getStepGate,
  isChecklistStepSequentiallyComplete,
  type ChecklistStepGateKind,
} from '@/lib/checklist/checklist-step-gate';
import { isReviewRejected } from '@/lib/checklist/checklist-item-review';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { deriveStuckReason, STUCK_LABEL, type StuckReason } from '@/lib/projects/project-stuck';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';
import { phaseKeyFromId, type PhaseColorKey } from '@/lib/shell/phase-colors';
import { stageDisplayLabel, type Stage } from '@/lib/projects/stage';
import { isAwaitingManagerDecision } from '@/lib/incorporation/pre-inc-direct-flow';

export type SuperOverviewState = Record<string, ChecklistItemStateSlice | undefined>;

/** Short phase labels — the same four the lead dashboard's phase bars print. */
const SUPER_PHASE_LABEL: Record<string, string> = {
  'pre-inc-phase-1': 'Part A',
  'pre-inc-phase-2': 'Part B',
  'post-inc-phase-3': 'Post-inc',
  'registration-phase-4': 'Registration',
};

/**
 * What the gate says is happening on a project right now.
 *
 * This is the label the observatory leads with, because it comes from the same
 * `gateActiveCatalog` result the wizard enforces. `stuckReason` (from
 * `project-stuck`, used by the admin dashboards) answers a different question —
 * which party has been sitting on it — and counts an untouched project as
 * "lead pending" even when the first step is the client's. Both are kept; only
 * this one is used for the row chip, so a row never contradicts itself.
 */
export type SuperStateKey = 'complete' | 'overdue' | 'review' | 'with-client' | 'with-firm';

const SUPER_STATE_LABEL: Record<SuperStateKey, string> = {
  complete: 'Complete',
  overdue: 'Overdue',
  review: 'PM review',
  'with-client': 'With client',
  'with-firm': 'With firm',
};

interface SuperPhaseProgress {
  id: string;
  label: string;
  colorKey: PhaseColorKey;
  done: number;
  total: number;
  pct: number;
  /** Open steps in this phase the firm owns. */
  active: number;
  /** Open steps in this phase the client owns. */
  waiting: number;
  /** Steps sequencing has not opened yet. */
  locked: number;
}

/** Portfolio-wide step counts, by what the gate says about each step. */
interface SuperGateCounts {
  done: number;
  active: number;
  waiting: number;
  locked: number;
  overdue: number;
}

export interface SuperEngagementSummary {
  /** App id (legacy `e1`… or uuid) — what every href uses. */
  id: string;
  slug: string | null;
  companyName: string;
  clientName: string | null;
  /** Raw DB stage; `stageLabel` is what the UI prints. */
  stage: string;
  stageLabel: string;
  health: string;
  stuckReason: StuckReason;
  stuckLabel: string;
  /** Gate-derived state — what the row chip says. */
  stateKey: SuperStateKey;
  stateLabel: string;
  /** `intern_id` scoping key of the delivery lead. */
  leadId: string | null;
  leadName: string | null;
  managerId: string | null;
  managerName: string | null;
  incorporated: boolean;
  createdAt: string;
  updatedAt: string;
  progress: { done: number; total: number; pct: number };
  phases: SuperPhaseProgress[];
  steps: SuperGateCounts;
  /** Open steps split by who owns the next move (locked/done belong to neither). */
  ballInCourt: { firm: number; client: number };
  /** Steps a client has submitted that are sitting in PM review. */
  approvalsPending: number;
  currentStep: { id: string; title: string; owner: 'firm' | 'client' } | null;
  /** Days since the engagement row last changed; null when unknown. */
  idleDays: number | null;
  href: string;
}

export interface SuperFiling {
  id: string;
  engagementId: string;
  companyName: string;
  title: string;
  authority: string;
  dueDate: string;
  status: string;
  periodLabel?: string;
  href: string;
}

export interface SuperActivityEntry {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  label: string;
  engagementId: string | null;
  companyName: string | null;
  href: string | null;
}

export interface SuperPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Engagements where this person is the delivery lead / owning manager. */
  engagements: number;
  openSteps: number;
  approvalsPending: number;
  attention: number;
  href: string;
}

interface SuperOverviewKpis {
  engagements: number;
  needsAttention: number;
  approvalsPending: number;
  awaitingClient: number;
  overdueFilings: number;
  filingsDueSoon: number;
  people: number;
  clients: number;
}

/** One stacked column per delivery stage. */
export interface SuperStageBar {
  stage: string;
  label: string;
  onTrack: number;
  attention: number;
}

/** One stacked column per journey phase, portfolio-wide. */
export interface SuperPhaseBar {
  phase: string;
  label: string;
  done: number;
  active: number;
  waiting: number;
  locked: number;
}

export interface SuperFilingBucket {
  bucket: string;
  label: string;
  count: number;
}

export interface SuperOverview {
  generatedAt: string;
  kpis: SuperOverviewKpis;
  charts: {
    byStage: SuperStageBar[];
    byPhase: SuperPhaseBar[];
    ballInCourt: { firm: number; client: number; done: number };
    workload: Array<{ id: string; name: string; open: number; attention: number }>;
    filings: SuperFilingBucket[];
  };
  needsAttention: SuperEngagementSummary[];
  engagements: SuperEngagementSummary[];
  filings: SuperFiling[];
  activity: SuperActivityEntry[];
  people: SuperPerson[];
}

const STAGE_ORDER: Stage[] = ['Pre-Incorporation', 'Post-Incorporation', 'Operational Readiness'];

/** Attention list length on the Overview — the rest live on the L1 list. */
const SUPER_ATTENTION_LIMIT = 6;

/** Top-N people in the workload chart; six keeps the categorical scale honest. */
const SUPER_WORKLOAD_LIMIT = 6;

/** Compliance runway window, in days. */
export const SUPER_FILING_HORIZON_DAYS = 90;

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** The super admin projects list (L1). */
export const SUPER_PROJECTS_HREF = '/app/super/projects';

/** One engagement's super admin detail screen (L2). */
export function superEngagementHref(engagementId: string): string {
  return `${SUPER_PROJECTS_HREF}/${engagementId}`;
}

/** The list, filtered to what needs a human. */
const SUPER_ATTENTION_HREF = `${SUPER_PROJECTS_HREF}?filter=attention`;

/** Read-only inspection of the firm-side project shell. */
export function superFirmViewHref(slugOrId: string): string {
  return `/app/admin/projects/${slugOrId}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export interface SuperEngagementInput {
  id: string;
  slug: string | null;
  companyName: string;
  clientName: string | null;
  stage: string;
  health: string;
  leadId: string | null;
  leadName: string | null;
  managerId: string | null;
  managerName: string | null;
  incorporationDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  state: SuperOverviewState;
}

/**
 * Everything the observatory knows about one engagement, derived from the gate.
 *
 * `deriveStuckReason` wants the app `Engagement` shape but only reads `stage`;
 * we hand it exactly that rather than reimplementing its rules.
 */
export function summarizeEngagement(
  input: SuperEngagementInput,
  now: Date = new Date(),
): SuperEngagementSummary {
  const { state } = input;
  const gates = gateActiveCatalog(state, 'staff');
  const items = getActiveCatalogItems();

  const steps: SuperGateCounts = { done: 0, active: 0, waiting: 0, locked: 0, overdue: 0 };
  let approvalsPending = 0;
  let currentStep: SuperEngagementSummary['currentStep'] = null;

  for (const item of items) {
    const slice = state[item.id];
    const gate = getStepGate(gates, item.id);
    const status = coerceStatusCode(slice?.status);

    if (isAwaitingManagerDecision(item.id, slice)) approvalsPending += 1;
    if (status === 'overdue' && gate.kind !== 'locked' && gate.kind !== 'done') {
      steps.overdue += 1;
    }

    if (gate.kind === 'done') {
      steps.done += 1;
      continue;
    }
    if (gate.kind === 'locked') {
      steps.locked += 1;
      continue;
    }

    // The first non-done, non-locked step is the one the firm is living in.
    if (!currentStep) {
      currentStep = {
        id: item.id,
        title: item.title,
        // `gateActiveCatalog(..., 'staff')` marks a step 'active' when the firm
        // owns it and 'waiting' when the client does.
        owner: gate.kind === 'active' ? 'firm' : 'client',
      };
    }

    if (gate.kind === 'active') steps.active += 1;
    else steps.waiting += 1;
  }

  const phases: SuperPhaseProgress[] = [];
  let done = 0;
  let total = 0;

  for (const phase of getIncorporationPhases()) {
    let phaseDone = 0;
    let phaseActive = 0;
    let phaseWaiting = 0;
    let phaseLocked = 0;

    for (const item of phase.items) {
      total += 1;
      const slice = state[item.id];
      const gate = getStepGate(gates, item.id);

      // `done` counts sequential completion (the progress bar's definition);
      // the open/locked split comes from the gate, so a phase never claims
      // more open work than the gate actually opened.
      if (isChecklistStepSequentiallyComplete(coerceStatusCode(slice?.status), slice, item.id)) {
        phaseDone += 1;
        done += 1;
      }
      if (gate.kind === 'active') phaseActive += 1;
      else if (gate.kind === 'waiting') phaseWaiting += 1;
      else if (gate.kind === 'locked') phaseLocked += 1;
    }

    phases.push({
      id: phase.id,
      label: SUPER_PHASE_LABEL[phase.id] ?? phase.title,
      colorKey: phaseKeyFromId(phase.id),
      done: phaseDone,
      total: phase.items.length,
      pct: pct(phaseDone, phase.items.length),
      active: phaseActive,
      waiting: phaseWaiting,
      locked: phaseLocked,
    });
  }

  // `deriveStuckReason` reads only `stage` off the engagement; hand it exactly
  // that rather than re-deriving its rules here.
  const stuckReason = deriveStuckReason(
    { stage: input.stage } as unknown as Parameters<typeof deriveStuckReason>[0],
    state as Record<string, ChecklistItemStateSlice>,
  );

  const stateKey: SuperStateKey =
    steps.overdue > 0
      ? 'overdue'
      : approvalsPending > 0
        ? 'review'
        : !currentStep
          ? 'complete'
          : currentStep.owner === 'client'
            ? 'with-client'
            : 'with-firm';

  const idleDays = Number.isFinite(input.updatedAt.getTime())
    ? Math.max(0, daysBetween(input.updatedAt, now))
    : null;

  return {
    id: input.id,
    slug: input.slug,
    companyName: input.companyName,
    clientName: input.clientName,
    stage: input.stage,
    stageLabel: stageDisplayLabel(input.stage) || input.stage,
    health: input.health,
    stuckReason,
    stuckLabel: STUCK_LABEL[stuckReason],
    stateKey,
    stateLabel: SUPER_STATE_LABEL[stateKey],
    leadId: input.leadId,
    leadName: input.leadName,
    managerId: input.managerId,
    managerName: input.managerName,
    incorporated: isIncorporated(input, input.state),
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    progress: { done, total, pct: pct(done, total) },
    phases,
    steps,
    ballInCourt: { firm: steps.active, client: steps.waiting },
    approvalsPending,
    currentStep,
    idleDays,
    href: superEngagementHref(input.id),
  };
}

/** True when an engagement wants a human to look at it. */
export function needsAttention(summary: SuperEngagementSummary): boolean {
  return (
    summary.stuckReason !== 'on_track' ||
    summary.steps.overdue > 0 ||
    summary.health === 'overdue' ||
    summary.health === 'at-risk'
  );
}

/** Most urgent first: blocked, then approvals waiting, then idle longest. */
const STUCK_WEIGHT: Record<StuckReason, number> = {
  blocked: 5,
  waiting_manager: 4,
  waiting_signed: 3,
  waiting_client: 2,
  waiting_lead: 1,
  on_track: 0,
};

export function attentionScore(summary: SuperEngagementSummary): number {
  return (
    summary.steps.overdue * 100 +
    STUCK_WEIGHT[summary.stuckReason] * 10 +
    summary.approvalsPending * 4 +
    Math.min(summary.idleDays ?? 0, 30)
  );
}

export function sortByAttention(
  summaries: SuperEngagementSummary[],
): SuperEngagementSummary[] {
  return [...summaries].sort((a, b) => {
    const diff = attentionScore(b) - attentionScore(a);
    if (diff !== 0) return diff;
    return a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
  });
}

export function buildStageBars(summaries: SuperEngagementSummary[]): SuperStageBar[] {
  const seen = new Map<string, SuperStageBar>();
  for (const stage of STAGE_ORDER) {
    seen.set(stage, {
      stage,
      label: stageDisplayLabel(stage) || stage,
      onTrack: 0,
      attention: 0,
    });
  }
  for (const summary of summaries) {
    const bar =
      seen.get(summary.stage) ??
      (() => {
        const created: SuperStageBar = {
          stage: summary.stage,
          label: summary.stageLabel,
          onTrack: 0,
          attention: 0,
        };
        seen.set(summary.stage, created);
        return created;
      })();
    if (needsAttention(summary)) bar.attention += 1;
    else bar.onTrack += 1;
  }
  return [...seen.values()];
}

export function buildPhaseBars(summaries: SuperEngagementSummary[]): SuperPhaseBar[] {
  const bars: SuperPhaseBar[] = getIncorporationPhases().map((phase) => ({
    phase: phase.id,
    label: SUPER_PHASE_LABEL[phase.id] ?? phase.title,
    done: 0,
    active: 0,
    waiting: 0,
    locked: 0,
  }));
  const byId = new Map(bars.map((bar) => [bar.phase, bar]));

  for (const summary of summaries) {
    for (const phase of summary.phases) {
      const bar = byId.get(phase.id);
      if (!bar) continue;
      bar.done += phase.done;
      bar.active += phase.active;
      bar.waiting += phase.waiting;
      bar.locked += phase.locked;
    }
  }
  return bars;
}

export function buildWorkload(
  summaries: SuperEngagementSummary[],
  limit = SUPER_WORKLOAD_LIMIT,
): Array<{ id: string; name: string; open: number; attention: number }> {
  const rows = new Map<string, { id: string; name: string; open: number; attention: number }>();
  for (const summary of summaries) {
    const id = summary.leadId ?? 'unassigned';
    const name = summary.leadName ?? 'Unassigned';
    const row = rows.get(id) ?? { id, name, open: 0, attention: 0 };
    row.open += summary.ballInCourt.firm + summary.ballInCourt.client;
    if (needsAttention(summary)) row.attention += 1;
    rows.set(id, row);
  }
  return [...rows.values()].sort((a, b) => b.open - a.open).slice(0, limit);
}

/** Runway buckets — overdue first, then how soon the money is due. */
export function buildFilingBuckets(
  filings: SuperFiling[],
  now: Date = new Date(),
): SuperFilingBucket[] {
  const buckets: SuperFilingBucket[] = [
    { bucket: 'overdue', label: 'Overdue', count: 0 },
    { bucket: 'week', label: 'This week', count: 0 },
    { bucket: 'month', label: 'This month', count: 0 },
    { bucket: 'quarter', label: '90 days', count: 0 },
  ];
  const today = now.getTime();
  for (const filing of filings) {
    if (filing.status === 'filed') continue;
    const due = Date.parse(`${filing.dueDate}T00:00:00Z`);
    if (Number.isNaN(due)) continue;
    const days = Math.floor((due - today) / 86_400_000);
    if (days < 0) buckets[0]!.count += 1;
    else if (days <= 7) buckets[1]!.count += 1;
    else if (days <= 30) buckets[2]!.count += 1;
    else buckets[3]!.count += 1;
  }
  return buckets;
}

function buildKpis(
  summaries: SuperEngagementSummary[],
  filings: SuperFiling[],
  people: SuperPerson[],
  clients: number,
  now: Date = new Date(),
): SuperOverviewKpis {
  const buckets = buildFilingBuckets(filings, now);
  return {
    engagements: summaries.length,
    needsAttention: summaries.filter(needsAttention).length,
    approvalsPending: summaries.reduce((sum, s) => sum + s.approvalsPending, 0),
    awaitingClient: summaries.reduce((sum, s) => sum + s.ballInCourt.client, 0),
    overdueFilings: buckets.find((b) => b.bucket === 'overdue')?.count ?? 0,
    filingsDueSoon:
      (buckets.find((b) => b.bucket === 'week')?.count ?? 0) +
      (buckets.find((b) => b.bucket === 'month')?.count ?? 0),
    people: people.length,
    clients,
  };
}

/** Per-person workload, attributed by delivery lead and owning manager. */
export function buildPeople(
  staff: Array<{ id: string; name: string; email: string; role: string; internId: string | null }>,
  summaries: SuperEngagementSummary[],
): SuperPerson[] {
  const out: SuperPerson[] = [];
  for (const person of staff) {
    if (person.role !== 'intern' && person.role !== 'manager') continue;
    const mine = summaries.filter((summary) =>
      person.role === 'intern'
        ? Boolean(person.internId) && summary.leadId === person.internId
        : summary.managerId === person.id,
    );
    out.push({
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role === 'intern' ? 'Project Lead' : 'Project Manager',
      engagements: mine.length,
      openSteps: mine.reduce((sum, s) => sum + s.ballInCourt.firm + s.ballInCourt.client, 0),
      approvalsPending: mine.reduce((sum, s) => sum + s.approvalsPending, 0),
      attention: mine.filter(needsAttention).length,
      href: '/app/admin/people',
    });
  }
  return out.sort((a, b) => b.openSteps - a.openSteps);
}

export function buildSuperOverview(params: {
  summaries: SuperEngagementSummary[];
  filings: SuperFiling[];
  activity: SuperActivityEntry[];
  staff: Array<{ id: string; name: string; email: string; role: string; internId: string | null }>;
  clients: number;
  now?: Date;
}): SuperOverview {
  const now = params.now ?? new Date();
  const summaries = params.summaries;
  const people = buildPeople(params.staff, summaries);
  const ranked = sortByAttention(summaries);

  return {
    generatedAt: now.toISOString(),
    kpis: buildKpis(summaries, params.filings, people, params.clients, now),
    charts: {
      byStage: buildStageBars(summaries),
      byPhase: buildPhaseBars(summaries),
      ballInCourt: {
        firm: summaries.reduce((sum, s) => sum + s.ballInCourt.firm, 0),
        client: summaries.reduce((sum, s) => sum + s.ballInCourt.client, 0),
        done: summaries.reduce((sum, s) => sum + s.steps.done, 0),
      },
      workload: buildWorkload(summaries),
      filings: buildFilingBuckets(params.filings, now),
    },
    needsAttention: ranked.filter(needsAttention).slice(0, SUPER_ATTENTION_LIMIT),
    engagements: ranked,
    filings: params.filings,
    activity: params.activity,
    people,
  };
}

/** Re-exported so views never reach into `project-stuck` for the label map. */

/* ------------------------------------------------------------------ *
 * L2 — one engagement, in full.
 * ------------------------------------------------------------------ */

export interface SuperJourneyStep {
  id: string;
  title: string;
  slug: string;
  phaseId: string;
  phaseLabel: string;
  /** What the gate says: done · active · waiting · locked. */
  kind: ChecklistStepGateKind;
  /** Who owns the move while this step is open. */
  owner: 'firm' | 'client';
  /** True while a client submission sits in PM review. */
  awaitingReview: boolean;
  /** True when the lead must redo work the PM sent back. */
  rejected: boolean;
  /**
   * The stored step status, coerced (`not-started`, `in-progress`, `not-applicable`, ...). The
   * gate counts a not-applicable step as done, so screens read this to say "Not needed" (G-22).
   */
  status: StatusCode;
  href: string;
}

export interface SuperDocument {
  id: string;
  fileName: string;
  category: string | null;
  stepId: string | null;
  sharedWithClient: boolean;
  createdAt: string;
  sizeBytes: number | null;
}

export interface SuperTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface SuperEngagementDetail {
  summary: SuperEngagementSummary;
  journey: SuperJourneyStep[];
  documents: SuperDocument[];
  filings: SuperFiling[];
  activity: SuperActivityEntry[];
  team: SuperTeamMember[];
  /**
   * What the record's Gantt (R-21) is drawn from: the step states, the manager-set windows,
   * the expected COI and the certificate date. Optional so older cached reads still parse.
   */
  timeline?: {
    state: SuperOverviewState;
    schedule: EngagementSchedule | null;
    expectedCoiOn: string | null;
    incorporationDate: string | null;
  };
  /**
   * Read-only inspection links into the role shells (context §3, §6). These are
   * plain links — no impersonation, no role swap, so nothing role-scoped can be
   * mutated through them.
   */
  enterAs: {
    firm: string;
    /** TODO(owner): the client portal is per-user, so this opens the portal as
     *  it stands rather than pinned to this engagement. A per-engagement client
     *  lens needs an owner decision. */
    client: string;
  };
}

/** Staff step workspace for one checklist item. */
function superStepHref(slugOrId: string, stepSlug: string): string {
  return `/app/admin/projects/${slugOrId}/step/${stepSlug}`;
}

/** The full journey as the firm sees it, straight off the same gate. */
export function buildJourney(
  state: SuperOverviewState,
  slugOrId: string,
): SuperJourneyStep[] {
  const gates = gateActiveCatalog(state, 'staff');
  const out: SuperJourneyStep[] = [];

  for (const phase of getIncorporationPhases()) {
    const phaseLabel = SUPER_PHASE_LABEL[phase.id] ?? phase.title;
    for (const item of phase.items) {
      const gate = getStepGate(gates, item.id);
      const slice = state[item.id];
      out.push({
        id: item.id,
        title: item.title,
        slug: item.slug,
        phaseId: phase.id,
        phaseLabel,
        kind: gate.kind,
        owner: gate.kind === 'waiting' ? 'client' : 'firm',
        awaitingReview: isAwaitingManagerDecision(item.id, slice),
        rejected: isReviewRejected(slice),
        status: coerceStatusCode(slice?.status),
        href: superStepHref(slugOrId, item.slug),
      });
    }
  }
  return out;
}
