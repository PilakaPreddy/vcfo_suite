import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The rate alert check of the receivables rates job (Phase 10): a crossed alert that has not
 * fired today emails the sheet's manager and records the day; an email failure is logged and
 * never throws; an alert already fired today, or a rate that is not today's, sends nothing.
 */

const repo = {
  systemActiveAlerts: vi.fn(),
  systemRateFor: vi.fn(),
  systemMarkAlertTriggered: vi.fn(),
  systemFxCurrenciesInUse: vi.fn(),
  systemUpsertFetchedRate: vi.fn(),
};
vi.mock('server-only', () => ({}));
vi.mock('@/db/repositories/receivables', () => repo);
vi.mock('@/lib/email/send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.example/' }));
vi.mock('./client', () => ({ inngest: { createFunction: () => ({}) } }));
vi.mock('@/jobs/dev-controls', () => ({ PAUSED: {}, skipWhenPaused: vi.fn(), withRunNow: () => ({}) }));

const { checkRateAlerts } = await import('./receivables-fx-rates');

const TODAY = '2026-11-03';
const alert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  sheetId: 's1',
  clientOrgName: 'Summit',
  currency: 'USD',
  direction: 'above',
  threshold: 85,
  active: true,
  lastTriggeredOn: null,
  managerEmail: 'meera@vcfo.local',
  managerName: 'Meera Iyer',
  exposureFc: 1000,
  exposureBookedInr: 83000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.systemRateFor.mockResolvedValue({ currency: 'USD', rateDate: TODAY, rate: 85.2, source: 'ecb' });
});

describe('checkRateAlerts', () => {
  it('emails the manager once and records the day', async () => {
    repo.systemActiveAlerts.mockResolvedValue([alert(), alert({ id: 'a2', lastTriggeredOn: TODAY }), alert({ id: 'a3', threshold: 86 })]);
    const send = vi.fn().mockResolvedValue({ ok: true });
    expect(await checkRateAlerts(TODAY, { send })).toEqual({ checked: 3, fired: 1, emailed: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail).toMatchObject({ to: 'meera@vcfo.local', purpose: 'receivables.fx_alert' });
    expect(mail.subject).toContain('USD at ₹85.2000');
    expect(mail.text).toContain('https://app.example/receivables/manager?sheet=s1&tab=fx');
    expect(repo.systemMarkAlertTriggered).toHaveBeenCalledWith('a1', TODAY);
    expect(repo.systemRateFor).toHaveBeenCalledTimes(1);
  });

  it('never throws on an email failure and leaves the alert to try again', async () => {
    repo.systemActiveAlerts.mockResolvedValue([alert(), alert({ id: 'a2' })]);
    const send = vi.fn().mockRejectedValueOnce(new Error('SES down')).mockResolvedValueOnce({ ok: false, error: 'refused' });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await checkRateAlerts(TODAY, { send })).toEqual({ checked: 2, fired: 2, emailed: 0 });
    expect(repo.systemMarkAlertTriggered).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('skips a rate that is not today’s and an alert with no manager email', async () => {
    repo.systemActiveAlerts.mockResolvedValue([alert({ managerEmail: null })]);
    const send = vi.fn();
    expect(await checkRateAlerts(TODAY, { send })).toEqual({ checked: 1, fired: 1, emailed: 0 });
    repo.systemRateFor.mockResolvedValue({ currency: 'USD', rateDate: '2026-11-02', rate: 90, source: 'ecb' });
    repo.systemActiveAlerts.mockResolvedValue([alert()]);
    expect(await checkRateAlerts(TODAY, { send })).toEqual({ checked: 1, fired: 0, emailed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('returns quietly when the alerts cannot be loaded', async () => {
    repo.systemActiveAlerts.mockRejectedValue(new Error('db down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await checkRateAlerts(TODAY, { send: vi.fn() })).toEqual({ checked: 0, fired: 0, emailed: 0 });
    errors.mockRestore();
  });
});
