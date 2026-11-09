import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getActiveCatalogItems, getItem } from '@/data/checklist';
import { listMeetings } from '@/db/repositories/board-meetings/meetings';
import { listBudgets } from '@/db/repositories/budgets/budgets';
import { listDocumentRequests } from '@/db/repositories/document-requests';
import { listDocuments } from '@/db/repositories/documents';
import { listBatches } from '@/db/repositories/labour-registers';
import { listTasks } from '@/db/repositories/tasks';
import { gateActiveCatalog, getStepGate } from '@/lib/checklist/checklist-step-gate';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { deriveStuckReason, STUCK_LABEL } from '@/lib/projects/project-stuck';
import { routeKey, type StaffData, type StaffEngagement } from './staff';
import { numberArg, type AskTool } from './types';

/**
 * STAFF AREA TOOLS — the rest of the sidebar, read-only. Each one reads through the same scoped
 * repository its page uses, so a lead sees only their clients and a manager only theirs. A
 * repository that refuses the role answers `not_available`, never an error the model retries.
 * Results carry company names, titles, statuses and dates; never identity numbers or file keys.
 */
export interface StaffAreaContext {
  ctx: AuthContext;
  data: StaffData;
}

const MODEL_ROWS = 8;

function forModel<Row>(rows: readonly Row[]) {
  return { count: rows.length, top: rows.slice(0, MODEL_ROWS) };
}

function findEngagement(data: StaffData, key: string | undefined): StaffEngagement | undefined {
  const q = key?.trim().toLowerCase();
  if (!q) return undefined;
  return (
    data.engagements.find((e) => [e.engagement.id, e.engagement.slug, e.dbId].some((k) => k?.toLowerCase() === q)) ??
    data.engagements.find((e) => e.engagement.companyName.toLowerCase().includes(q))
  );
}

/** Rows name the company the person knows, whichever id the repository returned. */
function companyOf(data: StaffData, engagementId: string): { engagementId: string; company: string } {
  const e = data.engagements.find((x) => x.dbId === engagementId || x.engagement.id === engagementId);
  return { engagementId: e ? routeKey(e) : engagementId, company: e?.engagement.companyName ?? 'Unknown client' };
}

/** Keeps a row when no company was asked for, or when it is that company. */
function forCompany(data: StaffData, company: unknown) {
  const wanted = typeof company === 'string' && company.trim() ? findEngagement(data, company) : null;
  if (typeof company === 'string' && company.trim() && !wanted) return { missing: true as const, keep: () => false };
  return {
    missing: false as const,
    keep: (engagementId: string) => !wanted || engagementId === wanted.dbId || engagementId === wanted.engagement.id,
  };
}

async function guarded<T>(read: () => Promise<T>): Promise<T | { error: 'not_available' }> {
  try {
    return await read();
  } catch (error) {
    console.warn('[ask-vcfo] area read refused', error);
    return { error: 'not_available' };
  }
}

const COMPANY_SCHEMA = {
  type: 'object' as const,
  properties: { company: { type: 'string', description: 'Optional: a client company name or project id to narrow to' } },
  required: [],
  additionalProperties: false,
};

/** Steps the firm side owns that are open now: the "My step" column of the lead's Today page. */
export function mySteps(data: StaffData) {
  const out: Array<{ engagementId: string; company: string; stepId: string; stepTitle: string; status: string }> = [];
  for (const e of data.engagements) {
    if (e.engagement.stage === 'Operational Readiness') continue;
    const gates = gateActiveCatalog(e.state, 'staff');
    for (const item of getActiveCatalogItems()) {
      if (item.responsibleRole === 'client') continue;
      if (getStepGate(gates, item.id).kind !== 'active') continue;
      const slice = e.state[item.id];
      if (slice?.status === 'completed' || slice?.status === 'not-applicable') continue;
      out.push({
        engagementId: routeKey(e),
        company: e.engagement.companyName,
        stepId: item.id,
        stepTitle: item.title,
        status: slice?.status ?? 'not-started',
      });
    }
  }
  // Overdue first; otherwise catalog order within each client.
  return out.sort((a, b) => Number(b.status === 'overdue') - Number(a.status === 'overdue'));
}

/** Projects that are not on track, with the reason the Today page's red chip uses. */
export function stuckProjects(data: StaffData) {
  const out: Array<{ engagementId: string; company: string; reason: string; overdueSteps: string[]; clientPendingSteps: string[] }> = [];
  for (const e of data.engagements) {
    const state = e.state as Record<string, ChecklistItemStateSlice>;
    const reason = deriveStuckReason(e.engagement, state);
    if (reason === 'on_track') continue;
    const titles = (status: string) =>
      Object.entries(state)
        .filter(([, slice]) => slice?.status === status)
        .map(([id]) => getItem(id)?.title ?? id)
        .slice(0, 5);
    out.push({
      engagementId: routeKey(e),
      company: e.engagement.companyName,
      reason: STUCK_LABEL[reason],
      overdueSteps: titles('overdue'),
      clientPendingSteps: titles('awaiting-client'),
    });
  }
  return out;
}

