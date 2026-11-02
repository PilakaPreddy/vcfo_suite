/**
 * CLIENT OVERVIEW — pure shape builder.
 *
 * One scoped read powers the whole client "mission control" surface. This
 * module is deliberately free of `db`, `server-only`, and React so that:
 *   - `src/db/repositories/client-overview.ts` can call it after gathering rows,
 *   - the view can import the types without dragging the server graph in,
 *   - every derivation here is unit-testable.
 *
 * Sequencing is NOT reimplemented here. `gateActiveCatalog` from
 * `@/lib/checklist/checklist-step-gate` is the single source of truth for what is done /
 * active / waiting / locked, so the overview stays a read-only reflection of
 * the same gate the wizard enforces.
 */

import {
  coerceStatusCode,
  getIncorporationPhases,
  getActiveCatalogItems,
  getItem,
  type ChecklistItem,
} from '@/data/checklist';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { isRepeatField, repeatEntries } from '@/lib/checklist/checklist-repeat';
import { displayName, readProposedDirectors } from '@/lib/incorporation/proposed-directors';
import { clientIncorporationStepPath } from '@/lib/projects/project-step-path';
import { STEP_TAB_PARAM } from '@/lib/doc-pack/paths';
import { sectionSlug } from '@/lib/doc-pack/section-slug';
import { PART_A_SECTION } from '@/lib/checklist/part-a-sections';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { formatWindow, windowForStep, type EngagementSchedule } from '@/lib/projects/schedule-windows';
import {
  gateActiveCatalog,
  getStepGate,
  isChecklistStepSequentiallyComplete,
  type ChecklistStepGateKind,
} from '@/lib/checklist/checklist-step-gate';
import { isReviewRejected } from '@/lib/checklist/checklist-item-review';
import { phaseKeyFromId, type PhaseColorKey } from '@/lib/shell/phase-colors';

export type ClientOverviewState = Record<string, ChecklistItemStateSlice | undefined>;

export type ClientLegalForm = 'company' | 'llp' | 'partnership' | 'proprietorship';

type ClientOverviewPhaseId =
  | 'pre-inc-phase-1'
  | 'pre-inc-phase-2'
  | 'post-inc-phase-3'
  | 'registration-phase-4';

export interface ClientOverviewEngagement {
  id: string;
  slug: string | null;
  companyName: string;
  legalForm: ClientLegalForm;
  domesticOrForeign: 'domestic' | 'foreign';
  stage: string;
  /** Engagement start (row created), ISO. */
  startDate: string;
  /** Presence of this or `identifiers.cin` means post-COI. */
  incorporationDate?: string;
  registeredOffice?: string;
  parentEntityName?: string;
}

/** Statutory identifiers captured on pre-12 (Certificate of Incorporation). */
export interface ClientOverviewIdentifiers {
  cin?: string;
  pan?: string;
  tan?: string;
  pfCode?: string;
  esiCode?: string;
}

export interface ClientOverviewPhase {
  id: ClientOverviewPhaseId;
  /** Short client-facing label — never the raw "Phase 2 — Incorporation". */
  label: string;
  colorKey: PhaseColorKey;
  done: number;
  total: number;
  pct: number;
}

export interface ClientOverviewProgress {
  overallPct: number;
  done: number;
  total: number;
  byStatus: {
    completed: number;
    inProgress: number;
    awaitingClient: number;
    locked: number;
    overdue: number;
  };
  byPhase: ClientOverviewPhase[];
}

export interface ClientOverviewNextAction {
  stepId: string;
  title: string;
  href: string;
  description?: string;
  /**
   * The manager's date window for this step (`formatWindow`), when one is
   * set. Replaces the playbook working-days SLA, which is no longer shown.
   */
  windowLabel?: string;
  /** True when the lead sent this step back for corrections. */
  needsCorrection: boolean;
  correctionNote?: string;
}

export interface ClientOverviewDeliverable {
  id: string;
  name: string;
  kind: 'certificate' | 'card' | 'constitution';
  stepId: string;
  storagePath: string;
  issuedAt?: string;
}

export interface ClientOverviewDocuments {
  deliverables: ClientOverviewDeliverable[];
  counts: {
    /** Client-owned steps still asking for files/answers. */
    requested: number;
    /** Client-owned steps already submitted. */
    submitted: number;
    /** Firm-issued documents on file. */
    delivered: number;
  };
}

