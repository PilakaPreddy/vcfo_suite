import { getActiveCatalogItems, getIncorporationPhases, getItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import { gateActiveCatalog, getStepGate } from '@/lib/checklist/checklist-step-gate';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { FilingRow } from '@/lib/compliance/filings';
import { buildProgress } from '@/lib/client/client-overview';
import { internOverviewPhaseTitle } from '@/lib/intern/intern-overview-progress';
import { buildPhaseProgress } from '@/lib/ask/phase-progress';
import { listPendingApprovals } from '@/lib/projects/pending-approvals';
import { deriveStuckReason, STUCK_LABEL } from '@/lib/projects/project-stuck';
import { numberArg, type AskTool } from './types';

/**
 * STAFF TOOLS — admin / super admin, firm-wide, read-only. Pure functions over
 * data loaded through scoped repositories (`staff-data.ts`), so they are
 * testable without a database. Results carry only company names, step titles,
 * counts and calendar dates — never identity numbers, addresses or people.
 * List tools give the model the count and the top rows; code draws the full
 * table in the card (`staffToolCard` in suggestions.ts).
 */
export interface StaffEngagement {
  dbId: string;
  engagement: Engagement;
  state: Record<string, ChecklistItemStateSlice | undefined>;
}

export interface StaffData {
  engagements: StaffEngagement[];
  filings: FilingRow[];
  now: Date;
}

const DAY_MS = 86_400_000;

function active(data: StaffData): StaffEngagement[] {
  return data.engagements.filter((e) => e.engagement.stage !== 'Operational Readiness');
}

/** Route key for project links: slug when present, else id. */
function routeKey(e: StaffEngagement): string {
  return e.engagement.slug || e.engagement.id;
}

function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function waitingOnClient(data: StaffData) {
  const out: Array<{ engagementId: string; company: string; stepId: string; stepTitle: string; daysWaiting: number | null }> = [];
  for (const e of active(data)) {
    const gates = gateActiveCatalog(e.state, 'client');
    const items = getActiveCatalogItems();
    const index = items.findIndex((item) => getStepGate(gates, item.id).kind === 'active');
    if (index < 0) continue;
    const item = items[index]!;
    // Waiting since the step before it closed, when that date is on record.
    const previous = index > 0 ? e.state[items[index - 1]!.id]?.completedOn : undefined;
    out.push({
      engagementId: routeKey(e),
      company: e.engagement.companyName,
      stepId: item.id,
      stepTitle: item.title,
      daysWaiting: daysSince(previous, data.now),
    });
  }
  return out.sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
}

export function overdueAndDueSoon(data: StaffData, days: number) {
  const today = isoDay(data.now);
  const end = new Date(data.now);
  end.setDate(end.getDate() + days);
  const endIso = isoDay(end);
  const byDb = new Map(data.engagements.map((e) => [e.dbId, e]));
  const byApp = new Map(data.engagements.map((e) => [e.engagement.id, e]));
  return data.filings
    .filter((f) => !f.filedOn && f.dueDate <= endIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((f) => {
      const e = byDb.get(f.engagementId) ?? byApp.get(f.engagementId);
      return {
        engagementId: e ? routeKey(e) : f.engagementId,
        company: f.companyName,
        item: f.particular,
        dueDate: f.dueDate,
        overdue: f.dueDate < today,
      };
    });
}

export function pendingApprovals(data: StaffData) {
  const byId = new Map(data.engagements.map((e) => [e.engagement.id, e]));
  return listPendingApprovals(
    active(data).map((e) => e.engagement),
    (eng) => byId.get(eng.id)?.state ?? {},
  ).map((row) => {
    const e = byId.get(row.engagementId);
    const slice = e?.state[row.itemId];
    return {
      engagementId: e ? routeKey(e) : row.engagementId,
      company: row.companyName,
      stepId: row.itemId,
      stepTitle: getItem(row.itemId)?.title ?? row.itemId,
      kind: row.clientFill
        ? 'send_to_client'
        : row.itemId === 'pre-2'
          ? 'board_resolution'
          : row.reviewSource === 'lead_manager_request'
            ? 'lead_request'
            : 'client_submit',
      daysWaiting: daysSince(slice?.clientSubmittedAt, data.now),
    };
  });
}

function currentStepFor(e: StaffEngagement) {
  const gates = gateActiveCatalog(e.state, 'staff');
  const item = getActiveCatalogItems().find((i) => {
    const kind = getStepGate(gates, i.id).kind;
    return kind === 'active' || kind === 'waiting';
  });
  if (!item) return null;
  const phase = getIncorporationPhases().find((p) => p.items.some((i) => i.id === item.id));
  return { stepId: item.id, title: item.title, phase: phase ? internOverviewPhaseTitle(phase.id, phase.title) : null };
}

function projectSummary(data: StaffData, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { error: 'no_match' as const };
  const match =
    data.engagements.find((e) => e.engagement.id === query || e.engagement.slug === query || e.dbId === query) ??
    data.engagements.find((e) => e.engagement.companyName.toLowerCase().includes(q));
  if (!match) return { error: 'no_match' as const };
  const progress = buildProgress(match.state);
  const stuck = deriveStuckReason(match.engagement, match.state as Record<string, ChecklistItemStateSlice>);
  const today = isoDay(data.now);
  const filings = data.filings.filter((f) => f.engagementId === match.dbId || f.engagementId === match.engagement.id);
  return {
    engagementId: routeKey(match),
    company: match.engagement.companyName,
    stage: match.engagement.stage,
    health: match.engagement.health,
    currentStep: currentStepFor(match),
    blocker: STUCK_LABEL[stuck],
    completedSteps: progress.done,
    totalSteps: progress.total,
    overdueFilings: filings.filter((f) => !f.filedOn && f.dueDate < today).length,
  };
}

/**
 * Phase progress of one engagement in the caller's scope. `data` holds only
 * what the scoped repositories returned for this caller, so an id outside it
 * is refused exactly like an unknown one.
 */
export function phaseProgressFor(data: StaffData, engagementId: string) {
  const key = engagementId.trim();
  const match = key
    ? data.engagements.find((e) => e.engagement.id === key || e.engagement.slug === key || e.dbId === key)
    : undefined;
  if (!match) return { error: 'not_in_scope' as const };
  return {
    engagementId: routeKey(match),
    company: match.engagement.companyName,
    phases: buildPhaseProgress({ state: match.state }),
  };
}

export function firmPulse(data: StaffData) {
  const today = isoDay(data.now);
  return {
    activeProjects: active(data).length,
    waitingOnClients: waitingOnClient(data).length,
    pendingApprovals: pendingApprovals(data).length,
    overdueFilings: data.filings.filter((f) => !f.filedOn && f.dueDate < today).length,
  };
}

export function atRisk(data: StaffData) {
  const today = isoDay(data.now);
  const out: Array<{ engagementId: string; company: string; reason: string; step: string }> = [];
  for (const e of active(data)) {
    const overdue = data.filings.filter(
      (f) => (f.engagementId === e.dbId || f.engagementId === e.engagement.id) && !f.filedOn && f.dueDate < today,
    ).length;
    const stuck = deriveStuckReason(e.engagement, e.state as Record<string, ChecklistItemStateSlice>);
    const reasons: string[] = [];
    if (e.engagement.health === 'overdue') reasons.push('Marked overdue');
    else if (e.engagement.health === 'at-risk') reasons.push('Marked at risk');
    if (stuck === 'blocked') reasons.push('Overdue step');
    if (overdue > 0) reasons.push(`${overdue} overdue filing${overdue === 1 ? '' : 's'}`);
    if (reasons.length === 0) continue;
    out.push({
      engagementId: routeKey(e),
      company: e.engagement.companyName,
      reason: reasons.join(' · '),
      step: currentStepFor(e)?.title ?? '',
    });
  }
  return out;
}

const MODEL_ROWS = 5;

function forModel<Row>(rows: readonly Row[]) {
  return { count: rows.length, top: rows.slice(0, MODEL_ROWS) };
}

const EMPTY_SCHEMA = { type: 'object' as const, properties: {}, required: [], additionalProperties: false };

export const STAFF_TOOLS: Record<string, AskTool<StaffData>> = {
  listWaitingOnClient: {
    definition: {
      name: 'listWaitingOnClient',
      description: 'Projects whose next step is waiting on the client: the count and top rows. The app shows the full table.',
      strict: true,
      input_schema: EMPTY_SCHEMA,
    },
    run: async (data) => forModel(waitingOnClient(data)),
  },
  listOverdueAndDueSoon: {
    definition: {
      name: 'listOverdueAndDueSoon',
      description: 'Unfiled compliance items overdue or due within N days (max 30): the count and top rows. The app shows the full table.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { days: { type: 'integer', description: 'Look-ahead in days, 1 to 30' } },
        required: ['days'],
        additionalProperties: false,
      },
    },
    run: async (data, input) => forModel(overdueAndDueSoon(data, numberArg(input, 'days', 7, 30))),
  },
  listPendingApprovals: {
    definition: {
      name: 'listPendingApprovals',
      description: 'Steps waiting on a manager or admin decision: the count and top rows. The app shows the full table.',
      strict: true,
      input_schema: EMPTY_SCHEMA,
    },
    run: async (data) => forModel(pendingApprovals(data)),
  },
  getProjectSummary: {
    definition: {
      name: 'getProjectSummary',
      description: 'One project by id, slug or company name: phase, current step, blocker and counts.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { project: { type: 'string', description: 'Engagement id, slug or company name' } },
        required: ['project'],
        additionalProperties: false,
      },
    },
    run: async (data, input) => projectSummary(data, String(input.project ?? '')),
  },
  getPhaseProgress: {
    definition: {
      name: 'getPhaseProgress',
      description:
        'Phase-by-phase progress of one project: steps done and total per incorporation phase, the current phase and current step.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: { engagementId: { type: 'string', description: 'Engagement id or slug, as other tools return it' } },
        required: ['engagementId'],
        additionalProperties: false,
      },
    },
    run: async (data, input) => phaseProgressFor(data, String(input.engagementId ?? '')),
  },
  getFirmPulse: {
    definition: {
      name: 'getFirmPulse',
      description: 'Firm-wide counts: active projects, waiting on clients, pending approvals, overdue filings.',
      strict: true,
      input_schema: EMPTY_SCHEMA,
    },
    run: async (data) => firmPulse(data),
  },
};
