import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

const getEngagementById = vi.fn();
const getOwnAskAttachments = vi.fn();
const getObjectBuffer = vi.fn();
const putObject = vi.fn();
const deleteObject = vi.fn();
const createDocument = vi.fn();
const deleteVaultDocument = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: (...a: unknown[]) => getOwnAskAttachments(...a) }));
vi.mock('@/db/repositories/documents', () => ({
  createDocument: (...a: unknown[]) => createDocument(...a),
  deleteVaultDocument: (...a: unknown[]) => deleteVaultDocument(...a),
}));
vi.mock('@/storage/s3', () => ({
  getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a),
  putObject: (...a: unknown[]) => putObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  bucketKey: (b: string, k: string) => `${b}/${k}`,
}));

const { fileToVault } = await import('./file-to-vault');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const NOW = new Date('2026-11-09T10:00:00Z');
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: 'c1', runId: null, now: NOW, via: 'ask' };
const ACME = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Acme Private Limited' };
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';
const input = { engagementId: ACME.id, attachmentId: ATTACHMENT, category: 'Contracts', value: 'lease deed.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockResolvedValue(ACME);
  getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'lease deed.pdf', s3Key: 'ask/u/l.pdf', contentType: 'application/pdf', sizeBytes: 900 }]);
  getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-1.4'));
  createDocument.mockResolvedValue({ id: 'doc-1', fileName: 'lease deed.pdf' });
  deleteVaultDocument.mockResolvedValue({ id: 'doc-1', fileName: 'lease deed.pdf' });
});

describe('documents.fileToVault', () => {
  it('previews the file, the category and the client', async () => {
    const row = (await fileToVault.preview(actx, input))!.rows[0]!;
    expect(row.displayNew).toBe('lease deed.pdf into the vault under Contracts for Acme Private Limited');
    expect(row.label).toBe('Vault · Contracts');
    expect(row.heldReason).toBeUndefined();
  });

  it('refuses a category over 64 characters and holds a missing file', async () => {
    expect(fileToVault.input.safeParse({ ...input, category: 'x'.repeat(65) }).success).toBe(false);
    getOwnAskAttachments.mockResolvedValue([]);
    expect((await fileToVault.recheck!(actx, input, {})).heldReason).toMatch(/no longer available/);
  });

  it('copies the bytes to engagement-documents, indexes them and undoes with the vault soft delete', async () => {
    const result = await fileToVault.execute(actx, input);
    expect(result.ok).toBe(true);
    const key = `engagement-documents/${ACME.id}/vault/${NOW.getTime()}-lease deed.pdf`;
    expect(putObject).toHaveBeenCalledWith(key, expect.any(Buffer), 'application/pdf');
    expect(createDocument).toHaveBeenCalledWith(lead, { engagementId: ACME.id, fileName: 'lease deed.pdf', objectKey: key, category: 'Contracts', contentType: 'application/pdf', sizeBytes: 8 });
    if (!result.ok) return;
    expect((await fileToVault.undo!(actx, result.undo!)).ok).toBe(true);
    expect(deleteVaultDocument).toHaveBeenCalledWith(lead, 'doc-1');
  });

  it('removes the copied object when indexing fails', async () => {
    createDocument.mockRejectedValue(new Error('Engagement not found or not permitted'));
    await expect(fileToVault.execute(actx, input)).rejects.toThrow();
    expect(deleteObject).toHaveBeenCalled();
  });

  it('keeps a file a checklist step now holds', async () => {
    deleteVaultDocument.mockRejectedValue(new Error('in_use'));
    expect(await fileToVault.undo!(actx, { documentId: 'doc-1' })).toMatchObject({ ok: false, error: expect.stringMatching(/checklist step/) });
  });
});
