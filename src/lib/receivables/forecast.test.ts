import { describe, expect, it } from 'vitest';
import { cashForecast, expectedDate, isoWeekStart, type ForecastRow } from './forecast';

// Tuesday 3 November 2026; its ISO week starts on Monday 2 November.
const TODAY = '2026-11-03';

const row = (over: Partial<ForecastRow> & Pick<ForecastRow, 'id'>): ForecastRow => ({
  clientName: 'Bupa',
  invoiceNo: null,
  dueDate: '2026-11-10',
  amountInr: 1000,
  status: 'open',
  paidOn: null,
  ...over,
});

describe('isoWeekStart', () => {
  it('finds the Monday, Sundays included', () => {
    expect(isoWeekStart('2026-11-03')).toBe('2026-11-02');
    expect(isoWeekStart('2026-11-02')).toBe('2026-11-02');
    expect(isoWeekStart('2026-11-08')).toBe('2026-11-02');
    expect(isoWeekStart('2026-11-09')).toBe('2026-11-09');
  });
});

describe('expectedDate', () => {
  it('prefers the promise, then the history, then the due date', () => {
    expect(expectedDate({ dueDate: '2026-11-10', promisedOn: '2026-11-20' }, 30, TODAY)).toEqual({ expectedOn: '2026-11-20', basis: 'promised' });
    expect(expectedDate({ dueDate: '2026-11-10' }, 4.6, TODAY)).toEqual({ expectedOn: '2026-11-15', basis: 'history' });
    expect(expectedDate({ dueDate: '2026-11-10' }, null, TODAY)).toEqual({ expectedOn: '2026-11-10', basis: 'due' });
  });

  it('treats an early payer as on time and never expects cash before today', () => {
    expect(expectedDate({ dueDate: '2026-11-10' }, -6, TODAY).expectedOn).toBe('2026-11-10');
    expect(expectedDate({ dueDate: '2026-10-01' }, null, TODAY).expectedOn).toBe(TODAY);
    expect(expectedDate({ dueDate: '2026-11-10', promisedOn: '2026-10-30' }, null, TODAY).expectedOn).toBe(TODAY);
  });
});

describe('cashForecast', () => {
  const rows: ForecastRow[] = [
    // Bupa pays 10 days late on average (8 and 12).
    row({ id: 'b-old1', status: 'received', dueDate: '2026-09-10', paidOn: '2026-09-18' }),
    row({ id: 'b-old2', status: 'received', dueDate: '2026-10-10', paidOn: '2026-10-22' }),
    row({ id: 'b-open', dueDate: '2026-11-04', amountInr: 5000 }),
    // Vena has no history and is overdue: this week.
    row({ id: 'v-open', clientName: 'Vena', dueDate: '2026-10-01', amountInr: 2000 }),
    // Promised for the week of 23 November.
    row({ id: 'e-open', clientName: 'Emburse', dueDate: '2026-11-05', promisedOn: '2026-11-25', amountInr: 3000 }),
    // Far out: after the horizon.
    row({ id: 'k-open', clientName: 'KH ANSR', dueDate: '2027-03-01', amountInr: 7000 }),
    row({ id: 'd-open', clientName: 'Duravant', dueDate: '2026-11-04', amountInr: 9000, disputed: true }),
  ];

  it('places each open invoice in its week', () => {
    const f = cashForecast(rows, TODAY, 4);
    expect(f.weeks.map((w) => w.weekStart)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(f.weeks[0]).toMatchObject({ weekEnd: '2026-11-08', count: 1, inr: 2000 });
    expect(f.weeks[0].items[0]).toMatchObject({ id: 'v-open', expectedOn: TODAY, basis: 'due' });
    expect(f.weeks[1].items[0]).toMatchObject({ id: 'b-open', expectedOn: '2026-11-14', basis: 'history' });
    expect(f.weeks[3].items[0]).toMatchObject({ id: 'e-open', basis: 'promised' });
    expect(f.later).toMatchObject({ count: 1, inr: 7000 });
    expect(f.total).toEqual({ count: 4, inr: 17000 });
  });

  it('reports disputed invoices on their own and leaves out received ones', () => {
    const f = cashForecast(rows, TODAY, 4);
    expect(f.disputed).toMatchObject({ count: 1, inr: 9000 });
    expect(f.disputed.items[0].id).toBe('d-open');
    const ids = [...f.weeks.flatMap((w) => w.items), ...f.later.items].map((i) => i.id);
    expect(ids).not.toContain('d-open');
    expect(ids).not.toContain('b-old1');
  });

  it('defaults to eight weeks and copes with nothing open', () => {
    const f = cashForecast([], TODAY);
    expect(f.weeks).toHaveLength(8);
    expect(f.total).toEqual({ count: 0, inr: 0 });
  });
});
