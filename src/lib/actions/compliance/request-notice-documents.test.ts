import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

/**
 * Asking the client for a notice's documents: one live request list per case, so a second
 * approval (a double click, or the chat card after the desk already sent) sends nothing.
 */

const getNoticeCase = vi.fn();
const updateNoticeCase = vi.fn();
const createRequestList = vi.fn();
const getRequestList = vi.fn();
const sendExecute = vi.fn();

vi.mock('@/db/repositories/notice-cases', () => ({
  getNoticeCase: (...a: unknown[]) => getNoticeCase(...a),
  updateNoticeCase: (...a: unknown[]) => updateNoticeCase(...a),
}));
vi.mock('@/db/repositories/request-lists', () => ({
  createRequestList: (...a: unknown[]) => createRequestList(...a),
  getRequestList: (...a: unknown[]) => getRequestList(...a),
}));
vi.mock('../requests/send-list', () => ({ sendList: { execute: (...a: unknown[]) => sendExecute(...a) } }));
vi.mock('@/db/repositories/engagement-recipients', () => ({
  resolveEngagementRecipients: async () => ({ clients: [{ name: 'Cara Client', email: 'cara@x.test' }], client: null }),
}));
vi.mock('@/db/repositories/engagements', () => ({ getEngagementById: vi.fn(), checklistStateFromRow: () => ({}) }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: vi.fn() }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn() }));

const { runRequestNoticeDocuments } = await import('./request-notice-documents');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: null, runId: null, now: new Date('2026-11-10T10:00:00Z'), via: 'screen' } as unknown as ActionContext;
const CASE_ID = '33333333-3333-4333-8333-333333333333';
const CASE = {
  id: CASE_ID,
  engagementId: '11111111-1111-4111-8111-111111111111',
  companyName: 'Acme',
  label: 'GST notice',
  periodLabel: null,
  open: true,
  stage: 'analysed',
  documentsNeeded: ['Bank statement'],
  responseDueOn: '2026-11-30',
  requestListId: null as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getNoticeCase.mockResolvedValue({ ...CASE });
  createRequestList.mockResolvedValue({ id: 'rl-1', title: 'Documents for GST notice' });
  sendExecute.mockResolvedValue({ ok: true, summary: 'Sent' });
});

describe('compliance.requestNoticeDocuments', () => {
  it('creates and sends one list, and records it on the case', async () => {
    expect(await runRequestNoticeDocuments(actx, { caseId: CASE_ID })).toEqual({ ok: true, summary: 'Sent' });
    expect(createRequestList).toHaveBeenCalledTimes(1);
    expect(updateNoticeCase).toHaveBeenCalledWith(lead, CASE_ID, expect.objectContaining({ requestListId: 'rl-1', stage: 'docs_requested' }));
  });

  it('holds a second request while the earlier list is live', async () => {
    getNoticeCase.mockResolvedValue({ ...CASE, requestListId: 'rl-1' });
    getRequestList.mockResolvedValue({ id: 'rl-1', status: 'sent' });
    const res = await runRequestNoticeDocuments(actx, { caseId: CASE_ID });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/already requested/) });
    expect(createRequestList).not.toHaveBeenCalled();
    expect(sendExecute).not.toHaveBeenCalled();
  });

  it('allows a new request once the earlier list was cancelled', async () => {
    getNoticeCase.mockResolvedValue({ ...CASE, requestListId: 'rl-0' });
    getRequestList.mockResolvedValue({ id: 'rl-0', status: 'cancelled' });
    expect(await runRequestNoticeDocuments(actx, { caseId: CASE_ID })).toMatchObject({ ok: true });
    expect(createRequestList).toHaveBeenCalledTimes(1);
  });
});