export interface ClientOverviewComplianceItem {
  id: string;
  title: string;
  authority: string;
  group: ComplianceGroup;
  dueDate: string;
  status: string;
  periodLabel?: string;
}

export type ComplianceGroup = 'GST' | 'Income tax' | 'Payroll' | 'MCA' | 'FEMA' | 'Other';

export interface ClientOverviewMilestone {
  id: string;
  title: string;
  kind: ChecklistStepGateKind;
  phaseId: ClientOverviewPhaseId;
  colorKey: PhaseColorKey;
  ownedByClient: boolean;
  completedOn?: string;
}

export interface ClientOverviewActivity {
  id: string;
  at: string;
  label: string;
}

export interface ClientOverviewTeamMember {
  id: string;
  name: string;
  email?: string;
  role: 'Project Manager' | 'Project Lead';
}

export interface ClientOverview {
  engagement: ClientOverviewEngagement;
  identifiers: ClientOverviewIdentifiers;
  /** COI issued — drives the pre/post-incorporation layout mood. */
  incorporated: boolean;
  progress: ClientOverviewProgress;
  nextAction?: ClientOverviewNextAction;
  ballInCourt: { waitingOnClient: number; waitingOnFirm: number };
  documents: ClientOverviewDocuments;
  compliance: { upcoming: ClientOverviewComplianceItem[] };
  milestones: ClientOverviewMilestone[];
  activity: ClientOverviewActivity[];
  team: ClientOverviewTeamMember[];
  /** Directors, share capital and subscribers from the pre-incorporation steps. */
  company: ClientCompanySnapshot;
}

interface ClientShareClass {
  kind: 'equity' | 'preference';
  quantity: string;
  nominalValue: string;
  total: string;
}

export interface ClientCompanySnapshot {
  directors: Array<{ name: string; indiaResident: boolean | null; din: string | null }>;
  capital: {
    /** pre-1 `authorisedShareCapital` */
    authorised: string | null;
    /** pre-1 `paidUpShareCapital` */
    paidUp: string | null;
    /** pre-1 `nominalValuePerEquityShare` */
    nominalValue: string | null;
    /** pre-13 */
    shareClasses: ClientShareClass[];
  };
  /** pre-16 */
  subscribers: Array<{ name: string; shares: string | null }>;
  /** Client step URLs for each block. */
  links: { directors: string; capital: string; shareClasses: string; subscribers: string };
}

// ---------------------------------------------------------------------------
// Static maps
// ---------------------------------------------------------------------------

/** Client-facing phase labels — shorter and calmer than the catalog titles. */
const PHASE_LABEL: Record<ClientOverviewPhaseId, string> = {
  'pre-inc-phase-1': 'SPICe+ Part A',
  'pre-inc-phase-2': 'SPICe+ Part B',
  'post-inc-phase-3': 'Post-incorporation',
  'registration-phase-4': 'Registration',
};

const PHASE_ORDER: ClientOverviewPhaseId[] = [
  'pre-inc-phase-1',
  'pre-inc-phase-2',
  'post-inc-phase-3',
  'registration-phase-4',
];

function isOverviewPhaseId(id: string): id is ClientOverviewPhaseId {
  return (PHASE_ORDER as readonly string[]).includes(id);
}

/**
 * The only documents the overview surfaces as "deliverables" — firm-issued
 * certificates and constitution documents. Board-resolution drafts are absent
 * on purpose: the client must never see a BR before it is finalized.
 */
const CLIENT_DELIVERABLE_FIELDS: ReadonlyArray<{
  fieldId: string;
  stepId: string;
  name: string;
  kind: ClientOverviewDeliverable['kind'];
}> = [
  {
    fieldId: 'certificateOfIncorporationFinalUrl',
    stepId: 'pre-12',
    name: 'Certificate of Incorporation',
    kind: 'certificate',
  },
  { fieldId: 'panCardFinalUrl', stepId: 'pre-12', name: 'PAN card', kind: 'card' },
  { fieldId: 'tanCardFinalUrl', stepId: 'pre-12', name: 'TAN card', kind: 'card' },
  {
    fieldId: 'moaSubscriptionSheetSignedUrl',
    stepId: 'pre-8',
    name: 'Memorandum of Association',
    kind: 'constitution',
  },
  {
    fieldId: 'aoaSubscriptionSheetSignedUrl',
    stepId: 'pre-8',
    name: 'Articles of Association',
    kind: 'constitution',
  },
  { fieldId: 'gstCertificateUrl', stepId: 'reg-4', name: 'GST certificate', kind: 'certificate' },
  { fieldId: 'iecCertificateUrl', stepId: 'reg-8', name: 'IEC certificate', kind: 'certificate' },
];

