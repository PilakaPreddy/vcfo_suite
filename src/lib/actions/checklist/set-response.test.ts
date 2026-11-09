import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

const getEngagementById = vi.fn();
const getOwnAskAttachments = vi.fn();
vi.mock('@/db/repositories/engagements', () => ({
  getEngagementById: (...a: unknown[]) => getEngagementById(...a),
  checklistStateFromRow: () => ({}),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: vi.fn() }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: (...a: unknown[]) => getOwnAskAttachments(...a) }));
vi.mock('@/db/repositories/documents', () => ({ indexMilestoneUpload: vi.fn() }));
vi.mock('@/lib/incorporation/apply-checklist-patch', () => ({ applyChecklistPatch: vi.fn(), ChecklistPatchRefused: class extends Error {} }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn(), putObject: vi.fn(), bucketKey: (b: string, k: string) => `${b}/${k}` }));

const { attachFile } = await import('./set-response');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: 'c1', runId: null, now: new Date('2026-11-09T10:00:00Z'), via: 'ask' };
const ACME = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Acme Private Limited' };
const ATTACHMENT = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  getEngagementById.mockResolvedValue(ACME);
  getOwnAskAttachments.mockResolvedValue([{ id: ATTACHMENT, fileName: 'noc.pdf', s3Key: 'ask/u/noc.pdf', sizeBytes: 10 }]);
});

const messages = async (stepId: string, fieldId: string) =>
  (await attachFile.recheck!(actx, { engagementId: ACME.id, stepId, fieldId, attachmentId: ATTACHMENT, value: 'noc.pdf' }, {})).checks.map((c) => c.message ?? '');

describe('checklist.attachFile', () => {
  it('takes any checklist upload field, not only the identity copies', async () => {
    expect(await messages('pre-14', 'registeredOfficeNocUrl')).not.toContain('Held: this field does not take a file.');
  });

  it('holds a field that does not take a file', async () => {
    expect(await messages('pre-14', 'registeredOfficeAddressLine1')).toContain('Held: this field does not take a file.');
  });

  it('holds the row when the chat file is gone', async () => {
    getOwnAskAttachments.mockResolvedValue([]);
    expect(await messages('pre-14', 'registeredOfficeNocUrl')).toContain('Held: the file is no longer available.');
  });
});
