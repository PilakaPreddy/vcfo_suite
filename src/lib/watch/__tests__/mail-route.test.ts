import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mailbox endpoint's wiring: it stays off without its settings, the token gates everything, and a
 * mail reaches the read step only past the sender allowlist and the receiving server's result. Parsing
 * and the header checks themselves are proven in `mail-parse.test.ts`.
 */

const systemLogRegNoise = vi.fn();
const systemQueueAlertMail = vi.fn();
const queueWatchProcess = vi.fn();

vi.mock('@/db/repositories/reg-sources', () => ({
  systemWatchSourceByUrl: async () => ({ id: 'source-1' }),
  systemEnsureWatchSources: async () => undefined,
}));
vi.mock('@/db/repositories/reg-updates', () => ({
  addPastedAlertMail: vi.fn(),
  systemLogRegNoise: (...args: unknown[]) => systemLogRegNoise(...args),
  systemQueueAlertMail: (...args: unknown[]) => systemQueueAlertMail(...args),
}));
vi.mock('@/lib/watch/process', () => ({
  hostOf: () => null,
  queueWatchProcess: (...args: unknown[]) => queueWatchProcess(...args),
}));

const { POST } = await import('../../../../app/api/watch/mail/route');

const mail = (...headers: string[]): string =>
  [...headers, 'Subject: Time extended for MGT-7', 'Message-ID: <m-1@mca.gov.in>', '', 'The due date for Form MGT-7 is extended.'].join('\r\n');

const VOUCHED = mail('Authentication-Results: mx.sbcllp.in; dkim=pass header.d=mca.gov.in', 'From: MCA <alerts@mca.gov.in>');

const post = (body: string, token = 'relay-secret'): Promise<Response> =>
  POST(new Request('https://app.test/api/watch/mail', { method: 'POST', body, headers: { authorization: `Bearer ${token}` } }));

beforeEach(() => {
  vi.stubEnv('WATCH_ENABLED', 'true');
  vi.stubEnv('WATCH_ALERT_MAILBOX', 'alerts@sbcllp.in');
  vi.stubEnv('WATCH_ALERT_TOKEN', 'relay-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/watch/mail', () => {
  it.each(['WATCH_ENABLED', 'WATCH_ALERT_MAILBOX', 'WATCH_ALERT_TOKEN'])('answers 404 and reads nothing without %s', async (name) => {
    vi.stubEnv(name, name === 'WATCH_ENABLED' ? 'false' : '');
    expect((await post(VOUCHED)).status).toBe(404);
    expect(systemQueueAlertMail).not.toHaveBeenCalled();
  });

  it('refuses a wrong token before reading the mail', async () => {
    expect((await post(VOUCHED, 'guess')).status).toBe(401);
    expect(systemQueueAlertMail).not.toHaveBeenCalled();
    expect(systemLogRegNoise).not.toHaveBeenCalled();
  });

  it('refuses a message over the size limit', async () => {
    expect((await post('x'.repeat(2_000_001))).status).toBe(413);
    expect(systemQueueAlertMail).not.toHaveBeenCalled();
  });

  it('logs and refuses a sender off the allowlist, whatever its body claims', async () => {
    const forged = mail('Authentication-Results: mx.sbcllp.in; dkim=pass header.d=evil.example', 'From: <alerts@evil.example>').concat('\r\nFrom: alerts@mca.gov.in');
    const res = await post(forged);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'sender_not_allowed' });
    expect(systemLogRegNoise).toHaveBeenCalledWith('source-1', [expect.objectContaining({ reason: 'sender_not_allowed' })]);
    expect(queueWatchProcess).not.toHaveBeenCalled();
  });

  it('refuses an official From line the receiving server does not vouch for', async () => {
    const res = await post(mail('From: MCA <alerts@mca.gov.in>'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'not_authenticated' });
    expect(systemQueueAlertMail).not.toHaveBeenCalled();
  });

  it('queues a vouched mail at the read step', async () => {
    systemQueueAlertMail.mockResolvedValue('update-1');
    const res = await post(VOUCHED);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'update-1' });
    expect(systemQueueAlertMail).toHaveBeenCalledWith('source-1', expect.objectContaining({ sender: 'alerts@mca.gov.in', subject: 'Time extended for MGT-7' }));
    expect(queueWatchProcess).toHaveBeenCalledWith([{ id: 'update-1', host: null }]);
  });

  it('answers a repeat as a duplicate and reads nothing again', async () => {
    systemQueueAlertMail.mockResolvedValue(null);
    const res = await post(VOUCHED);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
    expect(queueWatchProcess).not.toHaveBeenCalled();
  });
});