/**
 * Journey timeline stations — the handful of milestones a foreign parent
 * recognises, in catalog order. The interactive flowchart on Incorporation
 * stays the place to see all 46 steps; this is the at-a-glance track.
 */
const CLIENT_JOURNEY_MILESTONES: ReadonlyArray<{ stepId: string; label: string }> = [
  { stepId: 'pre-1', label: 'Company details' },
  { stepId: 'pre-5', label: 'Name approval (MCA)' },
  { stepId: 'pre-12', label: 'Certificate of Incorporation' },
  { stepId: 'post-3', label: 'Bank account' },
  { stepId: 'post-6', label: 'Commencement of business' },
  { stepId: 'reg-4', label: 'GST registration' },
  { stepId: 'reg-1', label: 'Provident Fund registration' },
  { stepId: 'reg-3', label: 'ESI registration' },
  { stepId: 'reg-8', label: 'Import-Export Code' },
];

/** Curated stations, in catalog order, carrying live gate state. */
export function journeyStations(
  milestones: ClientOverviewMilestone[],
): Array<ClientOverviewMilestone & { label: string }> {
  const labels = new Map(CLIENT_JOURNEY_MILESTONES.map((m) => [m.stepId, m.label]));
  return milestones
    .filter((milestone) => labels.has(milestone.id))
    .map((milestone) => ({ ...milestone, label: labels.get(milestone.id)! }));
}

/** Filing authority → the bucket a non-accountant reads at a glance. */
export function complianceGroupForAuthority(authority: string): ComplianceGroup {
  const key = authority.trim().toUpperCase();
  if (key === 'GST') return 'GST';
  if (key === 'IT' || key === 'INCOME TAX' || key === 'CBDT') return 'Income tax';
  if (key === 'EPFO' || key === 'ESIC' || key === 'PT' || key === 'LWF') return 'Payroll';
  if (key === 'MCA' || key === 'ROC') return 'MCA';
  if (key === 'RBI' || key === 'FEMA') return 'FEMA';
  return 'Other';
}

export const COMPLIANCE_GROUP_ORDER: ComplianceGroup[] = [
  'GST',
  'Income tax',
  'Payroll',
  'MCA',
  'FEMA',
  'Other',
];

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

export function clientStepHref(stepId: string): string {
  return `/app/client/incorporation?step=${encodeURIComponent(stepId)}`;
}

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function responsesFor(item: ChecklistItem, state: ClientOverviewState) {
  return extractItemResponses(item, state[item.id] ?? null);
}

