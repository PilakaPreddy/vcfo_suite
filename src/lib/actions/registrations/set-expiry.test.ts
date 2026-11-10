import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

class ExpiryError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}
const getEngagementById = vi.fn();
const findExpiryItem = vi.fn();
const upsertExpiryItem = vi.fn();
const deleteExpiryItem = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: vi.fn() }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn() }));
vi.mock('@/db/repositories/expiry-items', () => ({
  ExpiryError,
  findExpiryItem: (...a: unknown[]) => findExpiryItem(...a),
  upsertExpiryItem: (...a: unknown[]) => upsertExpiryItem(...a),
  deleteExpiryItem: (...a: unknown[]) => deleteExpiryItem(...a),
}));

const { setExpiry } = await import('./set-expiry');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: 'c1', runId: null, now: new Date('2026-11-09T10:00:00Z'), via: 'ask' };
const ACME = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Acme Private Limited' };
const input = { engagementId: ACME.id, kind: 'dsc' as const, subjectName: 'Ravi', expiresOn: '2027-03-12', value: '12 March 2027' };
const EXISTING = { id: 'x-1', engagementId: ACME.id, kind: 'dsc', kindLabel: 'DSC', subjectName: 'Ravi Kumar', expiresOn: '2026-11-14', source: 'checklist', referenceLabel: null, notes: null };

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockResolvedValue(ACME);
  findExpiryItem.mockResolvedValue(null);
});

describe('registrations.setExpiry', () => {
  it('is a staff T2 action', () => {
    expect(setExpiry.tier).toBe('T2');
    expect(setExpiry.roles).not.toContain('client');
  });

  it('previews a new item, and shows the date it replaces', async () => {
    let row = (await setExpiry.preview(actx, input))!.rows[0]!;
    expect(row.displayNew).toBe("Ravi's DSC expires 12 Mar 2027 (Acme Private Limited)");
    expect(row.displayOld).toBe('');
    expect(row.heldReason).toBeUndefined();
    findExpiryItem.mockResolvedValue(EXISTING);
    row = (await setExpiry.preview(actx, input))!.rows[0]!;
    expect(row.displayOld).toBe('Expires 14 Nov 2026');
    expect(row.oldValue).toBe('2026-11-14');
  });

  it('holds a client outside scope and a date that does not exist', async () => {
    getEngagementById.mockResolvedValue(null);
    expect((await setExpiry.recheck!(actx, input, {})).canApply).toBe(false);
    getEngagementById.mockResolvedValue(ACME);
    expect((await setExpiry.recheck!(actx, { ...input, expiresOn: '2027-02-30' }, {})).heldReason).toMatch(/not a real date/);
  });

  it('updates the matching item with the source ask, and undo puts the old date back', async () => {
    findExpiryItem.mockResolvedValue(EXISTING);
    upsertExpiryItem.mockResolvedValue({ item: { ...EXISTING, expiresOn: '2027-03-12', source: 'ask' }, previous: EXISTING });
    const res = await setExpiry.execute(actx, input);
    expect(res).toMatchObject({ ok: true, summary: "Ravi Kumar's DSC now expires 12 Mar 2027" });
    expect(upsertExpiryItem).toHaveBeenCalledWith(lead, expect.objectContaining({ id: 'x-1', subjectName: 'Ravi Kumar', expiresOn: '2027-03-12', source: 'ask' }));
    upsertExpiryItem.mockClear();
    await setExpiry.undo!(actx, (res as unknown as { undo: never }).undo);
    expect(upsertExpiryItem).toHaveBeenCalledWith(lead, expect.objectContaining({ id: 'x-1', expiresOn: '2026-11-14', source: 'checklist', kind: 'dsc' }));
  });

  it('removes an item the card added on undo', async () => {
    upsertExpiryItem.mockResolvedValue({ item: { ...EXISTING, id: 'x-2', subjectName: 'Ravi', expiresOn: '2027-03-12' }, previous: null });
    const res = await setExpiry.execute(actx, input);
    await setExpiry.undo!(actx, (res as unknown as { undo: never }).undo);
    expect(deleteExpiryItem).toHaveBeenCalledWith(lead, 'x-2');
  });

  it('reports a refused write without throwing', async () => {
    upsertExpiryItem.mockRejectedValue(new ExpiryError('not_found', 404));
    expect(await setExpiry.execute(actx, input)).toEqual({ ok: false, error: 'This project is not available.' });
  });
});
