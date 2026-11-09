import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

const getEngagementById = vi.fn();
const getOwnAskAttachments = vi.fn();
const getObjectBuffer = vi.fn();
const putObject = vi.fn();
const deleteObject = vi.fn();
const repo = {
  getBatch: vi.fn(),
  getColumnMap: vi.fn(),
  listBatches: vi.fn(),
  listUploads: vi.fn(),
  openBatch: vi.fn(),
  recordUpload: vi.fn(),
  removeUpload: vi.fn(),
  restoreUpload: vi.fn(),
};
vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: (...a: unknown[]) => getOwnAskAttachments(...a) }));
vi.mock('@/db/repositories/labour-registers', () => ({
  ...Object.fromEntries(Object.entries(repo).map(([name, fn]) => [name, (...a: unknown[]) => fn(...a)])),
  uploadSnapshot: (row: Record<string, unknown>) => ({ ...row, uploadedAt: '2026-09-01T00:00:00.000Z' }),
}));
vi.mock('@/storage/s3', () => ({
  getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a),
  putObject: (...a: unknown[]) => putObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  bucketKey: (b: string, k: string) => `${b}/${k}`,
}));

const { uploadSheet } = await import('./upload-sheet');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: 'e1', conversationId: 'c1', runId: null, now: new Date('2026-11-09T10:00:00Z'), via: 'ask' };
const ACME = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Acme Private Limited' };
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';
const BATCH = { id: 'b1', engagementId: ACME.id, stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31', markedReadyAt: null };
const OLD = { id: 'up-old', slot: 'paysheet', fileName: 'july-fix.xlsx', objectKey: 'labour-registers/x/b1/paysheet-old', sha256: 'old', rowCount: 40 };

const input = {
  engagementId: ACME.id,
  stateCode: 'KA',
  periodFrom: '2026-08-01',
  periodTo: '2026-08-31',
  slot: 'paysheet' as const,
  attachmentId: ATTACHMENT,
  value: 'aug-payroll.xlsx',
};

let sheetBytes: Buffer;
async function paysheet(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Paysheet');
  ws.addRow(['Emp Code', 'Employee Name', 'Basic', 'Net Pay']);
  ws.addRow(['E1', 'Asha Rao', 20000, 18000]);
  ws.addRow(['E2', 'Ravi Kumar', 22000, 19500]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(async () => {
  vi.clearAllMocks();
  sheetBytes ??= await paysheet();
  getEngagementById.mockResolvedValue(ACME);
  getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'aug-payroll.xlsx', s3Key: 'ask/u/aug.xlsx', contentType: null, sizeBytes: sheetBytes.byteLength }]);
  getObjectBuffer.mockResolvedValue(sheetBytes);
  deleteObject.mockResolvedValue(undefined);
  repo.listBatches.mockResolvedValue([]);
  repo.listUploads.mockResolvedValue([]);
  repo.getColumnMap.mockResolvedValue(null);
  repo.openBatch.mockResolvedValue(BATCH);
  repo.getBatch.mockResolvedValue(BATCH);
  repo.recordUpload.mockImplementation(async (_ctx: unknown, row: Record<string, unknown>) => ({ id: 'up-new', ...row }));
});

