import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reminder sender: Outlook first (as the sheet's manager), the firm's email as the fallback
 * with Reply-To the manager, every outcome recorded, nothing before the send hour, and the
 * manager's edited text used when there is one. Outlook and email are mocked.
 */

const systemDueReminders = vi.fn();
const systemRecordReminder = vi.fn();
const systemSendMailAs = vi.fn();
const sendEmailNoLog = vi.fn();
vi.mock('@/db/repositories/receivables', () => ({ systemDueReminders: (...a: unknown[]) => systemDueReminders(...a), systemRecordReminder: (...a: unknown[]) => systemRecordReminder(...a) }));
vi.mock('@/db/repositories/outlook-connections', () => ({ systemSendMailAs: (...a: unknown[]) => systemSendMailAs(...a) }));
vi.mock('@/lib/email/send-email', () => ({ sendEmailNoLog: (...a: unknown[]) => sendEmailNoLog(...a) }));
vi.mock('@/lib/site-url', () => ({ siteUrl: () => 'https://app.sbctrack.in' }));

const { sendDueReminders } = await import('./send-reminders');

const due = (over: Record<string, unknown> = {}, reminder: Record<string, unknown> = {}) => ({
  reminder: { id: 'r1', kind: 'overdue', daysLeft: -18, subjectOverride: null, bodyOverride: null, ...reminder },
  invoice: { clientName: 'Duravant', invoiceNo: 'SC/09/03', amountInr: '6456984.00', dueDate: '2026-10-16' },
  partnerName: 'Yash Babbar',
  partnerEmail: 'yash.babbar@summitconsulting.in',
  partnerSlug: 'yash',
  sheetId: 's1',
  publicKey: 'abcdefghijkl',
  requireKey: true,
  rules: { enabled: true, daysBefore: [5, 3], onDueDate: true, dailyAfterDue: true, skipWeekends: true, sendHourIst: 9 },
  managerUserId: 'm1',
  managerName: 'Krishna Tungam',
  managerEmail: 'krishna@sbcllp.in',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  systemSendMailAs.mockResolvedValue({ msEmail: 'krishna@sbcllp.in' });
  sendEmailNoLog.mockResolvedValue({ ok: true });
});

describe('sendDueReminders', () => {
  it('sends from the manager’s Outlook with the partner’s own link', async () => {
    systemDueReminders.mockResolvedValue([due()]);
    expect(await sendDueReminders('2026-11-03', { hourIst: 9 })).toEqual({ sent: 1, failed: 0, viaOutlook: 1, viaEmail: 0 });
    const [userId, mail] = systemSendMailAs.mock.calls[0];
    expect(userId).toBe('m1');
    expect(mail.to).toEqual(['yash.babbar@summitconsulting.in']);
    expect(mail.subject).toBe('Reminder: Duravant invoice SC/09/03 · 18 days overdue');
    expect(mail.text).toContain('Hi Yash,');
    expect(mail.text).toContain('https://app.sbctrack.in/receivables/k/abcdefghijkl?partner=yash');
    expect(systemRecordReminder).toHaveBeenCalledWith(['r1'], { status: 'sent', channel: 'outlook', toEmail: 'yash.babbar@summitconsulting.in' });
    expect(sendEmailNoLog).not.toHaveBeenCalled();
  });

  it('falls back to the firm’s email with Reply-To the manager', async () => {
    systemDueReminders.mockResolvedValue([due()]);
    systemSendMailAs.mockResolvedValue(null);
    expect(await sendDueReminders('2026-11-03')).toMatchObject({ sent: 1, viaEmail: 1 });
    expect(sendEmailNoLog.mock.calls[0][0]).toMatchObject({ to: 'yash.babbar@summitconsulting.in', purpose: 'receivables.reminder' });
    expect(String(sendEmailNoLog.mock.calls[0][0].replyTo)).toContain('krishna@sbcllp.in');
    expect(systemRecordReminder).toHaveBeenCalledWith(['r1'], { status: 'sent', channel: 'email', toEmail: 'yash.babbar@summitconsulting.in' });
  });

  it('records a failure when no email could go', async () => {
    systemDueReminders.mockResolvedValue([due()]);
    systemSendMailAs.mockResolvedValue(null);
    sendEmailNoLog.mockResolvedValue({ ok: true, skipped: true });
    expect(await sendDueReminders('2026-11-03')).toMatchObject({ sent: 0, failed: 1 });
    expect(systemRecordReminder).toHaveBeenCalledWith(['r1'], expect.objectContaining({ status: 'failed', error: 'email_not_configured' }));
  });

  it('records a partner with no email as failed without sending', async () => {
    systemDueReminders.mockResolvedValue([due({ partnerEmail: null })]);
    expect(await sendDueReminders('2026-11-03')).toMatchObject({ failed: 1 });
    expect(systemSendMailAs).not.toHaveBeenCalled();
    expect(systemRecordReminder).toHaveBeenCalledWith(['r1'], expect.objectContaining({ status: 'failed', error: 'no_partner_email' }));
  });

  it('waits for the sheet’s send hour', async () => {
    systemDueReminders.mockResolvedValue([due()]);
    expect(await sendDueReminders('2026-11-03', { hourIst: 8 })).toEqual({ sent: 0, failed: 0, viaOutlook: 0, viaEmail: 0 });
    expect(systemSendMailAs).not.toHaveBeenCalled();
  });

  it('sends nothing for a sheet whose reminders were turned off after queueing', async () => {
    systemDueReminders.mockResolvedValue([due({ rules: { ...due().rules, enabled: false } })]);
    expect(await sendDueReminders('2026-11-03')).toMatchObject({ sent: 0, failed: 0 });
    expect(systemSendMailAs).not.toHaveBeenCalled();
    expect(systemRecordReminder).not.toHaveBeenCalled();
  });

  it('uses the manager’s edited text for today', async () => {
    systemDueReminders.mockResolvedValue([due({}, { subjectOverride: 'Duravant: please chase', bodyOverride: 'Hi Yash, call them today.' })]);
    await sendDueReminders('2026-11-03');
    expect(systemSendMailAs.mock.calls[0][1]).toMatchObject({ subject: 'Duravant: please chase', text: 'Hi Yash, call them today.' });
  });
});
