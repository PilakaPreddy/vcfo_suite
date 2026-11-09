// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import { getActiveCatalogItems } from '@/data/checklist';
import type { ChangesetDraft, ChangesetRowDraft } from '@/lib/ask/changeset/types';
import type { LlmRequest } from '@/lib/ask/provider';
import type { DropState } from '@/lib/ask/drop/types';
import { DROP_CASES, GSTR3B_TASK_ID, type DropCase, type DropRowExpect } from './cases';

/**
 * The drop's golden set through the whole job, with the model replaced. The job's own steps run for
 * real (unpack, read each file, sort, build one card per client, write the closing message), and so
 * do the reader, the sorting, the data router and every action's preview. Only the repositories,
 * storage and the model are memory: the model's replies are the ones written in `cases.ts`.
 *
 * It proves the plumbing, not the model, as `golden.test.ts` does for the chat's fill path.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const owner: AuthContext = { userId: '0b7a4c1e-0000-4000-8000-000000000001', email: 'lead@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };

/** The checklist done up to the directors' step, with the registered office state on pre-14. */
function checklistState(officeState: string): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const item of getActiveCatalogItems()) {
    if (item.id === 'pre-15') break;
    state[item.id] = { status: 'completed', reviewStatus: 'accepted', responses: item.id === 'pre-14' ? { registeredOfficeState: officeState } : {} };
  }
  return state;
}

const ACME = { id: '1a1a1a1a-0000-4000-8000-000000000001', slug: 'acme', companyName: 'Acme Technologies Private Limited', ownershipType: 'indian', checklistState: checklistState('Karnataka') };
const ROUTE = { id: '2b2b2b2b-0000-4000-8000-000000000002', slug: 'routeware', companyName: 'Routeware Solutions LLP', ownershipType: 'indian', checklistState: checklistState('Kerala') };
const CLIENTS = { acme: ACME, routeware: ROUTE } as const;
const GSTR3B = { id: GSTR3B_TASK_ID, engagementId: ROUTE.id, name: 'GSTR-3B', activityName: null, periodLabel: 'Aug 2026', title: 'GSTR-3B (Aug 2026)', dueDate: '2026-09-20' };

type Row = {
  id: string;
  profileId: string;
  kind: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
  s3Key: string | null;
  status: string;
  relativePath: string | null;
  parentId: string | null;
  runId: string;
  conversationId: string | null;
  docType?: string | null;
  sensitive?: boolean;
  error?: string | null;
};

let run: Record<string, unknown>;
let rows: Row[];
let objects: Map<string, Buffer>;
let steps: unknown[];
let messages: Array<{ text: string; answer: unknown }>;
let cards: Array<{ id: string; draft: ChangesetDraft }>;
let prompts: string[];
let logs: string[];
let modelReplies: DropCase['model'];

