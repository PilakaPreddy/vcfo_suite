import { getItem, type ChecklistField } from '@/data/checklist';
import { SUGGESTIONS } from '@/data/ask/suggestions';
import type {
  AnswerDepth,
  AnswerEnvelope,
  AnswerLink,
  AskShell,
  ProjectSnapshot,
  StaffQuery,
  Suggestion,
  Visual,
} from '@/data/ask/schema';
import {
  appliesTo,
  applicabilityFromSnapshot,
  isReviewed,
  resolveTopicForViewer,
  topicsForStep,
  topicToAnswer,
} from '@/lib/ask/topics';
import { buildPhaseProgress, currentPhaseRow, type PhaseProgressRow } from '@/lib/ask/phase-progress';
import { PREVIEW_CLIENT_LINE } from '@/lib/ask/preview';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { atRisk, firmPulse, overdueAndDueSoon, pendingApprovals, waitingOnClient, type StaffData } from '@/lib/ask/tools/staff';
import { numberArg } from '@/lib/ask/tools/types';

/**
 * Pre-kept questions (T1): listed per shell and answered without a model
 * call — reviewed topics, the client's next step, or live staff queries.
 */

export interface SuggestionView {
  id: string;
  group: string;
  label: string;
}

/**
 * Suggestions this viewer may see. Topic suggestions follow alternates (an
 * LLP sees "How is an LLP incorporated?" in place of SPICe+) and drop out
 * when the topic does not apply (no FC-GPR for a domestic company).
 */
export function listSuggestions(shell: AskShell, snapshot: ProjectSnapshot | null): SuggestionView[] {
  const ctx = applicabilityFromSnapshot(snapshot);
  const audience = shell === 'client' ? 'client' : 'staff';
  const out: SuggestionView[] = [];
  for (const s of SUGGESTIONS) {
    if (s.shell !== shell) continue;
    if (!appliesTo(s.appliesTo, ctx)) continue;
    if (s.handler.kind === 'topic') {
      const topic = resolveTopicForViewer(s.handler.slug, ctx, audience);
      if (!topic) continue;
      out.push({ id: s.id, group: s.group, label: topic.slug === s.handler.slug ? s.label : topic.question });
      continue;
    }
    if ((s.handler.kind === 'nextStep' || s.handler.kind === 'phaseProgress') && !snapshot) continue;
    out.push({ id: s.id, group: s.group, label: s.label });
  }
  return out;
}

export function getSuggestion(id: string): Suggestion | null {
  return SUGGESTIONS.find((s) => s.id === id) ?? null;
}

