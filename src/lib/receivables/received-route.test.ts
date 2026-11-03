import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/receivables/invoices/:id/received (Phase 9): the body reaches the repository with the
 * USD received or the TDS, a foreign invoice marked received gets its awaited FIRA, an INR one
 * does not, and a FIRA failure never fails the receipt. The repository is mocked.
 */

const guard = vi.fn();
const markReceived = vi.fn();
const createAwaitedFira = vi.fn();
vi.mock('@/auth/guards', () => ({ requireAnyRole: () => guard() }));
vi.mock('@/db/repositories/receivables', async () => {
  const shared = await vi.importActual<typeof import('@/db/repositories/receivables/shared')>('@/db/repositories/receivables/shared');
  return {
    ReceivablesError: shared.ReceivablesError,
    markReceived: (...a: unknown[]) => markReceived(...a),
    createAwaitedFira: (...a: unknown[]) => createAwaitedFira(...a),
    reopenInvoice: vi.fn(),
  };
});

const { POST } = await import('../../../app/api/receivables/invoices/[id]/received/route');

const ctx = { userId: 'u1', email: 'm@sbcllp.in', name: 'Krishna', role: 'manager' };
const call = (body: unknown) =>
  POST(new Request('http://x/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: 'inv-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true, ctx });
  createAwaitedFira.mockResolvedValue({ id: 'f1' });
});

describe('received route', () => {
  it('passes the USD received and creates the awaited FIRA for a foreign receipt', async () => {
    markReceived.mockResolvedValue({ id: 'inv-1', status: 'received', currency: 'USD' });
    const res = await call({ paidOn: '2026-11-03', amount: 995000, receivedFc: 11950 });
    expect(res.status).toBe(200);
    expect(markReceived).toHaveBeenCalledWith(ctx, 'inv-1', { paidOn: '2026-11-03', amount: 995000, receivedFc: 11950 });
    expect(createAwaitedFira).toHaveBeenCalledWith(ctx, 'inv-1');
  });

  it('makes no FIRA for an INR receipt or a part payment', async () => {
    markReceived.mockResolvedValue({ id: 'inv-1', status: 'received', currency: 'INR' });
    await call({ paidOn: '2026-11-03', amount: 90000, tdsInr: 10000 });
    expect(markReceived).toHaveBeenCalledWith(ctx, 'inv-1', { paidOn: '2026-11-03', amount: 90000, tdsInr: 10000 });
    markReceived.mockResolvedValue({ id: 'inv-1', status: 'open', currency: 'USD' });
    await call({ paidOn: '2026-11-03', amount: 400000, receivedFc: 5000, part: true });
    expect(createAwaitedFira).not.toHaveBeenCalled();
  });

  it('keeps the receipt when the FIRA cannot be made', async () => {
    markReceived.mockResolvedValue({ id: 'inv-1', status: 'received', currency: 'USD' });
    createAwaitedFira.mockRejectedValue(new Error('down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ paidOn: '2026-11-03', amount: 995000, receivedFc: 11950 });
    expect(res.status).toBe(200);
    expect((await res.json()).invoice.status).toBe('received');
    spy.mockRestore();
  });

  it('refuses a negative TDS before the repository', async () => {
    const res = await call({ paidOn: '2026-11-03', amount: 1, tdsInr: -5 });
    expect(res.status).toBe(400);
    expect(markReceived).not.toHaveBeenCalled();
  });
});