describe('labour.uploadSheet', () => {
  it('previews the client, state, period, slot, rows and columns before anything is stored', async () => {
    const draft = await uploadSheet.preview(actx, { ...input, stateAssumed: true });
    const row = draft!.rows[0]!;
    expect(row.action).toBe('labour.uploadSheet');
    expect(row.displayNew).toContain('Acme Private Limited');
    expect(row.displayNew).toContain('Karnataka (assumed from the registered office)');
    expect(row.displayNew).toContain('August 2026');
    expect(row.displayNew).toContain('Paysheet');
    expect(row.displayNew).toContain('2 rows');
    expect(row.displayNew).toContain('columns: Emp Code, Employee Name, Basic, Net Pay');
    expect(row.displayNew).toMatch(/\d+ of \d+ columns matched/);
    expect(row.source).toEqual({ kind: 'attachment', attachmentId: ATTACHMENT, fileName: 'aug-payroll.xlsx' });
    expect(row.heldReason).toBeUndefined();
    expect(row.target).not.toHaveProperty('value');
    expect(putObject).not.toHaveBeenCalled();
  });

  it('says which file it replaces when the slot is full', async () => {
    repo.listBatches.mockResolvedValue([BATCH]);
    repo.listUploads.mockResolvedValue([OLD]);
    const checked = await uploadSheet.recheck!(actx, input, {});
    expect(checked.canApply).toBe(true);
    expect(checked.displayNew).toContain('replaces july-fix.xlsx');
    expect(checked.oldValue).toBe('july-fix.xlsx');
  });

  it('holds the row when the period is closed', async () => {
    repo.listBatches.mockResolvedValue([{ ...BATCH, markedReadyAt: new Date() }]);
    const checked = await uploadSheet.recheck!(actx, input, {});
    expect(checked.canApply).toBe(false);
    expect(checked.heldReason).toMatch(/period is closed/);
  });

  it('holds the row for an unknown state or a file that is gone', async () => {
    expect((await uploadSheet.recheck!(actx, { ...input, stateCode: 'ZZ' }, {})).heldReason).toMatch(/choose the state/);
    getOwnAskAttachments.mockResolvedValue([]);
    expect((await uploadSheet.recheck!(actx, { ...input, attachmentId: '33333333-3333-4333-8333-333333333333' }, {})).heldReason).toMatch(/no longer available/);
  });

  it('refuses a project outside the person’s scope', async () => {
    getEngagementById.mockResolvedValue(null);
    expect((await uploadSheet.recheck!(actx, input, {})).canApply).toBe(false);
  });

  it('opens the batch, stores the sheet and keeps the replaced upload for undo', async () => {
    repo.listUploads.mockResolvedValue([OLD]);
    const result = await uploadSheet.execute(actx, input);
    expect(result.ok).toBe(true);
    expect(repo.openBatch).toHaveBeenCalledWith(lead, { engagementId: ACME.id, stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31' });
    expect(repo.recordUpload).toHaveBeenCalledWith(lead, expect.objectContaining({ batchId: 'b1', slot: 'paysheet', rowCount: 2 }));
    if (!result.ok) return;
    expect(result.href).toBe('/app/intern/labour-registers?batch=b1');
    expect(result.undo).toMatchObject({ batchId: 'b1', slot: 'paysheet', uploadId: 'up-new', previous: { id: 'up-old', fileName: 'july-fix.xlsx' } });
  });

  it('refuses to execute into a closed batch', async () => {
    repo.openBatch.mockResolvedValue({ ...BATCH, markedReadyAt: new Date() });
    const result = await uploadSheet.execute(actx, input);
    expect(result.ok).toBe(false);
    expect(repo.recordUpload).not.toHaveBeenCalled();
  });

  it('undo puts the replaced upload back, or removes a new one', async () => {
    const previous = { ...OLD, uploadedAt: '2026-09-01T00:00:00.000Z' };
    repo.listUploads.mockResolvedValue([{ id: 'up-new', slot: 'paysheet', sha256: 'new' }]);
    const restored = await uploadSheet.undo!(actx, { batchId: 'b1', slot: 'paysheet', uploadId: 'up-new', sha256: 'new', objectKey: 'k-new', previous } as never);
    expect(restored.ok).toBe(true);
    expect(repo.restoreUpload).toHaveBeenCalledWith(lead, 'b1', previous);
    expect(deleteObject).toHaveBeenCalledWith('k-new');

    const removed = await uploadSheet.undo!(actx, { batchId: 'b1', slot: 'paysheet', uploadId: 'up-new', sha256: 'new', objectKey: 'k-new', previous: null } as never);
    expect(removed.ok).toBe(true);
    expect(repo.removeUpload).toHaveBeenCalledWith(lead, 'b1', 'up-new');
  });

  it('undo is refused once the batch is locked or the slot changed', async () => {
    repo.getBatch.mockResolvedValue({ ...BATCH, markedReadyAt: new Date() });
    const locked = await uploadSheet.undo!(actx, { batchId: 'b1', slot: 'paysheet', uploadId: 'up-new', sha256: 'new', objectKey: 'k', previous: null } as never);
    expect(locked).toMatchObject({ ok: false, error: expect.stringMatching(/closed/) });

    repo.getBatch.mockResolvedValue(BATCH);
    repo.listUploads.mockResolvedValue([{ id: 'up-other', slot: 'paysheet', sha256: 'other' }]);
    const changed = await uploadSheet.undo!(actx, { batchId: 'b1', slot: 'paysheet', uploadId: 'up-new', sha256: 'new', objectKey: 'k', previous: null } as never);
    expect(changed.ok).toBe(false);
    expect(repo.removeUpload).not.toHaveBeenCalled();
    expect(repo.restoreUpload).not.toHaveBeenCalled();
  });
});
