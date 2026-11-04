import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /api/receivables/sheets/:id/reminders/send-now: the scope check and today's queue happen
 * before the answer, the sending runs after the response, and a second click while the first is
 * still sending does not send again. The repository and the sender are mocked.
 */

const guard = vi.fn();
const getReminderDesk = vi.fn();
const sendDueReminders = vi.fn();
const afterQueue: Array<() => Promise<unknown>> = [];
vi.mock('next/server', async () => ({ ...(await vi.importActual<typeof import('next/server')>('next/server')), after: (fn: () => Promise<unknown>) => afterQueue.push(fn) }));
vi.mock('@/auth/guards', () => ({ requireAnyRole: () => guard() }));
vi.mock('@/lib/receivables/send-reminders', () => ({ sendDueReminders: (...a: unknown[]) => sendDueReminders(...a) }));
vi.mock('@/db/repositories/receivables', async () => {
  const shared = await vi.importActual<typeof import('@/db/repositories/receivables/shared')>('@/db/repositories/receivables/shared');
  return { ReceivablesError: shared.ReceivablesError, getReminderDesk: (...a: unknown[]) => getReminderDesk(...a) };
});

const { POST } = await import('../../../app/api/receivables/sheets/[id]/reminders/send-now/route');
const { ReceivablesError } = await import('@/db/repositories/receivables/shared');

const call = () => POST(new Request('http://x/api', { method: 'POST' }), { params: Promise.resolve({ id: 'sheet-1' }) });
const row = (status: string, invoiceStatus = 'open') => ({ reminder: { status }, invoiceStatus });

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  guard.mockResolvedValue({ ok: true, ctx: { userId: 'u1', role: 'manager' } });
  getReminderDesk.mockResolvedValue({ sheet: { id: 'sheet-1' }, queue: [row('queued'), row('queued', 'received'), row('skipped')], history: [] });
  sendDueReminders.mockResolvedValue({ sent: 1, failed: 0, viaOutlook: 1, viaEmail: 0 });
});

describe('send-now route', () => {
  it('answers 202 before sending, then sends after the response', async () => {
    const res = await call();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, queued: true, pending: 1 });
    expect(sendDueReminders).not.toHaveBeenCalled();
    await afterQueue.shift()!();
    expect(sendDueReminders).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), { sheetId: 'sheet-1' });
  });

  it('does not start a second send while the first is running', async () => {
    await call();
    await call();
    expect(afterQueue).toHaveLength(1);
    await afterQueue.shift()!();
    await call();
    expect(afterQueue).toHaveLength(1);
  });

  it('refuses a sheet outside the caller scope before anything is queued', async () => {
    getReminderDesk.mockRejectedValue(new ReceivablesError(404, 'not_found'));
    const res = await call();
    expect(res.status).toBe(404);
    expect(afterQueue).toHaveLength(0);
  });
});
