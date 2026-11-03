import { describe, expect, it } from 'vitest';
import type { SnapshotRow } from './model';
import { publicView, rowsForPartner, validPartner } from './public-view';

const TODAY = '2026-11-03';
const row = (over: Partial<SnapshotRow>): SnapshotRow => ({
  id: 'x',
  invoiceMonth: '2026-09-01',
  clientName: 'Client',
  invoiceNo: null,
  partnerId: null,
  partnerSlug: null,
  partnerName: null,
  dueDate: '2026-11-14',
  amountInr: 100,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  ...over,
});

const ROWS = [
  row({ id: 'a', invoiceMonth: '2026-08-01', clientName: 'Bupa', dueDate: '2026-11-02', amountInr: 2010500, partnerSlug: 'sandeep' }),
  row({ id: 'b', clientName: 'Bupa', dueDate: '2026-11-14', amountInr: 1976259, partnerSlug: 'sandeep' }),
  row({ id: 'c', clientName: 'Duravant', dueDate: '2026-10-16', amountInr: 6456984, partnerSlug: 'yash' }),
  row({ id: 'd', clientName: 'Raptor', dueDate: '2026-10-30', amountInr: 12276186, partnerSlug: 'yash', status: 'received', paidOn: '2026-11-01', paidAmount: 12276186 }),
  row({ id: 'e', clientName: 'Old', status: 'received', paidOn: '2026-10-01', paidAmount: 5, partnerSlug: 'yash' }),
];

describe('publicView', () => {
  it('groups open invoices by month, oldest due first, with this week’s receipts', () => {
    const v = publicView(ROWS, null, TODAY);
    expect(v.months.map((m) => [m.month, m.rows.map((r) => r.id)])).toEqual([
      ['2026-08-01', ['a']],
      ['2026-09-01', ['c', 'b']],
    ]);
    expect(v.received.map((r) => r.id)).toEqual(['d']);
    expect(v.totals).toMatchObject({ openInr: 2010500 + 1976259 + 6456984, overdueCount: 2, oldestOverdueDays: 18, receivedWeekInr: 12276186 });
  });

  it('cuts to one partner', () => {
    const v = publicView(ROWS, 'yash', TODAY);
    expect(v.months.flatMap((m) => m.rows.map((r) => r.id))).toEqual(['c']);
    expect(v.received.map((r) => r.id)).toEqual(['d']);
    expect(v.totals.openInr).toBe(6456984);
  });
});

describe('partner filter', () => {
  it('honours only partners in the snapshot', () => {
    const partners = [{ slug: 'yash' }, { slug: 'sandeep' }];
    expect(validPartner('yash', partners)).toBe('yash');
    expect(validPartner('mallory', partners)).toBeNull();
    expect(validPartner(undefined, partners)).toBeNull();
    expect(rowsForPartner(ROWS, 'nobody')).toEqual([]);
  });
});