export const STAFF_AREA_TOOLS: Record<string, AskTool<StaffAreaContext>> = {
  listMySteps: {
    definition: {
      name: 'listMySteps',
      description:
        "Checklist steps the firm side owns that are open now, across the caller's clients (the \"My step\" column on Today). Use for \"what is my step\", \"what do I need to do\", \"what is on me for X\".",
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const wanted = input.company ? findEngagement(data, String(input.company)) : null;
      return forModel(mySteps(data).filter((r) => !wanted || r.engagementId === routeKey(wanted)));
    },
  },
  listStuck: {
    definition: {
      name: 'listStuck',
      description:
        'Projects that are not on track, with the reason (Blocked, Client pending, PM approval, Lead pending) and the overdue or client-pending step titles. Use for "what is stuck", "why is X stuck", "which steps are blocked".',
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const wanted = input.company ? findEngagement(data, String(input.company)) : null;
      return forModel(stuckProjects(data).filter((r) => !wanted || r.engagementId === routeKey(wanted)));
    },
  },
  listTasks: {
    definition: {
      name: 'listTasks',
      description: 'Open tasks (not done) on the Work board, as far as the caller can see. Set mine to true for only the caller\'s own tasks.',
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Optional company name or project id' },
          mine: { type: 'boolean', description: "Only tasks assigned to the caller" },
        },
        required: [],
        additionalProperties: false,
      },
    },
    run: async ({ ctx, data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const read = await guarded(() => listTasks(ctx));
      if ('error' in read) return read;
      const rows = read
        .filter((t) => t.status !== 'completed' && t.status !== 'not-applicable' && scope.keep(t.engagementId))
        .filter((t) => input.mine !== true || t.assigneeId === ctx.userId)
        .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))
        .map((t) => ({
          ...companyOf(data, t.engagementId),
          title: t.title ?? getItem(t.checklistKey)?.title ?? t.checklistKey,
          status: t.status,
          dueAt: t.dueAt ?? null,
          assignedToCaller: t.assigneeId === ctx.userId,
        }));
      return forModel(rows);
    },
  },
  listDocumentRequests: {
    definition: {
      name: 'listDocumentRequests',
      description: 'Document requests sent to clients that are still open: pending (client has not uploaded) or uploaded (waiting for the firm to review).',
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ ctx, data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const read = await guarded(() => listDocumentRequests(ctx));
      if ('error' in read) return read;
      const rows = read
        .filter((r) => (r.status === 'pending' || r.status === 'uploaded') && scope.keep(r.engagementId))
        .map((r) => ({ ...companyOf(data, r.engagementId), label: r.label, status: r.status, dueAt: r.dueAt ?? null }));
      return forModel(rows);
    },
  },
  listBoardMeetings: {
    definition: {
      name: 'listBoardMeetings',
      description: 'Board and general meetings that are not finished, with their date, stage (notice, minutes) and status word.',
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ ctx, data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const read = await guarded(() => listMeetings(ctx));
      if ('error' in read) return read;
      const rows = read
        .filter((m) => m.word !== 'Done' && scope.keep(m.engagementId))
        .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
        .map((m) => ({
          ...companyOf(data, m.engagementId),
          meeting: `${m.meetingType} ${m.meetingNo}`.trim(),
          date: m.meetingDate,
          status: m.word,
          stage: m.stage,
        }));
      return forModel(rows);
    },
  },
  listLabourRegisters: {
    definition: {
      name: 'listLabourRegisters',
      description: 'Labour register periods that are not signed off yet: state, period and stage (open, mapping, ready, generated).',
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ ctx, data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const read = await guarded(() => listBatches(ctx));
      if ('error' in read) return read;
      const rows = read
        .filter((b) => b.status !== 'attested' && b.status !== 'superseded' && scope.keep(b.engagementId))
        .map((b) => ({ ...companyOf(data, b.engagementId), state: b.stateCode, periodFrom: b.periodFrom, periodTo: b.periodTo, stage: b.status }));
      return forModel(rows);
    },
  },
  listBudgets: {
    definition: {
      name: 'listBudgets',
      description: 'Client budgets: financial year, status, sections done out of total, and the grand total in rupees.',
      input_schema: COMPANY_SCHEMA,
    },
    run: async ({ ctx, data }, input) => {
      const scope = forCompany(data, input.company);
      if (scope.missing) return { error: 'no_match' };
      const read = await guarded(() => listBudgets(ctx));
      if ('error' in read) return read;
      const rows = read
        .filter((b) => scope.keep(b.engagementId))
        .map((b) => ({
          ...companyOf(data, b.engagementId),
          title: b.title,
          financialYear: b.fyName,
          status: b.status,
          sections: `${b.sectionsDone} of ${b.sectionsTotal}`,
          grandTotal: b.grandTotal,
        }));
      return forModel(rows);
    },
  },
  listVaultDocuments: {
    definition: {
      name: 'listVaultDocuments',
      description: "Files in one client's document vault, newest first, with category, step and review status. Needs a company.",
      input_schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Client company name or project id' },
          limit: { type: 'number', description: 'How many files, default 8, max 20' },
        },
        required: ['company'],
        additionalProperties: false,
      },
    },
    run: async ({ ctx, data }, input) => {
      const e = findEngagement(data, typeof input.company === 'string' ? input.company : undefined);
      if (!e) return { error: 'no_match' };
      const read = await guarded(() => listDocuments(ctx, e.dbId));
      if ('error' in read) return read;
      const limit = numberArg(input, 'limit', 8, 20);
      return {
        engagementId: routeKey(e),
        company: e.engagement.companyName,
        count: read.length,
        files: [...read]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
          .map((d) => ({
            fileName: d.fileName,
            category: d.category,
            step: d.stepId ? (getItem(d.stepId)?.title ?? d.stepId) : null,
            sharedWithClient: d.sharedWithClient,
            review: d.reviewStatus,
            added: d.createdAt.slice(0, 10),
          })),
      };
    },
  },
};
