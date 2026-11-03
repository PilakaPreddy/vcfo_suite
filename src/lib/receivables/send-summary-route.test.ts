import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/receivables/sheets/:id/send-summary: the summary goes from the manager's own Outlook
 * with To, Cc and Bcc as given (clean and without duplicates), the published version attached
 * as Excel, and the send logged. Outlook is mocked, so nothing is sent.
 */

const guard = vi.fn();
const getSummarySource = vi.fn();
const recordSummarySend = vi.fn();
const sendMailViaOutlook = vi.fn();
vi.mock('@/auth/guards', () => ({ requireAnyRole: () => guard() }));
vi.mock('@/db/repositories/receivables', async () => {
  const shared = await vi.importActual<typeof import('@/db/repositories/receivables/shared')>('@/db/repositories/receivables/shared');
  return { ReceivablesError: shared.ReceivablesError, getSummarySource: (...a: unknown[]) => getSummarySource(...a), recordSummarySend: (...a: unknown[]) => recordSummarySend(...a) };
});
vi.mock('@/db/repositories/outlook-connections', () => ({ sendMailViaOutlook: (...a: unknown[]) => sendMailViaOutlook(...a) }));

const { POST } = await import('../../../app/api/receivables/sheets/[id]/send-summary/route');

const ctx = { userId: 'u1', email: 'm@sbcllp.in', name: 'Krishna', role: 'manager' };
const call = (body: unknown) => POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: 'sheet-1' }) });
const SOURCE = {
  sheet: { id: 'sheet-1', clientOrgName: 'Summit Consulting' },
  version: { id: 'v3', seq: 3, publishedAt: new Date(), snapshot: [] },
  partners: [],
  lastSend: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true, ctx });
  getSummarySource.mockResolvedValue(SOURCE);
  sendMailViaOutlook.mockResolvedValue({ msEmail: 'krishna@sbcllp.in' });
});

describe('send-summary route', () => {
  it('sends To, Cc and Bcc from Outlook with the Excel file and logs it', async () => {
    const res = await call({
      to: [{ name: 'Yash', email: 'yash@summit.in' }],
      cc: [{ name: 'Rakesh', email: 'rakesh@summit.in' }, { name: 'Yash', email: 'YASH@summit.in' }],
      bcc: [{ name: '', email: 'audit@sbcllp.in' }],
      subject: ' RE: Receivables update - 3 November ',
      html: '<p onclick="x()">Hi Team,</p><script>bad()</script>',
      attachExcel: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, from: 'krishna@sbcllp.in', to: 1, cc: 1, bcc: 1 });
    const [sentCtx, mail] = sendMailViaOutlook.mock.calls[0];
    expect(sentCtx).toBe(ctx);
    expect(mail).toMatchObject({ to: ['yash@summit.in'], cc: ['rakesh@summit.in'], bcc: ['audit@sbcllp.in'], subject: 'RE: Receivables update - 3 November', html: '<p>Hi Team,</p>' });
    expect(mail.attachments[0].name).toMatch(/^Receivables Summit Consulting \d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(mail.attachments[0].contentBase64.length).toBeGreaterThan(100);
    expect(recordSummarySend).toHaveBeenCalledWith(ctx, 'sheet-1', expect.objectContaining({ versionId: 'v3', channel: 'outlook', bcc: [{ name: '', email: 'audit@sbcllp.in' }] }));
  });

  it('can leave the Excel file out', async () => {
    await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>', attachExcel: false });
    expect(sendMailViaOutlook.mock.calls[0][1].attachments).toEqual([]);
  });

  it('refuses a bad address before sending', async () => {
    const res = await call({ to: [{ name: '', email: 'not-an-email' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'bad_email', invalid: ['not-an-email'] });
    expect(sendMailViaOutlook).not.toHaveBeenCalled();
  });

  it('says when Outlook is not connected and logs nothing', async () => {
    sendMailViaOutlook.mockRejectedValue(new Error('outlook_not_connected'));
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'outlook_not_connected' });
    expect(recordSummarySend).not.toHaveBeenCalled();
  });

  it('keeps other roles out', async () => {
    guard.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(403);
    expect(getSummarySource).not.toHaveBeenCalled();
  });
});
