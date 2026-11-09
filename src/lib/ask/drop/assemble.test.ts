import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ReadResult } from '@/lib/ask/data-router/types';
import type { DropFile, DropState } from './types';

/**
 * The drop's sorting with the repositories, the actions and the card builder replaced by memory:
 * one card per client, the "Where should these go?" list, the labour state rules, and a reply that
 * puts a waiting file onto that client's open card.
 */

const owner: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };
const acme = { id: 'e-acme', slug: 'acme', companyName: 'Acme Technologies Private Limited' };
const route = { id: 'e-route', slug: 'routeware', companyName: 'Routeware Solutions LLP' };

let batches: Record<string, Array<{ stateCode: string; periodFrom: string }>>;
let officeState: Record<string, string>;
let tasks: Record<string, Array<{ id: string; name: string; title: string; periodLabel: string | null; dueDate: string }>>;
let cardCalls: Array<{ companyName: string; fileRows: Array<{ action: string; target: Record<string, unknown>; source: unknown }>; reads: unknown[]; appendTo: string | null; title: string; copyIds: string[] }>;
let locked: string[];
let run: Record<string, unknown>;
let storedReads: Map<string, ReadResult>;

vi.mock('@/db/repositories/ask-runs', () => ({
  lockAskRun: async (_ctx: AuthContext, _runId: string, engagementId: string) => {
    locked.push(engagementId);
    return true;
  },
  updateAskRun: async (_ctx: AuthContext, _id: string, patch: Record<string, unknown>) => {
    Object.assign(run, patch);
  },
}));
vi.mock('@/db/repositories/engagements', () => ({
  listEngagements: async () => [acme, route],
  getEngagementById: async (_ctx: AuthContext, id: string) => {
    const e = [acme, route].find((x) => x.id === id);
    return e ? { ...e, state: { 'pre-14': { responses: { registeredOfficeState: officeState[id] ?? '' } } } } : null;
  },
  checklistStateFromRow: (row: { state: unknown }) => row.state,
}));
vi.mock('@/db/repositories/labour-registers', () => ({ listBatches: async (_ctx: AuthContext, opts: { engagementId: string }) => batches[opts.engagementId] ?? [] }));
vi.mock('@/db/repositories/compliance-tasks', () => ({ listTasks: async (_ctx: AuthContext, q: { engagementId: string }) => ({ tasks: tasks[q.engagementId] ?? [], today: '2026-11-09' }) }));
vi.mock('@/db/repositories/ask-usage', () => ({ systemTodayTokenTotal: async () => 0, systemRecordAskUsage: async () => undefined }));
vi.mock('@/lib/ask/rate-limit', () => ({ checkAskRateLimit: async () => ({ ok: true }) }));
vi.mock('@/lib/actions/labour/upload-sheet', () => ({ SLOT_LABEL: { paysheet: 'Paysheet', attendance: 'Attendance', overtime: 'Overtime', employees: 'Employee list', leave: 'Leave' } }));
vi.mock('@/lib/actions/checklist/rules', () => ({ checkResponseRow: () => ({ checks: [] }), needsManagerApproval: () => false }));
vi.mock('@/lib/actions/registry', () => ({
  getAction: async (name: string) => ({
    input: { safeParse: (data: unknown) => ({ success: true, data }) },
    preview: async (_actx: unknown, input: Record<string, unknown>) => {
      const { value, ...target } = input;
      return { title: name, tier: 'T2', engagementId: input.engagementId, rows: [{ action: name, target, label: name, oldValue: '', newValue: value, displayOld: '', displayNew: String(value), sensitive: false, source: null, checks: [] }] };
    },
  }),
}));
vi.mock('@/lib/ask/do/entry', () => ({
  prepareClientCard: async (
    _ctx: AuthContext,
    _runCtx: unknown,
    input: { row: { companyName: string }; reads: unknown[]; fileRows: never[]; appendTo: string | null; title: (rows: unknown[]) => string; copyFor: (id: string) => boolean },
  ) => {
    const changesetId = input.appendTo ?? `cs-${cardCalls.length + 1}`;
    cardCalls.push({
      companyName: input.row.companyName,
      fileRows: input.fileRows,
      reads: input.reads,
      appendTo: input.appendTo,
      title: input.title(input.fileRows),
      copyIds: ['pan-1', 'paste-1'].filter((id) => input.copyFor(id)),
    });
    return { kind: 'card', changesetId, count: input.fileRows.length, held: 0, managerRows: 0, placed: 0, questions: [] };
  },
}));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: async () => null, putObject: async () => undefined }));
vi.mock('./run', () => ({
  dropStateOf: (r: { state: DropState }) => r.state,
  dropStatus: (s: DropState) => (s.unplaced.length > 0 ? 'waiting_reply' : s.groups.length > 0 ? 'waiting_approval' : 'done'),
  loadDropReads: async (_ctx: AuthContext, _runId: string, files: DropFile[]) =>
    files.filter((f) => f.status === 'read' && storedReads.has(f.attachmentId)).map((f) => ({ attachment: { id: f.attachmentId, kind: 'file', fileName: f.path.split('/').pop()! }, path: f.path, result: storedReads.get(f.attachmentId)! })),
}));