function clip(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** "What is my next step?" — straight from the snapshot, no model. */
export function nextStepAnswer(snapshot: ProjectSnapshot): AnswerEnvelope {
  const step = snapshot.currentStep;
  if (!step) {
    return {
      line: snapshot.incorporated
        ? 'Every step on your incorporation checklist is complete. Your ongoing filings are on the Compliances page.'
        : 'There is nothing waiting on you right now. Your project lead will let you know when the next step opens.',
      citations: [{ id: 'getProjectSnapshot', label: 'Your project' }],
      actions: ['askLead'],
      origin: 'deterministic',
      depth: 'normal',
    };
  }
  const item = getItem(step.id);
  const topic = topicsForStep(step.id).find((t) => resolveTopicForViewer(t.slug, applicabilityFromSnapshot(snapshot), 'client'));
  const yours = step.status === 'waiting on you';
  // Same form-field check as the where-now answer — the catalog item has no fields.
  const section = stepSection(step.id);
  const items =
    yours && item
      ? item.infoRequired.slice(0, 8).map((i) => clip(i))
      : ['Your project lead is working on this step. Nothing is needed from you yet.'];
  return {
    title: step.title,
    line: yours
      ? `Your next step is ${step.title}. It is waiting on you${step.dueLabel ? `, planned for ${step.dueLabel}` : ''}.`
      : `${step.title} is with your project lead${step.dueLabel ? `, planned for ${step.dueLabel}` : ''}. You'll be told when something is needed from you.`,
    // Only reviewed copy may ride on a deterministic ("Reviewed") answer.
    ...(topic && isReviewed(topic) ? { why: topic.body.why } : {}),
    visual: {
      type: 'nextStep',
      stepId: step.id,
      title: step.title,
      ...(step.dueLabel ? { dueLabel: step.dueLabel } : {}),
      items,
    },
    citations: [{ id: 'getProjectSnapshot', label: 'Your project' }],
    related: topic ? [topic.slug] : [],
    links: yours
      ? [
          {
            dest: { to: 'step', stepId: step.id, section },
            label: section === 'upload' ? 'Upload documents now' : 'Open this step',
            primary: true,
          },
          { dest: { to: 'incorporation', focusStepId: step.id }, label: 'Open Incorporation' },
        ]
      : [{ dest: { to: 'incorporation', focusStepId: step.id }, label: 'Open Incorporation', primary: true }],
    actions: ['openStep', 'askLead'],
    origin: 'deterministic',
    depth: 'normal',
    target: { stepId: step.id },
  };
}

/** `upload` only when the client's step form has a file field; otherwise `form`. */
function stepSection(stepId: string): 'upload' | 'form' {
  const item = getItem(stepId);
  const fields = item ? getClientResponseFields(item) : [];
  const hasFile = (list: readonly ChecklistField[]): boolean =>
    list.some((f) => f.type === 'file' || (f.entryFields ? hasFile(f.entryFields) : false));
  return hasFile(fields) ? 'upload' : 'form';
}

/** "Where is my incorporation now?" — phase rows straight from the gate, no model. */
export function phaseProgressAnswer(_snapshot: ProjectSnapshot, rows: readonly PhaseProgressRow[]): AnswerEnvelope {
  const done = rows.reduce((n, r) => n + r.done, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  const current = currentPhaseRow(rows);
  const step = current?.currentStep;
  const links: AnswerLink[] = [];
  if (step) {
    links.push({ dest: { to: 'incorporation', focusStepId: step.id }, label: 'Open Incorporation', primary: true });
    if (step.owner === 'client' && !step.locked) {
      links.push({ dest: { to: 'step', stepId: step.id, section: stepSection(step.id) }, label: clip(`Open ${step.title}`, 60) });
    }
  }
  return {
    title: 'Where your incorporation is now',
    line:
      current && step
        ? `${done} of ${total} steps are complete. You're in ${current.name}, on ${step.title}.`
        : 'All incorporation steps are complete.',
    why: 'Each phase unlocks the next, so this is the step that moves your company forward.',
    visual: {
      type: 'flow',
      stages: rows.map((r) => ({
        label: r.name,
        sub: `${r.done} of ${r.total}`,
        state: r.state === 'current' ? ('here' as const) : r.state === 'done' ? ('done' as const) : ('next' as const),
      })),
    },
    citations: [{ id: 'getPhaseProgress', label: 'Your project' }],
    ...(links.length > 0 ? { links } : {}),
    actions: ['askLead'],
    origin: 'deterministic',
    depth: 'normal',
    ...(step ? { target: { stepId: step.id } } : {}),
  };
}

const LIVE_DATA = (tool: string) => [{ id: tool, label: 'Live project data' }];

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Staff "query" suggestions: tool call + template, no model (§9). */
export function staffQueryAnswer(query: StaffQuery, data: StaffData, days = 7): AnswerEnvelope {
  const base = { origin: 'deterministic' as const, depth: 'normal' as const };
  switch (query) {
    case 'waitingOnClient': {
      const rows = waitingOnClient(data);
      const longest = rows.find((r) => r.daysWaiting !== null);
      return {
        ...base,
        line:
          rows.length === 0
            ? 'No projects are waiting on client action.'
            : `${plural(rows.length, 'project is', 'projects are')} waiting on client action.${longest ? ` ${longest.company} has waited longest.` : ''}`,
        visual: {
          type: 'projectRows',
          rows: rows.slice(0, 20).map((r) => ({
            engagementId: r.engagementId,
            name: clip(r.company, 160),
            step: clip(r.stepTitle, 160),
            meta: r.daysWaiting === null ? 'Waiting on client' : `Waiting ${plural(r.daysWaiting, 'day')}`,
            tone: r.daysWaiting !== null && r.daysWaiting > 7 ? 'late' : 'waiting',
          })),
        },
        citations: LIVE_DATA('listWaitingOnClient'),
        ...(rows[0]
          ? { links: [{ dest: { to: 'projectStep', engagementId: rows[0].engagementId, stepId: rows[0].stepId }, label: 'Open in Projects', primary: true }] }
          : {}),
        actions: rows.length > 0 ? ['openProject', 'draftReminder'] : [],
        ...(rows[0] ? { target: { engagementId: rows[0].engagementId } } : {}),
      };
    }
    case 'overdueAndDueSoon': {
      const rows = overdueAndDueSoon(data, days);
      const overdue = rows.filter((r) => r.overdue).length;
      return {
        ...base,
        line:
          rows.length === 0
            ? `Nothing is overdue or due in the next ${days} days.`
            : `${plural(overdue, 'filing is', 'filings are')} overdue and ${plural(rows.length - overdue, 'is', 'are')} due in the next ${days} days.`,
        visual: {
          type: 'projectRows',
          rows: rows.slice(0, 20).map((r) => ({
            engagementId: r.engagementId,
            name: clip(r.company, 160),
            step: clip(r.item, 160),
            meta: `${r.overdue ? 'Overdue since' : 'Due'} ${r.dueDate}`,
            tone: r.overdue ? 'late' : 'plain',
          })),
        },
        citations: LIVE_DATA('listOverdueAndDueSoon'),
        links: [{ dest: { to: 'compliance', filter: 'overdue' }, label: 'Open Compliance', primary: true }],
        actions: rows.length > 0 ? ['openProject'] : [],
      };
    }
    case 'pendingApprovals': {
      const rows = pendingApprovals(data);
      return {
        ...base,
        line: rows.length === 0 ? 'No approvals are pending.' : `${plural(rows.length, 'approval is', 'approvals are')} pending.`,
        visual: {
          type: 'projectRows',
          rows: rows.slice(0, 20).map((r) => ({
            engagementId: r.engagementId,
            name: clip(r.company, 160),
            step: clip(r.stepTitle, 160),
            meta:
              r.kind === 'send_to_client' ? 'Send to client' : r.kind === 'lead_request' ? 'Lead request' : 'Client submit',
            tone: r.daysWaiting !== null && r.daysWaiting > 2 ? 'late' : 'waiting',
          })),
        },
        citations: LIVE_DATA('listPendingApprovals'),
        links: [
          { dest: { to: 'approvals' }, label: 'Open Approvals', primary: true },
          ...(rows[0]
            ? [{ dest: { to: 'projectStep' as const, engagementId: rows[0].engagementId, stepId: rows[0].stepId }, label: 'Open in Projects' }]
            : []),
        ],
        actions: rows.length > 0 ? ['openProject'] : [],
      };
    }
    case 'firmPulse': {
      const p = firmPulse(data);
      return {
        ...base,
        line: `${plural(p.activeProjects, 'active project')}: ${p.waitingOnClients} waiting on clients, ${p.pendingApprovals} pending approval, ${plural(p.overdueFilings, 'overdue filing')}.`,
        visual: {
          type: 'metrics',
          items: [
            { k: 'Active projects', v: String(p.activeProjects) },
            { k: 'Waiting on clients', v: String(p.waitingOnClients) },
            { k: 'Pending approvals', v: String(p.pendingApprovals) },
            { k: 'Overdue filings', v: String(p.overdueFilings) },
          ],
        },
        citations: LIVE_DATA('getFirmPulse'),
        links: [
          { dest: { to: 'approvals' }, label: 'Open Approvals', primary: true },
          { dest: { to: 'compliance', filter: 'overdue' }, label: 'Open Compliance' },
        ],
        actions: [],
      };
    }
    case 'atRisk': {
      const rows = atRisk(data);
      return {
        ...base,
        line: rows.length === 0 ? 'No projects are flagged at risk.' : `${plural(rows.length, 'project is', 'projects are')} at risk.`,
        visual: {
          type: 'projectRows',
          rows: rows.slice(0, 20).map((r) => ({
            engagementId: r.engagementId,
            name: clip(r.company, 160),
            step: clip(r.step, 160),
            meta: clip(r.reason, 120),
            tone: 'late',
          })),
        },
        citations: LIVE_DATA('atRisk'),
        ...(rows[0] ? { links: [{ dest: { to: 'project', engagementId: rows[0].engagementId }, label: 'Open in Projects', primary: true }] } : {}),
        actions: rows.length > 0 ? ['openProject'] : [],
      };
    }
  }
}


const TOOL_QUERIES: Readonly<Record<string, StaffQuery>> = {
  listWaitingOnClient: 'waitingOnClient',
  listOverdueAndDueSoon: 'overdueAndDueSoon',
  listPendingApprovals: 'pendingApprovals',
};

/** The table a staff list tool's answer shows: code draws it, so the model never reads or writes the rows. */
export function staffToolCard(tool: string, data: StaffData, input: Record<string, unknown>): Visual | undefined {
  const query = TOOL_QUERIES[tool];
  return query ? staffQueryAnswer(query, data, numberArg(input, 'days', 7, 30)).visual : undefined;
}

/**
 * Deterministic answer for a suggestion, or null when it is not for this
 * shell / viewer. `loadStaff` is only called for staff query suggestions.
 */
export async function resolveSuggestion(
  id: string,
  opts: {
    shell: AskShell;
    snapshot: ProjectSnapshot | null;
    depth?: AnswerDepth;
    loadStaff: () => Promise<StaffData>;
    /** Client-redacted checklist state of the snapshot's engagement (phase progress). */
    clientState?: Record<string, ChecklistItemStateSlice | undefined>;
  },
): Promise<AnswerEnvelope | null> {
  const suggestion = getSuggestion(id);
  if (!suggestion || suggestion.shell !== opts.shell) return null;
  const ctx = applicabilityFromSnapshot(opts.snapshot);
  if (!appliesTo(suggestion.appliesTo, ctx)) return null;
  const h = suggestion.handler;
  switch (h.kind) {
    case 'topic': {
      const topic = resolveTopicForViewer(h.slug, ctx, opts.shell === 'client' ? 'client' : 'staff');
      return topic ? topicToAnswer(topic, { depth: opts.depth, shell: opts.shell, snapshot: opts.snapshot }) : null;
    }
    case 'nextStep':
      return opts.snapshot ? nextStepAnswer(opts.snapshot) : null;
    case 'phaseProgress':
      return opts.snapshot
        ? phaseProgressAnswer(opts.snapshot, buildPhaseProgress({ state: opts.clientState ?? {} }))
        : null;
    case 'query':
      return staffQueryAnswer(h.query, await opts.loadStaff());
    case 'previewClient':
      return { line: PREVIEW_CLIENT_LINE, citations: [], actions: [], origin: 'deterministic', depth: 'normal' };
  }
}
