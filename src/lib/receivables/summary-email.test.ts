import { describe, expect, it } from 'vitest';
import type { SnapshotRow } from './model';
import { sheetTotals, payTiming } from './summary';
import { summaryEmailHtml, summaryEmailSubject } from './summary-email';

const TODAY = '2026-11-03';
const row = (over: Partial<SnapshotRow>): SnapshotRow => ({
  id: 'x',
  invoiceMonth: '2026-09-01',
  clientName: 'Client',
  invoiceNo: null,
  partnerId: null,
  partnerSlug: 'yash',
  partnerName: 'Yash Babbar',
  dueDate: '2026-10-30',
  amountInr: 0,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  ...over,
});

const ROWS: SnapshotRow[] = [
  row({ id: 'a', invoiceMonth: '2026-08-01', clientName: 'Bupa', dueDate: '2026-11-02', amountInr: 2010500, partnerSlug: 'sandeep' }),
  row({ id: 'b', clientName: 'Emburse', amountInr: 22757764, status: 'received', paidOn: '2026-11-01', paidAmount: 22757764 }),
  row({ id: 'c', clientName: 'Duravant', dueDate: '2026-10-16', amountInr: 6456984 }),
  row({ id: 'd', clientName: 'Vena', dueDate: '2026-11-13', amountInr: 3443910 }),
  row({ id: 'e', clientName: 'Old', amountInr: 100, status: 'received', paidOn: '2026-10-01', paidAmount: 100 }),
];

describe('sheetTotals', () => {
  it('adds open, overdue and this week’s receipts', () => {
    expect(sheetTotals(ROWS, TODAY)).toEqual({
      openInr: 2010500 + 6456984 + 3443910,
      openCount: 3,
      overdueInr: 2010500 + 6456984,
      overdueCount: 2,
      oldestOverdueDays: 18,
      receivedWeekInr: 22757764,
      receivedWeekCount: 1,
    });
  });

  it('describes payment timing', () => {
    expect(payTiming(ROWS[1])).toBe('2 days late');
    expect(payTiming({ dueDate: '2026-11-05', paidOn: '2026-11-02' })).toBe('3 days early');
    expect(payTiming({ dueDate: '2026-11-05', paidOn: '2026-11-05' })).toBe('On the due date');
  });
});

describe('summaryEmailHtml', () => {
  const html = summaryEmailHtml({ rows: ROWS, today: TODAY, liveUrl: 'https://app.sbctrack.in/receivables/k/abc', signerName: 'Krishna Tungam' });

  it('opens with the payments received this week', () => {
    expect(html).toContain('We have received the following payments:');
    expect(html).toContain('<b>Emburse</b> - September 2026');
    expect(html).not.toContain('<b>Old</b>');
  });

  it('keeps the sheet layout and totals', () => {
    expect(html).toContain('August-26 -Receivables');
    expect(html).toContain('September-26 -Receivables');
    expect(html).toContain('No of Days Over Due');
    expect(html).toContain('>18<'); // Duravant
    expect(html).toContain('Received');
    expect(html).toContain("Sep'26- Receivables");
    expect(html).toContain('99,00,894'); // Sep open: Duravant + Vena
    expect(html).toContain('1,19,11,394'); // total open
    expect(html).toContain('app.sbctrack.in/receivables/k/abc');
  });

  it('can be cut to one partner', () => {
    const mine = summaryEmailHtml({ rows: ROWS, today: TODAY, liveUrl: 'u', signerName: 's', partnerSlug: 'sandeep' });
    expect(mine).toContain('Bupa');
    expect(mine).not.toContain('Duravant');
    expect(mine).toContain('No new payments');
  });

  it('escapes client names', () => {
    expect(summaryEmailHtml({ rows: [row({ clientName: '<x>', amountInr: 1 })], today: TODAY, liveUrl: 'u', signerName: 's' })).toContain('&lt;x&gt;');
  });

  it('keeps the INR-only layout with no currency columns', () => {
    expect(html).not.toContain('Currency');
    expect(html).not.toContain('USD Amount');
    expect(html).toContain('colspan="5"');
  });

  it('adds Currency and USD Amount columns when a row is foreign', () => {
    const mixed = summaryEmailHtml({
      rows: [...ROWS, row({ id: 'f', clientName: 'Vena US', dueDate: '2026-11-20', amountInr: 999000, currency: 'USD', fcAmount: 12000, fxRate: 83.25 })],
      today: TODAY,
      liveUrl: 'u',
      signerName: 's',
    });
    expect(mixed).toContain('>Currency<');
    expect(mixed).toContain('>USD Amount<');
    expect(mixed).toContain('colspan="7"');
    expect(mixed).toContain('>12,000.00<');
    expect(mixed).toContain('>INR<');
    expect(mixed).toContain('1,29,10,394'); // total open now includes the booked INR of the USD row
  });

  it('builds the subject from the date', () => {
    expect(summaryEmailSubject(TODAY)).toBe('Receivables update - 3 November');
  });
});
