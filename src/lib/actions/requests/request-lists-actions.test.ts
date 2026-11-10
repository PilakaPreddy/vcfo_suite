import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';
import type { ActionContext } from '../types';

const getRequestList = vi.fn();
const markRequestListSent = vi.fn();
const createRequestListFromTemplate = vi.fn();
const resolveEngagementRecipients = vi.fn();
const getEngagementById = vi.fn();
const sendEmail = vi.fn();
const recordAuditEvent = vi.fn();

vi.mock('@/db/repositories/request-lists', () => ({
  getRequestList: (...a: unknown[]) => getRequestList(...a),
  markRequestListSent: (...a: unknown[]) => markRequestListSent(...a),
  createRequestListFromTemplate: (...a: unknown[]) => createRequestListFromTemplate(...a),
}));
vi.mock('@/db/repositories/engagement-recipients', () => ({ resolveEngagementRecipients: (...a: unknown[]) => resolveEngagementRecipients(...a) }));
vi.mock('@/db/repositories/engagements', () => ({ getEngagementById: (...a: unknown[]) => getEngagementById(...a), checklistStateFromRow: () => ({}) }));
vi.mock('@/db/repositories/ask-attachments', () => ({ getOwnAskAttachments: vi.fn() }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: vi.fn() }));
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a) }));
vi.mock('@/lib/email/send-email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const { sendList } = await import('./send-list');
const { createListFromTemplate } = await import('./create-list-from-template');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const actx: ActionContext = { auth: lead, engagementId: null, conversationId: null, runId: null, now: new Date('2026-11-09T10:00:00Z'), via: 'route' };
const ENG = '11111111-1111-4111-8111-111111111111';
const LIST = '33333333-3333-4333-8333-333333333303';
const draft = {
  id: LIST,
  engagementId: ENG,
  companyName: 'Acme Private Limited',
  title: 'GST monthly data · Oct 2026',
  status: 'draft',
  dueOn: '2026-11-15',
  items: [
    { id: 'i1', kind: 'document', label: 'Sales register', status: 'pending' },
    { id: 'i2', kind: 'answer', label: 'Any advances?', status: 'pending' },
  ],
};
const client = { userId: 'c1', email: 'cfo@acme.test', name: 'Asha Rao' };

beforeEach(() => {
  vi.clearAllMocks();
  getRequestList.mockResolvedValue(draft);
  resolveEngagementRecipients.mockResolvedValue({ clients: [client], client });
  getEngagementById.mockResolvedValue({ id: ENG, companyName: 'Acme Private Limited' });
  markRequestListSent.mockResolvedValue({ ...draft, status: 'sent' });
  sendEmail.mockResolvedValue({ ok: true });
});

describe('requests.sendList', () => {
  it('is an outward T3 card naming the client recipients and every item', async () => {
    expect(sendList.tier).toBe('T3');
    const card = await sendList.preview(actx, { listId: LIST });
    expect(card!.recipients).toEqual([{ name: 'Asha Rao', email: 'cfo@acme.test', role: 'client' }]);
    const row = card!.rows[0]!;
    expect(row.action).toBe('requests.sendList');
    expect(row.target).toEqual({ listId: LIST });
    expect(row.displayNew).toContain('2 items');
    expect(row.displayNew).toContain('Upload: Sales register');
    expect(row.displayNew).toContain('Answer: Any advances?');
    expect(row.heldReason).toBeUndefined();
  });

  it('holds a list already sent, an empty list, a client with no portal user and a past due date', async () => {
    getRequestList.mockResolvedValue({ ...draft, status: 'sent' });
    expect((await sendList.recheck!(actx, { listId: LIST }, {})).heldReason).toMatch(/already been sent/);
    getRequestList.mockResolvedValue({ ...draft, items: [] });
    expect((await sendList.recheck!(actx, { listId: LIST }, {})).heldReason).toMatch(/no items/);
    getRequestList.mockResolvedValue(draft);
    resolveEngagementRecipients.mockResolvedValue({ clients: [], client: null });
    expect((await sendList.recheck!(actx, { listId: LIST }, {})).heldReason).toMatch(/no portal user/);
    resolveEngagementRecipients.mockResolvedValue({ clients: [client], client });
    getRequestList.mockResolvedValue({ ...draft, dueOn: '2026-11-01' });
    expect((await sendList.recheck!(actx, { listId: LIST }, {})).heldReason).toMatch(/past/);
    getRequestList.mockResolvedValue(null);
    expect((await sendList.recheck!(actx, { listId: LIST }, {})).canApply).toBe(false);
  });

  it('executes: marks sent, emails each client once, and audits', async () => {
    const result = await sendList.execute(actx, { listId: LIST });
    expect(result).toMatchObject({ ok: true, summary: 'Sent "GST monthly data · Oct 2026" to 1 client contact' });
    expect(markRequestListSent).toHaveBeenCalledWith(lead, LIST, actx.now);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: 'cfo@acme.test', purpose: 'request-list.sent' });
    expect(recordAuditEvent).toHaveBeenCalledWith(lead, expect.objectContaining({ engagementId: ENG, action: 'request_list.sent' }));
  });

  it('does not send when a check fails at the click', async () => {
    getRequestList.mockResolvedValue({ ...draft, status: 'sent' });
    expect(await sendList.execute(actx, { listId: LIST })).toMatchObject({ ok: false });
    expect(markRequestListSent).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('requests.createListFromTemplate', () => {
  const input = { engagementId: ENG, templateId: 'tds-quarterly', periodLabel: 'Q2 FY 2026-27' };

  it('is a T2 record card describing the draft', async () => {
    expect(createListFromTemplate.tier).toBe('T2');
    const row = (await createListFromTemplate.preview(actx, input))!.rows[0]!;
    expect(row.newValue).toBe('TDS quarterly return data · Q2 FY 2026-27');
    expect(row.displayNew).toContain('6 items');
    expect(row.target).toEqual(input);
  });

  it('rejects an unknown template at parse time and holds a client out of scope', async () => {
    expect(createListFromTemplate.input.safeParse({ ...input, templateId: 'vat' }).success).toBe(false);
    getEngagementById.mockResolvedValue(null);
    expect((await createListFromTemplate.recheck!(actx, input, {})).canApply).toBe(false);
  });

  it('executes through the repository as the person', async () => {
    createRequestListFromTemplate.mockResolvedValue({ id: LIST, title: 'TDS', items: [1, 2, 3] });
    const result = await createListFromTemplate.execute(actx, input);
    expect(createRequestListFromTemplate).toHaveBeenCalledWith(lead, expect.objectContaining({ engagementId: ENG, templateId: 'tds-quarterly' }), actx.now);
    expect(result).toMatchObject({ ok: true, href: `/app/intern/requests?list=${LIST}` });
  });
});
