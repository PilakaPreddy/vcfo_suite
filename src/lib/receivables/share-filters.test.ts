import { describe, expect, it } from 'vitest';
import { applyShareFilters, describeShareFilters, normaliseShareFilters } from './share-filters';
import type { SnapshotRow } from './model';

const base: SnapshotRow = {
  id: '1',
  invoiceMonth: '2026-10-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/10/01',
  partnerId: 'p1',
  dueDate: '2026-11-01',
  amountInr: 100,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  partnerSlug: 'priya',
  partnerName: 'Priya Raman',
};
const rows: SnapshotRow[] = [
  base,
  { ...base, id: '2', clientName: 'Northwind', partnerSlug: 'rahul', partnerName: 'Rahul Mehta', dueDate: '2026-11-08', currency: 'USD' },
  { ...base, id: '3', status: 'received', paidOn: '2026-11-02', invoiceMonth: '2026-09-01' },
  { ...base, id: '4', dueDate: '2026-12-30' },
];
const today = '2026-11-04';
const ids = (f: Parameters<typeof applyShareFilters>[1]) => applyShareFilters(rows, f, today).map((r) => r.id);

describe('applyShareFilters', () => {
  it('shows open invoices when no status is set', () => expect(ids({})).toEqual(['1', '2', '4']));
  it('filters by status', () => {
    expect(ids({ status: 'overdue' })).toEqual(['1']);
    expect(ids({ status: 'due_soon' })).toEqual(['2']);
    expect(ids({ status: 'received' })).toEqual(['3']);
    expect(ids({ status: 'all' })).toEqual(['1', '2', '3', '4']);
  });
  it('filters by partner, client, month, currency and search', () => {
    expect(ids({ partnerSlugs: ['rahul'] })).toEqual(['2']);
    expect(ids({ clients: ['duravant'] })).toEqual(['1', '4']);
    expect(ids({ months: ['2026-09-01'], status: 'all' })).toEqual(['3']);
    expect(ids({ currency: 'usd' })).toEqual(['2']);
    expect(ids({ currency: 'INR' })).toEqual(['1', '4']);
    expect(ids({ search: 'rahul' })).toEqual(['2']);
  });
});

describe('normaliseShareFilters', () => {
  it('drops junk and empty fields', () => {
    expect(normaliseShareFilters({ partnerSlugs: ['a', '', 3], status: 'bogus', months: ['2026-10-01', 'x'], currency: 'usd', extra: 1 })).toEqual({
      partnerSlugs: ['a'],
      months: ['2026-10-01'],
      currency: 'USD',
    });
    expect(normaliseShareFilters(null)).toEqual({});
  });
});

describe('describeShareFilters', () => {
  it('reads plainly', () => {
    expect(describeShareFilters({ partnerSlugs: ['priya'], status: 'overdue', currency: 'USD' }, { priya: 'Priya Raman' })).toBe('Priya Raman · Overdue · USD');
  });
});