vi.mock('@/db/repositories/ask-runs', () => ({
  askRunActor: async () => ({ ctx: owner, run: { ...run } }),
  updateAskRun: async (_ctx: AuthContext, _id: string, patch: Record<string, unknown>) => {
    Object.assign(run, patch);
  },
  appendAskRunStep: async (_ctx: AuthContext, _id: string, step: unknown) => {
    steps.push(step);
  },
  lockAskRun: async (_ctx: AuthContext, _id: string, engagementId: string) => {
    run.engagementId = engagementId;
    return true;
  },
}));
vi.mock('@/db/repositories/ask-attachments', () => ({
  listAskRunAttachments: async (ctx: AuthContext, runId: string) => rows.filter((r) => r.profileId === ctx.userId && r.runId === runId),
  getOwnAskAttachments: async (ctx: AuthContext, ids: string[]) => rows.filter((r) => ids.includes(r.id) && r.profileId === ctx.userId),
  updateOwnAskAttachment: async (_ctx: AuthContext, id: string, patch: Partial<Row>) => {
    Object.assign(rows.find((r) => r.id === id)!, patch);
  },
  createAskAttachment: async (ctx: AuthContext, input: Partial<Row>) => {
    const row = { id: randomUUID(), profileId: ctx.userId, status: 'uploaded', relativePath: null, parentId: null, contentType: null, ...input } as Row;
    rows.push(row);
    return row;
  },
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: async (_ctx: AuthContext, _conversationId: string, input: { text: string; answer: unknown }) => {
    messages.push(input);
    return { id: `msg-${messages.length}` };
  },
}));
vi.mock('@/db/repositories/ask-changesets', () => ({
  createAskChangeset: async (_ctx: AuthContext, input: { draft: ChangesetDraft }) => {
    const id = randomUUID();
    cards.push({ id, draft: input.draft });
    return id;
  },
  appendAskChangesetRows: async () => false,
  listAskRunChangesets: async () => [],
}));
vi.mock('@/db/repositories/ask-usage', () => ({ systemTodayTokenTotal: async () => 0, systemRecordAskUsage: async () => undefined }));
vi.mock('@/lib/ask/rate-limit', () => ({ checkAskRateLimit: async () => ({ ok: true }) }));
vi.mock('@/db/repositories/engagements', () => ({
  listEngagements: async () => [ACME, ROUTE].map(({ id, slug, companyName }) => ({ id, slug, companyName })),
  getEngagementById: async (_ctx: AuthContext, id: string) => [ACME, ROUTE].find((e) => e.id === id) ?? null,
  getEngagementBySlug: async (_ctx: AuthContext, slug: string) => [ACME, ROUTE].find((e) => e.slug === slug) ?? null,
  checklistStateFromRow: (row: { checklistState: unknown }) => row.checklistState ?? {},
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: async () => null }));
vi.mock('@/db/repositories/engagement-managers-membership', () => ({ listManagerIdsForEngagement: async () => [] }));
vi.mock('@/db/repositories/notifications', () => ({ createNotificationsForUsers: async () => undefined }));
vi.mock('@/db/repositories/labour-registers', () => ({
  // Acme already files a Karnataka register; Routeware has no batch yet.
  listBatches: async (_ctx: AuthContext, opts: { engagementId: string }) =>
    opts.engagementId === ACME.id ? [{ id: 'b-acme-jul', engagementId: ACME.id, stateCode: 'KA', periodFrom: '2026-07-01', periodTo: '2026-07-31', markedReadyAt: null }] : [],
  getColumnMap: async () => null,
  listUploads: async () => [],
  getBatch: async () => null,
  openBatch: async () => null,
  removeUpload: async () => undefined,
  restoreUpload: async () => undefined,
  recordUpload: async () => undefined,
  uploadSnapshot: (row: unknown) => row,
}));
vi.mock('@/db/repositories/compliance-tasks', () => ({
  TASK_ATTACHMENT_MAX_BYTES: 15 * 1024 * 1024,
  ComplianceTaskError: class ComplianceTaskError extends Error {},
  listTasks: async (_ctx: AuthContext, q: { engagementId: string }) => ({ tasks: q.engagementId === ROUTE.id ? [GSTR3B] : [], today: '2026-11-09' }),
  getTask: async (_ctx: AuthContext, id: string) => {
    if (id !== GSTR3B.id) throw new Error('not found');
    return { ...GSTR3B, can: { upload: true }, deliverable: null };
  },
  addTaskAttachment: async () => null,
  removeTaskAttachment: async () => undefined,
  markTaskDeliverable: async () => undefined,
}));
vi.mock('@/db/repositories/documents', () => ({ createDocument: async () => null, deleteVaultDocument: async () => null }));
vi.mock('@/storage/s3', () => ({
  getObjectBuffer: async (key: string) => objects.get(key) ?? null,
  putObject: async (key: string, body: Buffer | string) => {
    objects.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
  },
  deleteObject: async (key: string) => {
    objects.delete(key);
  },
  bucketKey: (bucket: string, key: string) => `${bucket}/${key}`,
}));
// Only the four file actions and the checklist's own; loading every area would pull in every repository.
vi.mock('@/lib/actions/registry', () => ({
  getAction: async (name: string) => {
    const [labour, compliance, documents, checklist] = await Promise.all([
      import('@/lib/actions/labour/upload-sheet'),
      import('@/lib/actions/compliance/attach-evidence'),
      import('@/lib/actions/documents/file-to-vault'),
      import('@/lib/actions/checklist'),
    ]);
    return [labour.uploadSheet, compliance.attachEvidence, documents.fileToVault, ...checklist.actions].find((a) => a.name === name) ?? null;
  },
}));
vi.mock('@/lib/ask/provider', async (load) => ({
  ...(await load<object>()),
  getAskProvider: async () => ({
    name: 'mock',
    complete: async (req: LlmRequest) => {
      const prompt = JSON.stringify(req.messages);
      const system = JSON.stringify(req.system);
      prompts.push(prompt);
      let reply: unknown;
      if (system.includes('You match') || system.includes('You file documents')) {
        // The choosers pick nothing: every placement in this set is code's own.
        reply = { picks: [] };
      } else {
        const found = modelReplies?.find((m) => prompt.includes(m.match));
        reply = { parts: [found?.reply ?? { docType: 'other', company: null, values: [] }] };
      }
      return { model: req.model, content: [{ type: 'text', text: JSON.stringify(reply) }], stopReason: 'end_turn', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    },
  }),
}));

const { runAskDrop } = await import('@/lib/ask/drop/run');

/** Puts a case's files where the start route would: one attachment row each, its bytes in storage. */
function seed(fill: DropCase): string {
  const runId = randomUUID();
  run = { id: runId, workflow: 'drop', status: 'queued', conversationId: 'conv-1', engagementId: null, budgetTokens: 400_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, state: { files: [], groups: [], unplaced: [], progress: { done: 0, total: 0, label: 'Waiting' }, instruction: fill.instruction } };
  for (const entry of fill.entries) {
    const bytes = entry.paste !== undefined ? Buffer.from(entry.paste) : readFileSync(path.join(FIXTURES, entry.fixture!));
    const fileName = entry.paste !== undefined ? 'paste.txt' : entry.path.split('/').pop()!;
    const s3Key = `ask/attachments/${owner.userId}/${randomUUID()}/${fileName}`;
    objects.set(s3Key, bytes);
    rows.push({
      id: randomUUID(),
      profileId: owner.userId,
      kind: entry.paste !== undefined ? 'paste' : 'file',
      fileName,
      contentType: null,
      sizeBytes: bytes.length,
      s3Key,
      status: 'uploaded',
      relativePath: entry.paste !== undefined || !entry.path.includes('/') ? null : entry.path,
      parentId: null,
      runId,
      conversationId: 'conv-1',
    });
  }
  return runId;
}

interface DropOutcome {
  status: string;
  state: DropState;
  cards: Array<{ id: string; draft: ChangesetDraft }>;
  messages: Array<{ text: string; answer: unknown }>;
  steps: unknown[];
  prompts: string[];
  logs: string[];
}

const outcomes = new Map<string, DropOutcome>();
const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeAll(async () => {
  for (const method of ['log', 'warn', 'error', 'info'] as const) {
    consoleSpies.push(vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }));
  }
  for (const fill of DROP_CASES) {
    rows = [];
    objects = new Map();
    steps = [];
    messages = [];
    cards = [];
    prompts = [];
    logs = [];
    modelReplies = fill.model;
    const runId = seed(fill);
    const done = await runAskDrop(runId);
    outcomes.set(fill.id, { status: done?.status ?? 'none', state: run.state as DropState, cards, messages, steps, prompts, logs });
  }
});

