import { describe, expect, it } from 'vitest';
import type { SheetInvoice } from '@/lib/receivables/model';
import { filterInvoices, filtersFromParams, isFiltered, paramsWithFilters } from './sheet-filters';

const TODAY = '2026-11-04';
const inv = (over: Partial<SheetInvoice>): SheetInvoice => ({
  id: 'x',
  invoiceMonth: '2026-10-01',
  clientName: 'Duravant',
  invoiceNo: 'SC/10/01',
  partnerId: 'p1',
  dueDate: '2026-11-20',
  amountInr: 100,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  currency: 'INR',
  ...over,
});
const partners = [
  { id: 'p1', slug: 'priya-raman', name: 'Priya Raman' },
  { id: 'p2', slug: 'rahul-mehta', name: 'Rahul Mehta' },
];

describe('the filters in the URL', () => {
  it('round-trips every filter and keeps the other keys', () => {
    const qs = paramsWithFilters('tab=sheet&sheet=abc', {
      search: 'north',
      partnerSlugs: ['priya-raman'],
      clients: ['Duravant', 'Helios, Labs'],
      status: 'overdue',
      months: ['2026-09-01'],
      currency: 'usd',
    });
    const q = new URLSearchParams(qs);
    expect(q.get('tab')).toBe('sheet');
    expect(q.get('sheet')).toBe('abc');
    expect(filtersFromParams(q)).toEqual({
      search: 'north',
      partnerSlugs: ['priya-raman'],
      clients: ['Duravant', 'Helios, Labs'],
      status: 'overdue',
      months: ['2026-09-01'],
      currency: 'USD',
    });
  });

  it('leaves the default status and empty fields out', () => {
    expect(paramsWithFilters('tab=sheet&q=old&status=received', { status: 'open', search: '  ' })).toBe('tab=sheet');
  });

  it('drops malformed values', () => {
    expect(filtersFromParams(new URLSearchParams('month=Sept&cur=dollars&status=nope'))).toEqual({});
  });

  it('knows when the view is narrowed', () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ status: 'open' })).toBe(false);
    expect(isFiltered({ status: 'all' })).toBe(true);
    expect(isFiltered({ currency: 'USD' })).toBe(true);
  });
});

describe('filterInvoices', () => {
  const rows = [
    inv({ id: 'a', partnerId: 'p1', dueDate: '2026-10-01' }),
    inv({ id: 'b', partnerId: 'p2', clientName: 'Northwind', currency: 'USD', fcAmount: 10 }),
    inv({ id: 'c', partnerId: null, status: 'received', paidOn: '2026-11-01' }),
    inv({ id: 'd', partnerId: 'p2', dueDate: '2026-11-08' }),
  ];
  const ids = (f: Parameters<typeof filterInvoices>[2]) => filterInvoices(rows, partners, f, TODAY).map((r) => r.id);

  it('shows open invoices by default', () => expect(ids({})).toEqual(['a', 'b', 'd']));
  it('filters by partner slug', () => expect(ids({ partnerSlugs: ['rahul-mehta'] })).toEqual(['b', 'd']));
  it('searches the partner name too', () => expect(ids({ search: 'priya' })).toEqual(['a']));
  it('filters by status', () => {
    expect(ids({ status: 'overdue' })).toEqual(['a']);
    expect(ids({ status: 'due_soon' })).toEqual(['d']);
    expect(ids({ status: 'received' })).toEqual(['c']);
    expect(ids({ status: 'all' })).toEqual(['a', 'b', 'c', 'd']);
  });
  it('filters by currency', () => expect(ids({ currency: 'USD' })).toEqual(['b']));
});