const { assembleDrop } = await import('./assemble');
const { answerDropReply } = await import('./reply');

const result = (patch: Partial<ReadResult> = {}): ReadResult => ({ docType: 'other', company: null, values: [], parts: [], sensitive: false, usedModel: false, ...patch });
const sheet = (periodHint?: { from: string; to: string }): Partial<ReadResult> => ({ docType: 'labour_sheet', labourSheet: { slot: 'paysheet', headers: ['Emp code'], ...(periodHint ? { periodHint } : {}) } });

function drop(entries: Array<[id: string, path: string, read: Partial<ReadResult>, kind?: string]>) {
  for (const [id, , read] of entries) storedReads.set(id, result(read));
  return {
    reads: entries.map(([id, path, read, kind]) => ({ attachment: { id, kind: kind ?? 'file', fileName: path.split('/').pop()! }, path, result: result(read) })),
    files: entries.map(([id, path]): DropFile => ({ attachmentId: id, path, size: 10, status: 'read' })),
  };
}

const runCtx = {
  ctx: owner,
  runId: 'run-1',
  progress: () => undefined,
  provider: async () => {
    throw new Error('no model in this test');
  },
};

beforeEach(() => {
  batches = {};
  officeState = {};
  tasks = {};
  cardCalls = [];
  locked = [];
  storedReads = new Map();
  run = { id: 'run-1', workflow: 'drop', status: 'waiting_reply', conversationId: 'conv-1', budgetTokens: 400_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
});

describe('assembleDrop', () => {
  it('makes one card per client, each file in its place', async () => {
    batches[acme.id] = [{ stateCode: 'KA', periodFrom: '2026-07-01' }];
    tasks[route.id] = [{ id: 't-1', name: 'GSTR-3B', title: 'GSTR-3B (Aug 2026)', periodLabel: 'Aug 2026', dueDate: '2026-09-20' }];
    const { reads, files } = drop([
      ['pay-1', 'Acme/Payroll/Aug-2026/pay.xlsx', sheet()],
      ['lease-1', 'Acme/lease.pdf', { docType: 'rent_agreement' }],
      ['gst-1', 'Routeware/GSTR-3B Aug-2026.pdf', { docType: 'form' }],
      ['pan-1', 'Routeware/KYC/pan.pdf', { docType: 'pan_card', values: [{ label: 'PAN', value: 'ABCDE1234F', page: 1, person: 'Asha', confidence: 1 }] }],
    ]);
    const out = await assembleDrop({ runCtx, conversationId: 'conv-1', instruction: 'fill this in', reads, files, now: new Date() });

    expect(out.groups).toEqual([
      { engagementId: acme.id, companyName: acme.companyName, changesetId: 'cs-1' },
      { engagementId: route.id, companyName: route.companyName, changesetId: 'cs-2' },
    ]);
    expect(out.unplaced).toEqual([]);
    expect(locked).toEqual([]); // two clients: the run is not locked to one
    const [acmeCard, routeCard] = cardCalls;
    expect(acmeCard!.fileRows.map((r) => r.action)).toEqual(['labour.uploadSheet', 'documents.fileToVault']);
    expect(acmeCard!.fileRows[0]!.target).toMatchObject({ stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31', slot: 'paysheet' });
    expect(acmeCard!.fileRows[0]!.target).not.toHaveProperty('stateAssumed');
    expect(acmeCard!.fileRows[1]!.target).toMatchObject({ category: 'Contracts' });
    expect(acmeCard!.fileRows[0]!.source).toEqual({ kind: 'attachment', attachmentId: 'pay-1', fileName: 'pay.xlsx', path: 'Acme/Payroll/Aug-2026/pay.xlsx' });
    expect(acmeCard!.title).toBe('Acme Technologies Private Limited: 2 files, 0 values');
    expect(routeCard!.fileRows.map((r) => [r.action, r.target.taskId])).toEqual([['compliance.attachEvidence', 't-1']]);
    // The PAN card's values and its copy go through the data router on Routeware's card.
    expect(routeCard!.reads).toHaveLength(1);
    expect(routeCard!.copyIds).toEqual(['pan-1']);
    expect(out.files.map((f) => [f.attachmentId, f.status, f.engagementId, f.destination])).toEqual([
      ['pay-1', 'placed', acme.id, 'Labour register: Paysheet, Karnataka, August 2026'],
      ['lease-1', 'placed', acme.id, 'Vault: Contracts'],
      ['gst-1', 'placed', route.id, 'Compliance: GSTR-3B (Aug 2026)'],
      ['pan-1', 'placed', route.id, "Checklist: director's copy"],
    ]);
  });

  it('lists the files it cannot place, each with its reason', async () => {
    const { reads, files } = drop([
      ['x-1', 'scan.pdf', {}],
      ['pay-1', 'Acme/pay.xlsx', sheet()],
      ['att-1', 'Acme/attendance.xlsx', sheet({ from: '2026-08-01', to: '2026-08-31' })],
    ]);
    const out = await assembleDrop({ runCtx, conversationId: 'conv-1', instruction: 'fill this in', reads, files, now: new Date() });
    expect(out.unplaced).toEqual([
      { attachmentId: 'x-1', path: 'scan.pdf', reason: 'I could not tell which client this is for.' },
      { attachmentId: 'pay-1', path: 'Acme/pay.xlsx', reason: 'I could not tell which month this sheet is for.' },
      { attachmentId: 'att-1', path: 'Acme/attendance.xlsx', reason: 'I could not tell which state this register is for.' },
    ]);
    expect(out.groups).toEqual([]);
    expect(out.files.every((f) => f.status === 'read')).toBe(true);
  });

  it('takes the state from the names when the client has no batch, else the registered office, flagged as assumed', async () => {
    officeState[acme.id] = 'Kerala';
    const { reads, files } = drop([
      ['a-1', 'Acme/Hyderabad/Aug-2026/pay.xlsx', sheet()],
      ['a-2', 'Acme/Sep-2026/pay.xlsx', sheet()],
    ]);
    await assembleDrop({ runCtx, conversationId: 'conv-1', instruction: '', reads, files, now: new Date() });
    expect(cardCalls[0]!.fileRows.map((r) => [r.target.stateCode, r.target.stateAssumed ?? false])).toEqual([
      ['TG', false],
      ['KL', true],
    ]);
    expect(locked).toEqual([acme.id]);
  });
});

describe('answerDropReply', () => {
  it('puts a numbered file onto that client\'s open card and keeps the rest waiting', async () => {
    const { files } = drop([
      ['x-1', 'scan one.pdf', {}],
      ['x-2', 'scan two.pdf', {}],
    ]);
    const state: DropState = {
      files: [...files, { attachmentId: 'r-0', path: 'Routeware/old.pdf', size: 1, status: 'placed', engagementId: route.id }],
      groups: [{ engagementId: route.id, companyName: route.companyName, changesetId: 'cs-route' }],
      unplaced: [
        { attachmentId: 'x-1', path: 'scan one.pdf', reason: 'I could not tell which client this is for.' },
        { attachmentId: 'x-2', path: 'scan two.pdf', reason: 'I could not tell which client this is for.' },
      ],
      progress: { done: 3, total: 3, label: 'Done' },
      instruction: 'fill this in',
    };
    run.state = state;
    const done = await answerDropReply(owner, run as never, 'file 1 is Routeware', { now: new Date() });

    expect(cardCalls).toHaveLength(1);
    expect(cardCalls[0]).toMatchObject({ companyName: route.companyName, appendTo: 'cs-route' });
    expect(cardCalls[0]!.fileRows.map((r) => [r.action, r.target.attachmentId])).toEqual([['documents.fileToVault', 'x-1']]);
    const next = run.state as DropState;
    expect(next.unplaced.map((u) => u.attachmentId)).toEqual(['x-2']);
    expect(next.groups).toEqual(state.groups);
    expect(next.files.find((f) => f.attachmentId === 'x-1')).toMatchObject({ status: 'placed', engagementId: route.id });
    expect(run.status).toBe('waiting_reply');
    expect(done.answer.changesetId).toBe('cs-route');
    expect(done.answer.line).toMatch(/^Done: I added 1 file/);
    expect(done.answer.line).toMatch(/1\. scan two\.pdf/);
  });

  it('places every waiting file with "all of them", on a new card for a new client', async () => {
    const { files } = drop([
      ['x-1', 'one.pdf', {}],
      ['x-2', 'two.pdf', {}],
    ]);
    run.state = {
      files,
      groups: [],
      unplaced: files.map((f) => ({ attachmentId: f.attachmentId, path: f.path, reason: 'I could not tell which client this is for.' })),
      progress: { done: 2, total: 2, label: 'Done' },
      instruction: '',
    } satisfies DropState;
    await answerDropReply(owner, run as never, 'all of them are Acme', { now: new Date() });
    const next = run.state as DropState;
    expect(next.unplaced).toEqual([]);
    expect(next.groups).toEqual([{ engagementId: acme.id, companyName: acme.companyName, changesetId: 'cs-1' }]);
    expect(cardCalls[0]!.fileRows).toHaveLength(2);
    expect(run.status).toBe('waiting_approval');
  });

  it('leaves the files out on "leave them"', async () => {
    const { files } = drop([['x-1', 'one.pdf', {}]]);
    run.state = { files, groups: [], unplaced: [{ attachmentId: 'x-1', path: 'one.pdf', reason: 'r' }], progress: { done: 1, total: 1, label: 'Done' }, instruction: '' } satisfies DropState;
    const done = await answerDropReply(owner, run as never, 'leave them', { now: new Date() });
    expect((run.state as DropState).files[0]).toMatchObject({ status: 'skipped' });
    expect(run.status).toBe('done');
    expect(done.answer.line).toMatch(/left that file out/);
  });
});
