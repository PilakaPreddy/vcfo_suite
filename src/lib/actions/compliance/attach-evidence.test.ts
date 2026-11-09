import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

class ComplianceTaskError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const getEngagementById = vi.fn();
const getOwnAskAttachments = vi.fn();
const getObjectBuffer = vi.fn();
const getTask = vi.fn();
const addTaskAttachment = vi.fn();
const removeTaskAttachment = vi.fn();
const markTaskDeliverable = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: (...a: unknown[]) => getOwnAskAttachments(...a) }));
vi.mock('@/db/repositories/compliance-tasks', () => ({
  ComplianceTaskError,
  TASK_ATTACHMENT_MAX_BYTES: 15 * 1024 * 1024,
  getTask: (...a: unknown[]) => getTask(...a),
  addTaskAttachment: (...a: unknown[]) => addTaskAttachment(...a),
  removeTaskAttachment: (...a: unknown[]) => removeTaskAttachment(...a),
  markTaskDeliverable: (...a: unknown[]) => markTaskDeliverable(...a),
}));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a) }));

const { attachEvidence } = await import('./attach-evidence');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: 'c1', runId: null, now: new Date('2026-11-09T10:00:00Z'), via: 'ask' };
const ACME = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Acme Private Limited' };
const TASK_ID = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';
const TASK = { id: TASK_ID, engagementId: ACME.id, name: 'GSTR-3B', periodLabel: 'Aug 2026', deliverable: null, can: { upload: true } };
const input = { engagementId: ACME.id, taskId: TASK_ID, attachmentId: ATTACHMENT, value: 'gstr3b-aug.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockResolvedValue(ACME);
  getTask.mockResolvedValue(TASK);
  getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'gstr3b-aug.pdf', s3Key: 'ask/u/g.pdf', contentType: 'application/pdf', sizeBytes: 1200 }]);
  getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-1.4'));
  addTaskAttachment.mockResolvedValue({ id: 'ta-1', fileName: 'gstr3b-aug.pdf' });
});

describe('compliance.attachEvidence', () => {
  it('previews the file as the task deliverable', async () => {
    const draft = await attachEvidence.preview(actx, input);
    const row = draft!.rows[0]!;
    expect(row.displayNew).toBe('gstr3b-aug.pdf as the deliverable on GSTR-3B (Aug 2026) for Acme Private Limited');
    expect(row.heldReason).toBeUndefined();
    expect(row.source).toMatchObject({ kind: 'attachment', attachmentId: ATTACHMENT });
  });

  it('shows the deliverable it replaces', async () => {
    getTask.mockResolvedValue({ ...TASK, deliverable: { id: 'x', fileName: 'old.pdf' } });
    expect((await attachEvidence.recheck!(actx, input, {})).displayOld).toBe('Deliverable now: old.pdf');
  });

  it('holds a file over the task limit, a task on another client and a task the person cannot add to', async () => {
    getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'big.pdf', s3Key: 'k', sizeBytes: 16 * 1024 * 1024 }]);
    expect((await attachEvidence.recheck!(actx, input, {})).heldReason).toMatch(/at most 15/);
    getTask.mockResolvedValue({ ...TASK, engagementId: 'other' });
    expect((await attachEvidence.recheck!(actx, input, {})).heldReason).toMatch(/task is not available/);
    getTask.mockRejectedValue(new ComplianceTaskError(404, 'not_found'));
    expect((await attachEvidence.recheck!(actx, input, {})).canApply).toBe(false);
    getTask.mockResolvedValue({ ...TASK, can: { upload: false } });
    getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'a.pdf', s3Key: 'k', sizeBytes: 10 }]);
    expect((await attachEvidence.recheck!(actx, input, {})).heldReason).toMatch(/cannot add files/);
  });

  it('attaches the bytes as the deliverable and undoes by removing them', async () => {
    const result = await attachEvidence.execute(actx, input);
    expect(result.ok).toBe(true);
    expect(addTaskAttachment).toHaveBeenCalledWith(lead, TASK_ID, { name: 'gstr3b-aug.pdf', type: 'application/pdf', bytes: expect.any(Buffer) }, { deliverable: true });
    if (!result.ok) return;
    expect(result.undo).toEqual({ taskId: TASK_ID, taskAttachmentId: 'ta-1', previousDeliverableId: null });
    expect((await attachEvidence.undo!(actx, result.undo!)).ok).toBe(true);
    expect(removeTaskAttachment).toHaveBeenCalledWith(lead, TASK_ID, 'ta-1');
    expect(markTaskDeliverable).not.toHaveBeenCalled();
  });

  it('marks the deliverable it replaced again on undo', async () => {
    getTask.mockResolvedValue({ ...TASK, deliverable: { id: 'ta-old', fileName: 'old.pdf' } });
    const result = await attachEvidence.execute(actx, input);
    if (!result.ok) throw new Error('expected the attach to work');
    expect(result.undo).toEqual({ taskId: TASK_ID, taskAttachmentId: 'ta-1', previousDeliverableId: 'ta-old' });
    const undone = await attachEvidence.undo!(actx, result.undo!);
    expect(undone).toEqual({ ok: true, summary: 'Removed the file from the task and marked the earlier deliverable again' });
    expect(removeTaskAttachment).toHaveBeenCalledWith(lead, TASK_ID, 'ta-1');
    expect(markTaskDeliverable).toHaveBeenCalledWith(lead, TASK_ID, 'ta-old');
  });

  it('still undoes when the replaced deliverable was removed since', async () => {
    markTaskDeliverable.mockRejectedValueOnce(new ComplianceTaskError(404, 'not_found'));
    const undone = await attachEvidence.undo!(actx, { taskId: TASK_ID, taskAttachmentId: 'ta-1', previousDeliverableId: 'ta-old' });
    expect(undone).toEqual({ ok: true, summary: 'Removed the file from the task; the earlier deliverable is no longer there' });
  });

  it('reports a refused undo instead of throwing', async () => {
    removeTaskAttachment.mockRejectedValue(new ComplianceTaskError(403, 'forbidden'));
    expect(await attachEvidence.undo!(actx, { taskId: TASK_ID, taskAttachmentId: 'ta-1' })).toEqual({ ok: false, error: 'You cannot remove this file.' });
  });
});
