import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/receivables/sheets/:id/send-summary: the route checks the input, the addresses, the
 * published version and the Outlook link before it answers, logs the send as `sending` and
 * answers 202. The workbook and the Graph call run after the response (`after` is captured here
 * and run by hand), and the log row ends `sent` or `failed`. Outlook is mocked, so nothing is sent.
 */

const guard = vi.fn();
const getSummarySource = vi.fn();
const recordSummarySend = vi.fn();
const finishSummarySend = vi.fn();
const getSummarySendStatus = vi.fn();
const sendMailViaOutlook = vi.fn();
const assertOutlookReady = vi.fn();
const afterQueue: Array<() => Promise<unknown>> = [];
vi.mock('next/server', async () => ({ ...(await vi.importActual<typeof import('next/server')>('next/server')), after: (fn: () => Promise<unknown>) => afterQueue.push(fn) }));
vi.mock('@/auth/guards', () => ({ requireAnyRole: () => guard() }));
vi.mock('@/db/repositories/receivables', async () => {
  const shared = await vi.importActual<typeof import('@/db/repositories/receivables/shared')>('@/db/repositories/receivables/shared');
  return {
    ReceivablesError: shared.ReceivablesError,
    getSummarySource: (...a: unknown[]) => getSummarySource(...a),
    recordSummarySend: (...a: unknown[]) => recordSummarySend(...a),
    finishSummarySend: (...a: unknown[]) => finishSummarySend(...a),
    getSummarySendStatus: (...a: unknown[]) => getSummarySendStatus(...a),
  };
});
vi.mock('@/db/repositories/outlook-connections', () => ({
  sendMailViaOutlook: (...a: unknown[]) => sendMailViaOutlook(...a),
  assertOutlookReady: (...a: unknown[]) => assertOutlookReady(...a),
}));

const { POST, GET } = await import('../../../app/api/receivables/sheets/[id]/send-summary/route');

const ctx = { userId: 'u1', email: 'm@sbcllp.in', name: 'Krishna', role: 'manager' };
const call = (body: unknown) => POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: 'sheet-1' }) });
const runAfter = async () => {
  while (afterQueue.length) await afterQueue.shift()!();
};
const SOURCE = {
  sheet: { id: 'sheet-1', clientOrgName: 'Summit Consulting' },
  version: { id: 'v3', seq: 3, publishedAt: new Date(), snapshot: [] },
  partners: [],
  lastSend: null,
};
const SEND_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  guard.mockResolvedValue({ ok: true, ctx });
  getSummarySource.mockResolvedValue(SOURCE);
  assertOutlookReady.mockResolvedValue({ msEmail: 'krishna@sbcllp.in' });
  recordSummarySend.mockResolvedValue({ id: SEND_ID });
  finishSummarySend.mockResolvedValue(undefined);
  sendMailViaOutlook.mockResolvedValue({ msEmail: 'krishna@sbcllp.in' });
});

describe('send-summary route', () => {
  it('answers 202 before the workbook or the send runs, then sends To, Cc and Bcc with the Excel file', async () => {
    const res = await call({
      to: [{ name: 'Yash', email: 'yash@summit.in' }],
      cc: [{ name: 'Rakesh', email: 'rakesh@summit.in' }, { name: 'Yash', email: 'YASH@summit.in' }],
      bcc: [{ name: '', email: 'audit@sbcllp.in' }],
      subject: ' RE: Receivables update - 3 November ',
      html: '<p onclick="x()">Hi Team,</p><script>bad()</script>',
      attachExcel: true,
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, queued: true, sendId: SEND_ID, from: 'krishna@sbcllp.in', to: 1, cc: 1, bcc: 1 });
    expect(recordSummarySend).toHaveBeenCalledWith(ctx, 'sheet-1', expect.objectContaining({ versionId: 'v3', channel: 'outlook', status: 'sending', bcc: [{ name: '', email: 'audit@sbcllp.in' }] }));
    expect(sendMailViaOutlook).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(1);

    await runAfter();
    expect(sendMailViaOutlook).toHaveBeenCalledTimes(1);
    const [sentCtx, mail] = sendMailViaOutlook.mock.calls[0];
    expect(sentCtx).toBe(ctx);
    expect(mail).toMatchObject({ to: ['yash@summit.in'], cc: ['rakesh@summit.in'], bcc: ['audit@sbcllp.in'], subject: 'RE: Receivables update - 3 November', html: '<p>Hi Team,</p>' });
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments[0].name).toMatch(/^Receivables Summit Consulting \d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(mail.attachments[0].contentBase64.length).toBeGreaterThan(100);
    expect(finishSummarySend).toHaveBeenCalledWith(ctx, 'sheet-1', SEND_ID, { status: 'sent' });
  });

  it('can leave the Excel file out', async () => {
    await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>', attachExcel: false });
    await runAfter();
    expect(sendMailViaOutlook.mock.calls[0][1].attachments).toEqual([]);
  });

  it('records a failed send with its reason when Graph fails after the response', async () => {
    sendMailViaOutlook.mockRejectedValue(new Error('Graph sendMail 413'));
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(202);
    await runAfter();
    expect(finishSummarySend).toHaveBeenCalledWith(ctx, 'sheet-1', SEND_ID, { status: 'failed', error: 'send_failed' });
  });

  it('refuses a bad address before sending', async () => {
    const res = await call({ to: [{ name: '', email: 'not-an-email' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'bad_email', invalid: ['not-an-email'] });
    expect(afterQueue).toHaveLength(0);
  });

  it('says at once when Outlook is not connected and logs nothing', async () => {
    assertOutlookReady.mockRejectedValue(new Error('outlook_not_connected'));
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'outlook_not_connected' });
    expect(recordSummarySend).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(0);
  });

  it('says at once when Outlook must be connected again', async () => {
    assertOutlookReady.mockRejectedValue(new Error('Token refresh failed: invalid_grant'));
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'outlook_reconnect' });
    expect(afterQueue).toHaveLength(0);
  });

  it('keeps other roles out', async () => {
    guard.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const res = await call({ to: [{ name: '', email: 'a@b.in' }], subject: 's', html: '<p>x</p>' });
    expect(res.status).toBe(403);
    expect(getSummarySource).not.toHaveBeenCalled();
  });

  it('reports the state of one send for the dialog to poll', async () => {
    getSummarySendStatus.mockResolvedValue({ status: 'failed', error: 'outlook_reconnect' });
    const res = await GET(new Request(`http://x/api?send=${SEND_ID}`), { params: Promise.resolve({ id: 'sheet-1' }) });
    expect(await res.json()).toEqual({ status: 'failed', error: 'outlook_reconnect' });
    expect(getSummarySendStatus).toHaveBeenCalledWith(ctx, 'sheet-1', SEND_ID);
  });
});
