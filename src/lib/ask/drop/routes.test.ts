// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * The drop routes' ownership checks, with the repositories replaced: only the run's owner can start a
 * drop, read its progress or add files to it, and a started drop takes no more files.
 */

const lead: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern', internId: 'i-1' };
let caller: AuthContext = lead;
const RUN = 'a0000000-0000-4000-8000-00000000000a';
let runs: Array<Record<string, unknown>>;

vi.mock('@/lib/ask/route-guard', () => ({ requireAsk: async () => ({ ok: true, ctx: caller }) }));
vi.mock('@/db/repositories/ask-runs', () => ({
  getOwnAskRun: async (ctx: AuthContext, id: string) => runs.find((r) => r.id === id && r.profileId === ctx.userId) ?? null,
  startQueuedAskRun: vi.fn(async () => true),
  createAskRun: vi.fn(async (_ctx: AuthContext, input: Record<string, unknown>) => ({ id: RUN, ...input })),
}));
const createDrop = vi.fn(async (ctx: AuthContext, input: { runId: string }) => {
  const run = runs.find((r) => r.id === input.runId && r.profileId === ctx.userId);
  if (!run) return { ok: false, reason: 'not_found' };
  if (run.status !== 'queued' || run.startedAt) return { ok: false, reason: 'started' };
  return { ok: true, row: { id: 'att-1', fileName: 'pay.xlsx' } };
});
vi.mock('@/db/repositories/ask-attachments', () => ({
  createDropAttachment: (...a: unknown[]) => createDrop(...(a as [AuthContext, { runId: string }])),
  createAskAttachment: vi.fn(async () => ({ id: 'paste-1' })),
  listAskRunAttachments: vi.fn(async () => [{ id: 'att-1', kind: 'file' }]),
}));
vi.mock('@/db/repositories/ask-conversations', () => ({
  getAskConversation: async (ctx: AuthContext, id: string) => (id === 'c0000000-0000-4000-8000-00000000000c' && ctx.userId === lead.userId ? { id } : null),
  createAskConversation: async () => ({ id: 'new-conv' }),
}));
vi.mock('@/db/repositories/ask-messages', () => ({ appendAskMessage: vi.fn(async () => ({ id: 'm' })) }));
const queue = vi.fn(async () => 'queued');
vi.mock('@/lib/ask/drop/run', () => ({ queueAskDrop: (...a: unknown[]) => queue(...(a as [])) }));
const deleteObject = vi.fn(async () => undefined);
vi.mock('@/storage/s3', () => ({ putObject: vi.fn(async () => undefined), deleteObject: (...a: unknown[]) => deleteObject(...(a as [])) }));

const start = await import('../../../../app/api/ask/drops/[id]/start/route');
const progress = await import('../../../../app/api/ask/runs/[id]/route');
const attachments = await import('../../../../app/api/ask/attachments/route');
const drops = await import('../../../../app/api/ask/drops/route');

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const upload = (dropId: string, name = 'pay.xlsx') => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], name));
  form.set('dropId', dropId);
  form.set('relativePath', 'Acme/../Payroll/pay.xlsx');
  return new Request('http://x/api/ask/attachments', { method: 'POST', body: form });
};

beforeEach(() => {
  vi.clearAllMocks();
  caller = lead;
  runs = [{ id: RUN, profileId: lead.userId, workflow: 'drop', status: 'queued', startedAt: null, conversationId: 'conv-1', state: null }];
});

describe('drop routes', () => {
  it('starts the owner’s drop once and queues it', async () => {
    const res = await start.POST(json({ message: 'fill this in for Acme' }), params(RUN));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ runId: RUN });
    expect(queue).toHaveBeenCalledWith(RUN, { profileId: lead.userId });
  });

  it('hides another person’s drop and progress', async () => {
    caller = { ...lead, userId: 'someone-else' };
    expect((await start.POST(json({}), params(RUN))).status).toBe(404);
    expect((await progress.GET(new Request('http://x'), params(RUN))).status).toBe(404);
    expect((await attachments.POST(upload(RUN))).status).toBe(404);
    expect(deleteObject).toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });

  it('refuses to start or add files to a drop that already started', async () => {
    runs[0]!.startedAt = new Date();
    expect((await start.POST(json({}), params(RUN))).status).toBe(409);
    expect((await attachments.POST(upload(RUN))).status).toBe(409);
  });

  it('refuses .xls in a drop with a request to save as .xlsx, and cleans the folder path', async () => {
    const res = await attachments.POST(upload(RUN, 'old.xls'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/save it as \.xlsx/);
    await attachments.POST(upload(RUN));
    expect(createDrop.mock.calls[0]![1]).toMatchObject({ relativePath: 'Acme/Payroll/pay.xlsx' });
  });

  it('returns the owner’s progress', async () => {
    const res = await progress.GET(new Request('http://x'), params(RUN));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: RUN, status: 'queued', files: [], groups: [], unplaced: [], answerMessageId: null });
  });

  it('opens a drop in the caller’s own conversation only, and refuses clients', async () => {
    expect((await drops.POST(json({ conversationId: 'c0000000-0000-4000-8000-00000000000c' }))).status).toBe(201);
    expect((await drops.POST(json({ conversationId: 'f0000000-0000-4000-8000-00000000000f' }))).status).toBe(404);
    caller = { ...lead, role: 'client' };
    expect((await drops.POST(json({}))).status).toBe(403);
  });
});
