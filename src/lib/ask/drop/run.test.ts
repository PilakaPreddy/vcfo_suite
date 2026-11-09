import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { AuthContext } from '@/auth/guards';
import type { LlmRequest } from '@/lib/ask/provider';

/**
 * The drop job's steps with the repositories, storage and model replaced by memory: the in-process
 * fallback, the run's token budget, acting as the run's owner, and ZIP unpacking into child rows.
 */

const owner: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };

type Row = { id: string; kind: string; fileName: string; s3Key: string | null; sizeBytes: number; status: string; relativePath: string | null; parentId: string | null; runId: string; profileId: string };
let run: Record<string, unknown>;
let rows: Row[];
let objects: Map<string, Buffer>;
let actor: { ctx: AuthContext; run: Record<string, unknown> } | null;
const ctxSeen: AuthContext[] = [];
const messages: Array<{ text: string; answer: { changesetId?: string; runId?: string } }> = [];
let modelUsage = 10;
let nextId = 0;

vi.mock('@/db/repositories/ask-runs', () => ({
  askRunActor: async () => (actor ? { ctx: actor.ctx, run: { ...run } } : null),
  updateAskRun: async (ctx: AuthContext, _id: string, patch: Record<string, unknown>) => {
    ctxSeen.push(ctx);
    Object.assign(run, patch);
  },
  appendAskRunStep: async () => undefined,
}));
vi.mock('@/db/repositories/ask-attachments', () => ({
  listAskRunAttachments: async (ctx: AuthContext) => {
    ctxSeen.push(ctx);
    return rows.filter((r) => r.profileId === ctx.userId);
  },
  getOwnAskAttachments: async (ctx: AuthContext, ids: string[]) => rows.filter((r) => ids.includes(r.id) && r.profileId === ctx.userId),
  updateOwnAskAttachment: async (_ctx: AuthContext, id: string, patch: Partial<Row>) => {
    Object.assign(rows.find((r) => r.id === id)!, patch);
  },
  createAskAttachment: async (ctx: AuthContext, input: Partial<Row>) => {
    const row = { id: `child-${(nextId += 1)}`, status: 'uploaded', relativePath: null, parentId: null, profileId: ctx.userId, ...input } as Row;
    rows.push(row);
    return row;
  },
}));
vi.mock('@/db/repositories/ask-messages', () => ({
  appendAskMessage: async (_ctx: AuthContext, _conversationId: string, input: { text: string; answer: { changesetId?: string } }) => {
    messages.push(input as never);
    return { id: 'msg-1' };
  },
}));
vi.mock('@/db/repositories/ask-usage', () => ({ systemTodayTokenTotal: async () => 0, systemRecordAskUsage: async () => undefined }));
vi.mock('@/lib/ask/rate-limit', () => ({ checkAskRateLimit: async () => ({ ok: true }) }));
vi.mock('@/storage/s3', () => ({
  getObjectBuffer: async (key: string) => objects.get(key) ?? null,
  putObject: async (key: string, body: Buffer | string) => {
    objects.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
  },
}));
vi.mock('@/lib/ask/provider', async (load) => ({
  ...(await load<object>()),
  getAskProvider: async () => ({
    name: 'mock',
    complete: async (req: LlmRequest) => ({
      model: req.model,
      content: [{ type: 'text', text: JSON.stringify({ docType: 'other', company: 'Acme', values: [{ label: 'Name', value: 'Asha', page: 1, person: null, confidence: 1 }] }) }],
      stopReason: 'end_turn',
      usage: { inputTokens: modelUsage, outputTokens: modelUsage, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  }),
}));
// Reading is the data router's own; here it is a stub that spends tokens through the run's provider.
vi.mock('@/lib/ask/data-router/read', async (load) => {
  const real = await load<typeof import('@/lib/ask/data-router/read')>();
  const read = async (deps: { provider: () => Promise<{ complete: (r: LlmRequest) => Promise<unknown> }>; model: string }) => {
    const provider = await deps.provider();
    await provider.complete({ model: deps.model, messages: [] } as unknown as LlmRequest);
    return { docType: 'other', company: 'Acme', values: [{ label: 'Name', value: 'Asha', page: 1, person: null, confidence: 1 }], sensitive: false, usedModel: true };
  };
  return { ...real, readFile: async (_f: unknown, deps: never) => read(deps), readPaste: async (_t: string, deps: never) => read(deps) };
});
const assemble = vi.fn(async (input: { files: Array<Record<string, unknown>>; reads: unknown[] }) => ({
  groups: input.reads.length > 0 ? [{ engagementId: 'eng-1', companyName: 'Acme', changesetId: 'd0000000-0000-4000-8000-00000000000d' }] : [],
  unplaced: [],
  files: input.files.map((f) => (f.status === 'read' ? { ...f, status: 'placed' } : f)),
  notes: [],
}));
vi.mock('./assemble', () => ({ assembleDrop: (input: never) => assemble(input) }));
const send = vi.fn(async () => {
  throw new Error('no inngest');
});
vi.mock('@/jobs/client', () => ({ inngest: { send: (...a: unknown[]) => send(...(a as [])) } }));

const { queueAskDrop, runAskDrop, dropUnpackStep } = await import('./run');

function file(id: string, fileName: string, data: Buffer | Uint8Array, extra: Partial<Row> = {}): Row {
  const key = `k/${id}/${fileName}`;
  objects.set(key, Buffer.from(data));
  return { id, kind: 'file', fileName, s3Key: key, sizeBytes: data.length, status: 'uploaded', relativePath: null, parentId: null, runId: 'run-1', profileId: owner.userId, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  objects = new Map();
  ctxSeen.length = 0;
  messages.length = 0;
  modelUsage = 10;
  nextId = 0;
  run = { id: 'run-1', workflow: 'drop', status: 'queued', conversationId: 'conv-1', budgetTokens: 400_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, state: { files: [], groups: [], unplaced: [], progress: { done: 0, total: 0, label: '' }, instruction: 'fill this in for Acme' } };
  rows = [file('a-1', 'notes.txt', Buffer.from('Name: Asha')), file('a-2', 'pan.pdf', Buffer.from('%PDF'), { relativePath: 'Acme/KYC/pan.pdf' })];
  actor = { ctx: owner, run };
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('queueAskDrop', () => {
  it('runs the drop in this process when Inngest is not reachable', async () => {
    expect(await queueAskDrop('run-1', { profileId: owner.userId })).toBe('inline');
    await flush();
    expect(send).toHaveBeenCalledWith({ name: 'ask/drop.run', data: { runId: 'run-1', profileId: owner.userId } });
    expect(run.status).toBe('waiting_approval');
    const state = run.state as { files: Array<{ status: string; path: string }>; groups: unknown[]; answerMessageId?: string };
    expect(state.files.map((f) => [f.path, f.status])).toEqual([
      ['notes.txt', 'placed'],
      ['Acme/KYC/pan.pdf', 'placed'],
    ]);
    expect(state.answerMessageId).toBe('msg-1');
    expect(messages[0]!.answer.changesetId).toBe('d0000000-0000-4000-8000-00000000000d');
    expect(messages[0]!.text).toMatch(/card for Acme/);
  });
});

describe('runAskDrop', () => {
  it('acts only as the run owner, rebuilt from the run', async () => {
    await runAskDrop('run-1');
    expect(ctxSeen.length).toBeGreaterThan(0);
    expect(ctxSeen.every((c) => c === owner)).toBe(true);
  });

  it('does nothing when the owner can no longer be rebuilt', async () => {
    actor = null;
    expect(await runAskDrop('run-1')).toBeNull();
    expect(ctxSeen).toEqual([]);
    expect(messages).toEqual([]);
  });

  it('stops at the token budget, keeps what it prepared and lists what it did not read', async () => {
    run.budgetTokens = 30;
    modelUsage = 10; // the first file spends 20, the second still starts, the third is over
    rows.push(file('a-3', 'third.txt', Buffer.from('x')));
    await runAskDrop('run-1');
    expect(run.status).toBe('over_budget');
    const state = run.state as { files: Array<{ path: string; status: string; reason?: string }>; overBudget?: boolean; groups: unknown[] };
    expect(state.overBudget).toBe(true);
    expect(state.groups).toHaveLength(1);
    expect(state.files.find((f) => f.path === 'third.txt')).toMatchObject({ status: 'skipped' });
    expect(messages[0]!.text).toMatch(/Not read: third\.txt/);
  });

  it('unpacks a ZIP into child rows with their folder paths, once', async () => {
    const zip = zipSync({ 'Payroll/Aug-2026/pay.csv': strToU8('a,b\n1,2'), 'old.xls': strToU8('x'), '__MACOSX/x': strToU8('x') });
    rows = [file('z-1', 'Acme.zip', zip)];
    const first = await dropUnpackStep('run-1');
    const child = rows.find((r) => r.parentId === 'z-1')!;
    expect(child.relativePath).toBe('Acme/Payroll/Aug-2026/pay.csv');
    expect(first).toEqual([child.id]);
    const state = run.state as { files: Array<{ path: string; status: string; reason?: string }> };
    expect(state.files.find((f) => f.path === 'Acme/old.xls')).toMatchObject({ status: 'skipped' });
    // A retry of the step does not unpack again.
    await dropUnpackStep('run-1');
    expect(rows.filter((r) => r.parentId === 'z-1')).toHaveLength(1);
  });
});