afterAll(() => {
  for (const spy of consoleSpies) spy.mockRestore();
});


const matches = (row: ChangesetRowDraft, want: DropRowExpect) =>
  row.action === want.action &&
  Object.entries(want.target ?? {}).every(([k, v]) => (row.target as Record<string, unknown>)[k] === v) &&
  (want.newValue === undefined || String(row.newValue).toLowerCase() === want.newValue.toLowerCase()) &&
  (want.shows === undefined || `${row.displayNew ?? ''}`.includes(want.shows));

/** Everything a person or a log can see: the card's words, never the value it would save. */
function visible(outcome: DropOutcome): string {
  const cardText = outcome.cards.map(({ draft }) => JSON.stringify({ title: draft.title, rows: draft.rows.map((r) => ({ label: r.label, displayOld: r.displayOld, displayNew: r.displayNew, source: r.source, heldReason: r.heldReason, checks: r.checks })) }));
  return [JSON.stringify(outcome.state), JSON.stringify(outcome.steps), JSON.stringify(outcome.messages), ...cardText, ...outcome.logs].join('\n');
}

describe('drop golden set, the whole job with a mock model', () => {
  it.each(DROP_CASES.map((fill) => fill.id))('%s finishes without failing', (id) => {
    const outcome = outcomes.get(id)!;
    expect(outcome.status, outcome.logs.join('\n')).not.toBe('failed');
    expect(outcome.messages, 'one closing message').toHaveLength(1);
  });

  it.each(DROP_CASES.map((fill) => fill.id))('%s makes the expected cards, one per client', (id) => {
    const fill = DROP_CASES.find((c) => c.id === id)!;
    const outcome = outcomes.get(id)!;
    expect(outcome.cards.map((c) => c.draft.engagementId).sort()).toEqual(fill.expect.cards.map((c) => CLIENTS[c.client].id).sort());
    expect(outcome.state.groups.map((g) => g.changesetId).sort()).toEqual(outcome.cards.map((c) => c.id).sort());
    for (const want of fill.expect.cards) {
      const card = outcome.cards.find((c) => c.draft.engagementId === CLIENTS[want.client].id)!;
      const summary = card.draft.rows.map((r) => ({ action: r.action, target: r.target, newValue: r.newValue, displayNew: r.displayNew }));
      for (const row of want.rows) expect(card.draft.rows.some((r) => matches(r, row)), `${want.client}: ${JSON.stringify(row)} in ${JSON.stringify(summary, null, 1)}`).toBe(true);
      if (!want.partial) expect(card.draft.rows, JSON.stringify(summary, null, 1)).toHaveLength(want.rows.length);
      expect(card.draft.title).toMatch(new RegExp(`^${CLIENTS[want.client].companyName}: \\d+ files?, \\d+ values?$`));
    }
    expect(outcome.state.unplaced.map((u) => u.path)).toEqual(fill.expect.unplaced ?? []);
  });

  it('a card only ever proposes T2 rows, which a person approves before anything is saved', () => {
    for (const outcome of outcomes.values()) {
      for (const { draft } of outcome.cards) expect(draft.tier).toBe('T2');
    }
  });

  it('skips an .xls file before reading it, and asks for .xlsx', () => {
    for (const fill of DROP_CASES.filter((c) => c.expect.skipped)) {
      const { state, prompts: asked } = outcomes.get(fill.id)!;
      for (const skip of fill.expect.skipped!) {
        const file = state.files.find((f) => f.path === skip.path);
        expect(file, skip.path).toMatchObject({ status: 'skipped' });
        expect(file!.reason).toContain(skip.reason);
      }
      expect(asked.some((p) => p.includes('legacy .xls placeholder'))).toBe(false);
    }
  });

  it('flags the registered office state as assumed on the card and in the file list', () => {
    const { state, cards: made } = outcomes.get('sheet-with-no-state')!;
    expect(made[0]!.draft.rows[0]!.target).toMatchObject({ stateCode: 'KL', stateAssumed: true });
    expect(state.files[0]!.destination).toBe('Labour register: Paysheet, Kerala (assumed), August 2026');
  });

  it('reads labour sheets with no model call', () => {
    for (const id of ['acme-payroll-folder', 'sheet-with-no-state', 'xls-skipped']) expect(outcomes.get(id)!.prompts, id).toEqual([]);
  });

  it('never shows a raw identity number in the run, its steps, the messages, the card or the logs', () => {
    for (const fill of DROP_CASES) {
      const text = visible(outcomes.get(fill.id)!);
      for (const secret of fill.expect.never ?? []) expect(text.includes(secret), `${fill.id}: ${secret}`).toBe(false);
      // The PAN shape in general, whatever the case named.
      expect(text, fill.id).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/);
    }
  });

  it('never sends a raw identity number in a text prompt', () => {
    const { prompts: asked } = outcomes.get('pasted-email-prose')!;
    expect(asked.length).toBeGreaterThan(0);
    for (const prompt of asked) expect(prompt).not.toContain('GHIPI9012L');
  });

  it('reads an instruction inside a file as data and does nothing beyond filing the file', () => {
    const outcome = outcomes.get('instruction-hidden-in-file')!;
    const read = outcome.prompts.find((p) => p.includes('SYSTEM NOTE'))!;
    expect(read).toMatch(/<document>[\s\S]*SYSTEM NOTE[\s\S]*<\/document>/);
    expect(outcome.cards).toHaveLength(1);
    expect(outcome.cards[0]!.draft.engagementId).toBe(ACME.id);
    expect(outcome.cards[0]!.draft.rows.map((r) => r.action)).toEqual(['documents.fileToVault']);
    expect(outcome.state.unplaced).toEqual([]);
  });

  it('writes a closing message that names each card', () => {
    const outcome = outcomes.get('two-clients-in-one-zip')!;
    expect(outcome.messages[0]!.text).toContain(ACME.companyName);
    expect(outcome.messages[0]!.text).toContain(ROUTE.companyName);
    expect(outcome.state.files.filter((f) => f.status === 'placed').map((f) => f.path).sort()).toEqual(['month-end/Acme/Payroll/Aug-2026/paysheet.xlsx', 'month-end/Routeware/GSTR-3B Aug-2026.pdf']);
  });
});
