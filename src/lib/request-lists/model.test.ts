import { describe, expect, it } from 'vitest';
import { decideReminder, istHour, itemStatusFromDocumentRequest, listProgress, MAX_REMINDERS, requestsPageHref } from './model';
import { buildRequestListEmail } from './emails';

// 10:00 India time on 9 Nov 2026.
const NOON = new Date('2026-11-09T04:30:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOON.getTime() - n * DAY);
const base = { status: 'sent', reminderCount: 0, cadenceDays: 3, firstSentAt: daysAgo(3), lastRemindedAt: null, callTaskId: null };
const open = [{ status: 'pending' }, { status: 'received' }];

describe('decideReminder', () => {
  it('sends reminder 1 by email only once the cadence has passed', () => {
    expect(decideReminder(base, open, NOON)).toEqual({ kind: 'remind', reminder: 1, whatsapp: false, callTask: false });
    expect(decideReminder({ ...base, firstSentAt: daysAgo(2) }, open, NOON)).toEqual({ kind: 'none', reason: 'not_due' });
  });

  it('adds WhatsApp from reminder 2 and the call task at reminder 3, once', () => {
    expect(decideReminder({ ...base, reminderCount: 1, lastRemindedAt: daysAgo(3) }, open, NOON)).toMatchObject({ reminder: 2, whatsapp: true, callTask: false });
    expect(decideReminder({ ...base, reminderCount: 2, lastRemindedAt: daysAgo(3) }, open, NOON)).toMatchObject({ reminder: 3, whatsapp: true, callTask: true });
    expect(decideReminder({ ...base, reminderCount: 3, lastRemindedAt: daysAgo(3), callTaskId: 't1' }, open, NOON)).toMatchObject({ reminder: 4, callTask: false });
  });

  it('counts from the last reminder, not the first send', () => {
    expect(decideReminder({ ...base, reminderCount: 1, firstSentAt: daysAgo(9), lastRemindedAt: daysAgo(1) }, open, NOON)).toEqual({ kind: 'none', reason: 'not_due' });
  });

  it('completes a list whose items are all in before reminding', () => {
    expect(decideReminder(base, [{ status: 'received' }, { status: 'accepted' }], NOON)).toEqual({ kind: 'complete' });
  });

  it('never reminds drafts, at night, or past the cap', () => {
    expect(decideReminder({ ...base, status: 'draft' }, open, NOON)).toEqual({ kind: 'none', reason: 'not_sent' });
    const night = new Date('2026-11-09T18:30:00Z'); // midnight India
    expect(istHour(night)).toBe(0);
    expect(decideReminder({ ...base, firstSentAt: new Date(night.getTime() - 3 * DAY) }, open, night)).toEqual({ kind: 'none', reason: 'quiet_hours' });
    expect(decideReminder({ ...base, reminderCount: MAX_REMINDERS, lastRemindedAt: daysAgo(5) }, open, NOON)).toEqual({ kind: 'none', reason: 'max_reached' });
  });

  it('tolerates the hourly job running a few minutes early', () => {
    const almost = new Date(daysAgo(3).getTime() + 10 * 60_000);
    expect(decideReminder({ ...base, firstSentAt: almost }, open, NOON).kind).toBe('remind');
  });
});

describe('items and progress', () => {
  it('maps document request states to item states', () => {
    expect(itemStatusFromDocumentRequest('fulfilled', 'pending')).toBe('received');
    expect(itemStatusFromDocumentRequest('approved', 'received')).toBe('accepted');
    expect(itemStatusFromDocumentRequest('cancelled', 'received')).toBe('rejected');
    expect(itemStatusFromDocumentRequest('pending', 'pending')).toBeNull();
    expect(itemStatusFromDocumentRequest('fulfilled', 'received')).toBeNull();
  });

  it('counts received and accepted as in', () => {
    expect(listProgress([{ status: 'pending' }, { status: 'received' }, { status: 'accepted' }, { status: 'rejected' }])).toEqual({ total: 4, done: 2, percent: 50 });
    expect(listProgress([])).toEqual({ total: 0, done: 0, percent: 0 });
  });

  it('links each role to its Requests page', () => {
    expect(requestsPageHref('intern')).toBe('/app/intern/requests');
    expect(requestsPageHref('super_admin')).toBe('/app/super/requests');
    expect(requestsPageHref('client')).toBe('/app/client/requests');
  });
});

describe('buildRequestListEmail', () => {
  it('lists the open items and links to the client Requests page', () => {
    const copy = buildRequestListEmail({
      companyName: 'Acme <Pvt> Ltd',
      title: 'GST monthly data · Oct 2026',
      dueOn: '2026-11-15',
      openItems: [{ label: 'Sales register', kind: 'document' }, { label: 'Advances?', kind: 'answer' }],
      totalItems: 3,
      reminder: 2,
    });
    expect(copy.subject).toContain('reminder');
    expect(copy.subject).toContain('2 still open');
    expect(copy.html).toContain('Acme &lt;Pvt&gt; Ltd');
    expect(copy.text).toContain('- Upload: Sales register');
    expect(copy.text).toContain('/app/client/requests');
  });
});