/** Statutory identifiers the lead recorded on pre-12. */
export function identifiersFromState(state: ClientOverviewState): ClientOverviewIdentifiers {
  const item = getActiveCatalogItems().find((entry) => entry.id === 'pre-12');
  if (!item) return {};
  const responses = responsesFor(item, state);
  const pick = (id: string) => {
    const value = responses[id]?.trim();
    return value ? value : undefined;
  };
  return {
    cin: pick('cin'),
    pan: pick('pan'),
    tan: pick('tan'),
    pfCode: pick('pfCode'),
    esiCode: pick('esiCode'),
  };
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

function responsesOf(state: ClientOverviewState, itemId: string): Record<string, string> {
  const item = getItem(itemId);
  return item ? extractItemResponses(item, state[itemId]) : {};
}

/**
 * The company as the pre-incorporation steps describe it: directors (`pre-15`,
 * legacy Part A slots as a fallback), share capital (`pre-1`), share classes
 * (`pre-13`) and subscribers (`pre-16`). `state` must already be the client's
 * redacted view (`checklistStateForViewer`).
 */
export function buildCompanySnapshot(state: ClientOverviewState): ClientCompanySnapshot {
  const directors = readProposedDirectors(state)
    .map((director) => {
      const resident = (director.values.indiaResident ?? '').trim();
      return {
        name: displayName(director.values),
        indiaResident: resident === 'yes' ? true : resident === 'no' ? false : null,
        din: textOrNull(director.values.din),
      };
    })
    .filter((director) => director.name);

  const pre1 = responsesOf(state, 'pre-1');
  const pre13 = responsesOf(state, 'pre-13');
  const shareClasses: ClientShareClass[] = [];
  for (const kind of ['equity', 'preference'] as const) {
    if ((pre13[`${kind}Shares`] ?? '').trim() !== 'yes') continue;
    shareClasses.push({
      kind,
      quantity: (pre13[`${kind}Quantity`] ?? '').trim(),
      nominalValue: (pre13[`${kind}NominalValue`] ?? '').trim(),
      total: (pre13[`${kind}Total`] ?? '').trim(),
    });
  }

  const pre16Item = getItem('pre-16');
  const subscriberGroup = pre16Item
    ? getClientResponseFields(pre16Item).find((field) => field.id === 'subscribers')
    : undefined;
  const subscribers =
    subscriberGroup && isRepeatField(subscriberGroup)
      ? repeatEntries(responsesOf(state, 'pre-16'), subscriberGroup)
          .map((entry) => ({
            name: (entry.values.name ?? '').trim(),
            shares: textOrNull(entry.values.shares),
          }))
          .filter((subscriber) => subscriber.name)
      : [];

  return {
    directors,
    capital: {
      authorised: textOrNull(pre1.authorisedShareCapital),
      paidUp: textOrNull(pre1.paidUpShareCapital),
      nominalValue: textOrNull(pre1.nominalValuePerEquityShare),
      shareClasses,
    },
    subscribers,
    links: {
      directors: clientIncorporationStepPath('pre-15'),
      capital: `${clientIncorporationStepPath('pre-1')}?${STEP_TAB_PARAM}=${sectionSlug(PART_A_SECTION.shareCapital)}`,
      shareClasses: clientIncorporationStepPath('pre-13'),
      subscribers: clientIncorporationStepPath('pre-16'),
    },
  };
}

export function buildProgress(state: ClientOverviewState): ClientOverviewProgress {
  const phases = getIncorporationPhases();
  const gates = gateActiveCatalog(state, 'client');

  const byStatus = { completed: 0, inProgress: 0, awaitingClient: 0, locked: 0, overdue: 0 };
  const byPhase: ClientOverviewPhase[] = [];
  let done = 0;
  let total = 0;

  for (const phase of phases) {
    if (!isOverviewPhaseId(phase.id)) continue;
    let phaseDone = 0;
    for (const item of phase.items) {
      total += 1;
      const slice = state[item.id];
      const gate = getStepGate(gates, item.id);
      const status = coerceStatusCode(slice?.status);
      const complete = isChecklistStepSequentiallyComplete(status, slice, item.id);

      if (complete) {
        phaseDone += 1;
        done += 1;
        byStatus.completed += 1;
        continue;
      }
      if (gate.kind === 'locked') {
        byStatus.locked += 1;
        continue;
      }
      if (status === 'overdue') {
        byStatus.overdue += 1;
        continue;
      }
      // Rejected work is back with the client even if the slice still says
      // "reviewing" — the gate already reopened the step.
      if (gate.kind === 'active' || status === 'awaiting-client' || isReviewRejected(slice)) {
        byStatus.awaitingClient += 1;
        continue;
      }
      byStatus.inProgress += 1;
    }

    byPhase.push({
      id: phase.id,
      label: PHASE_LABEL[phase.id],
      colorKey: phaseKeyFromId(phase.id),
      done: phaseDone,
      total: phase.items.length,
      pct: pct(phaseDone, phase.items.length),
    });
  }

  return { overallPct: pct(done, total), done, total, byStatus, byPhase };
}

/**
 * The one thing we need from the client right now, straight off the gate.
 * `undefined` means the ball is with the firm — the UI says so calmly.
 */
export function buildNextAction(
  state: ClientOverviewState,
  schedule?: EngagementSchedule | null,
): ClientOverviewNextAction | undefined {
  const items = getActiveCatalogItems();
  const gates = gateActiveCatalog(state, 'client');

  for (const item of items) {
    const gate = getStepGate(gates, item.id);
    if (gate.kind !== 'active') continue;
    const slice = state[item.id];
    const rejected = isReviewRejected(slice);
    const window = windowForStep(schedule, item.id);
    return {
      stepId: item.id,
      title: item.title,
      href: clientStepHref(item.id),
      description: item.description,
      ...(window ? { windowLabel: formatWindow(window) } : {}),
      needsCorrection: rejected,
      correctionNote: rejected ? slice?.rejectionNote?.trim() || undefined : undefined,
    };
  }
  return undefined;
}

/** Open steps split by who owns the next move. Locked steps belong to neither. */
export function buildBallInCourt(state: ClientOverviewState): {
  waitingOnClient: number;
  waitingOnFirm: number;
} {
  const items = getActiveCatalogItems();
  const gates = gateActiveCatalog(state, 'client');
  let waitingOnClient = 0;
  let waitingOnFirm = 0;

  for (const item of items) {
    const gate = getStepGate(gates, item.id);
    if (gate.kind === 'done' || gate.kind === 'locked') continue;
    if (gate.kind === 'active') waitingOnClient += 1;
    else waitingOnFirm += 1;
  }
  return { waitingOnClient, waitingOnFirm };
}

export function buildDeliverables(state: ClientOverviewState): ClientOverviewDeliverable[] {
  const out: ClientOverviewDeliverable[] = [];

  for (const entry of CLIENT_DELIVERABLE_FIELDS) {
    // Full catalog: the signed MOA / AOA live on the legacy `pre-8` step.
    const item = getItem(entry.stepId);
    if (!item) continue;
    const slice = state[entry.stepId];
    const storagePath = responsesFor(item, state)[entry.fieldId]?.trim();
    if (!storagePath) continue;
    out.push({
      id: `${entry.stepId}:${entry.fieldId}`,
      name: entry.name,
      kind: entry.kind,
      stepId: entry.stepId,
      storagePath,
      issuedAt: slice?.deliveredToClientAt?.trim() || slice?.completedOn?.trim() || undefined,
    });
  }
  return out;
}

export function buildDocumentCounts(
  state: ClientOverviewState,
  deliveredCount: number,
): ClientOverviewDocuments['counts'] {
  const items = getActiveCatalogItems();
  const gates = gateActiveCatalog(state, 'client');
  let requested = 0;
  let submitted = 0;

  for (const item of items) {
    if (item.responsibleRole !== 'client') continue;
    const slice = state[item.id];
    const gate = getStepGate(gates, item.id);
    if (slice?.clientSubmittedAt?.trim() && !isReviewRejected(slice)) {
      submitted += 1;
      continue;
    }
    if (gate.kind === 'active') requested += 1;
  }

  return { requested, submitted, delivered: deliveredCount };
}

/**
 * Vertical milestone track. One node per catalog step, carrying the gate kind
 * so `JourneyNode` styling reads identically to the interactive flowchart —
 * without ever offering a way into a locked step.
 */
export function buildMilestones(state: ClientOverviewState): ClientOverviewMilestone[] {
  const gates = gateActiveCatalog(state, 'client');
  const out: ClientOverviewMilestone[] = [];

  for (const phase of getIncorporationPhases()) {
    if (!isOverviewPhaseId(phase.id)) continue;
    const colorKey = phaseKeyFromId(phase.id);
    for (const item of phase.items) {
      const slice = state[item.id];
      out.push({
        id: item.id,
        title: item.title,
        kind: getStepGate(gates, item.id).kind,
        phaseId: phase.id,
        colorKey,
        ownedByClient: item.responsibleRole === 'client',
        completedOn: slice?.completedOn?.trim() || slice?.deliveredToClientAt?.trim() || undefined,
      });
    }
  }
  return out;
}

/** The latest fully complete phase, or null pre-first-milestone. */
export function latestCompletedPhase(
  progress: ClientOverviewProgress,
): ClientOverviewPhase | null {
  const complete = progress.byPhase.filter((p) => p.total > 0 && p.done >= p.total);
  return complete.length ? complete[complete.length - 1]! : null;
}

/** One-line state for the hero — the "where are we" answer in five seconds. */
export function heroStateLine(overview: ClientOverview): string {
  const { progress, incorporated, nextAction } = overview;
  if (incorporated) {
    const open = progress.byPhase.find((p) => p.pct < 100);
    if (!open) return 'Every milestone complete — now on ongoing compliance.';
    return `Certificate of Incorporation issued — now in ${open.label}.`;
  }
  // Pre-COI, say where things stand and whose move it is. "We are getting X
  // started" was filler: it restated the company name and told the client
  // nothing they could act on.
  if (progress.overallPct === 0) {
    return nextAction
      ? 'Incorporation not started — the first step is yours.'
      : 'Incorporation not started.';
  }
  return nextAction
    ? `Incorporation in progress — the next step is yours.`
    : 'Incorporation in progress — with your VCFO team.';
}
