import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * The attachment repository: `available` comes from storage, never from a status; another
 * engagement's request is refused by the underlying scope; a file over 6 MB is refused before its
 * bytes are read.
 */

vi.mock('server-only', () => ({}));
const getSpiceAttachments = vi.fn();
const getDocPackInputs = vi.fn();
const getDocumentById = vi.fn();
const listObjects = vi.fn();
const getObjectBuffer = vi.fn();
vi.mock('@/db/repositories/spice-attachments', () => ({ getSpiceAttachments: (...a: unknown[]) => getSpiceAttachments(...a) }));
vi.mock('@/db/repositories/doc-pack', () => ({ getDocPackInputs: (...a: unknown[]) => getDocPackInputs(...a) }));
vi.mock('@/db/repositories/documents', () => ({ getDocumentById: (...a: unknown[]) => getDocumentById(...a) }));
vi.mock('@/storage/demo-placeholders', () => ({ documentStorageKey: (k: string) => `engagement-documents/${k}` }));
vi.mock('@/storage/s3', () => ({
  bucketKey: (b: string, p: string) => `${b}/${p}`,
  listObjects: (...a: unknown[]) => listObjects(...a),
  getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a),
}));

const { listAssistAttachments, readAssistAttachment, MAX_ATTACHMENT_BYTES } = await import('@/db/repositories/assist-attachments');

const DB = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const ctx: AuthContext = { userId: 'u', email: 'u@x', name: 'U', role: 'intern', internId: 'i' };
const item = (key: string, over: Record<string, unknown> = {}) => ({ key, label: key, stepId: 'pre-1', stepTitle: 'S', status: 'done', detail: 'Received', vaultDocumentId: null, ...over });
const COI = `${DB}/certificateOfIncorporationUrl/1700000000000-coi.pdf`;

function inputs(state: Record<string, unknown>, brRow: unknown = null) {
  getDocPackInputs.mockResolvedValue({ ok: true, inputs: { dbId: DB, checklistState: state, brRow, engagement: {} } });
}

beforeEach(() => {
  vi.clearAllMocks();
  listObjects.mockResolvedValue([]);
});

describe('listAssistAttachments', () => {
  it('passes a refusal through and reads no storage', async () => {
    getSpiceAttachments.mockResolvedValue({ ok: false, status: 403, error: 'forbidden' });
    expect(await listAssistAttachments(ctx, OTHER)).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(listObjects).not.toHaveBeenCalled();
    expect(getDocPackInputs).not.toHaveBeenCalled();
  });

  it('says available only when the object is really there', async () => {
    getSpiceAttachments.mockResolvedValue({ ok: true, list: { items: [item('parent-proof')] } });
    inputs({ 'pre-1': { responses: { certificateOfIncorporationUrl: COI } } });
    const key = `milestone-documents/${COI}`;

    let out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]).toMatchObject({ key: 'parent-proof', available: false, size: null, fileName: null });

    listObjects.mockResolvedValue([{ key, size: 1234, lastModified: null }]);
    out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]).toMatchObject({ available: true, size: 1234, fileName: 'coi.pdf', contentType: 'application/pdf', status: 'done', note: null });
  });

  it('treats a storage failure as not available, never a guess', async () => {
    getSpiceAttachments.mockResolvedValue({ ok: true, list: { items: [item('parent-proof')] } });
    inputs({ 'pre-1': { responses: { certificateOfIncorporationUrl: COI } } });
    listObjects.mockRejectedValue(new Error('no bucket'));
    const out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]?.available).toBe(false);
  });

  it('finds the accepted board resolution through its Vault copy, inside this engagement only', async () => {
    const own = `${DB}/signed/board-resolution-signed-1.pdf`;
    getSpiceAttachments.mockResolvedValue({ ok: true, list: { items: [item('board-resolution', { detail: 'Accepted', vaultDocumentId: 'doc-1' })] } });
    inputs({});
    getDocumentById.mockResolvedValue({ objectKey: own });
    listObjects.mockImplementation(async (k: string) => [{ key: k, size: 10, lastModified: null }]);
    let out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]).toMatchObject({ available: true, fileName: 'board-resolution-signed-1.pdf' });

    getDocumentById.mockResolvedValue({ objectKey: `${OTHER}/signed/x-1.pdf` });
    out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]?.available).toBe(false);
  });

  it('does not treat a board resolution that is not accepted as a file', async () => {
    getSpiceAttachments.mockResolvedValue({ ok: true, list: { items: [item('board-resolution', { status: 'waiting', detail: 'Signed copy to receive' })] } });
    inputs({}, { signedStoragePath: `${DB}/signed/x-1.pdf` });
    const out = await listAssistAttachments(ctx, DB);
    expect(out.ok && out.value.items[0]?.available).toBe(false);
    expect(listObjects).not.toHaveBeenCalled();
  });
});

describe('readAssistAttachment', () => {
  const key = `milestone-documents/${COI}`;
  beforeEach(() => {
    getSpiceAttachments.mockResolvedValue({ ok: true, list: { items: [item('parent-proof'), item('moa')] } });
    inputs({ 'pre-1': { responses: { certificateOfIncorporationUrl: COI } } });
  });

  it('returns the file', async () => {
    listObjects.mockResolvedValue([{ key, size: 5, lastModified: null }]);
    getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-'));
    expect(await readAssistAttachment(ctx, DB, 'parent-proof')).toMatchObject({ ok: true, fileName: 'coi.pdf', contentType: 'application/pdf' });
  });

  it('says 413 over 6 MB without reading the bytes', async () => {
    listObjects.mockResolvedValue([{ key, size: MAX_ATTACHMENT_BYTES + 1, lastModified: null }]);
    expect(await readAssistAttachment(ctx, DB, 'parent-proof')).toEqual({ ok: false, status: 413, error: 'file_too_large' });
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });

  it('says no_file when nothing is stored, and not_found for an unknown key', async () => {
    expect(await readAssistAttachment(ctx, DB, 'moa')).toEqual({ ok: false, status: 404, error: 'no_file' });
    expect(await readAssistAttachment(ctx, DB, 'parent-proof')).toEqual({ ok: false, status: 404, error: 'no_file' });
    expect(await readAssistAttachment(ctx, DB, 'nothing')).toEqual({ ok: false, status: 404, error: 'not_found' });
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });
});
