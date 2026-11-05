import { describe, expect, it } from 'vitest';
import { ageingBucket, ageingSummary, daysToPayByClient } from './ageing';

const TODAY = '2026-11-03';

describe('ageingBucket', () => {
  it('puts each due date in its bucket', () => {
    expect(ageingBucket('2026-11-04', TODAY)).toBe('not_due');
    expect(ageingBucket(TODAY, TODAY)).toBe('0-30');
    expect(ageingBucket('2026-10-04', TODAY)).toBe('0-30'); // 30 days
    expect(ageingBucket('2026-10-03', TODAY)).toBe('31-60'); // 31 days
    expect(ageingBucket('2026-09-04', TODAY)).toBe('31-60'); // 60 days
    expect(ageingBucket('2026-09-03', TODAY)).toBe('61-90'); // 61 days
    expect(ageingBucket('2026-08-05', TODAY)).toBe('61-90'); // 90 days
    expect(ageingBucket('2026-08-04', TODAY)).toBe('90+'); // 91 days
  });
});

describe('ageingSummary', () => {
  const row = (dueDate: string, amountInr: number, over: Partial<{ status: 'open' | 'received'; disputed: boolean }> = {}) => ({
    status: 'open' as 'open' | 'received',
    dueDate,
    amountInr,
    ...over,
  });

  it('totals open, undisputed rows per bucket', () => {
    const s = ageingSummary(
      [
        row('2026-11-10', 100),
        row('2026-11-01', 200.5),
        row('2026-10-30', 300.25),
        row('2026-09-15', 400),
        row('2026-07-01', 500),
        row('2026-07-01', 999, { disputed: true }),
        row('2026-10-01', 999, { status: 'received' }),
      ],
      TODAY,
    );
    expect(s.not_due).toEqual({ count: 1, inr: 100 });
    expect(s['0-30']).toEqual({ count: 2, inr: 500.75 });
    expect(s['31-60']).toEqual({ count: 1, inr: 400 });
    expect(s['61-90']).toEqual({ count: 0, inr: 0 });
    expect(s['90+']).toEqual({ count: 1, inr: 500 });
    expect(s.total).toEqual({ count: 5, inr: 1500.75 });
  });

  it('is all zeros for no rows', () => {
    expect(ageingSummary([], TODAY).total).toEqual({ count: 0, inr: 0 });
  });
});

describe('daysToPayByClient', () => {
  const paid = (clientName: string, dueDate: string, paidOn: string | null, status: 'open' | 'received' = 'received') => ({ clientName, dueDate, paidOn, status });

  it('averages days late per client and sorts the latest payer first', () => {
    const out = daysToPayByClient([
      paid('Bupa', '2026-10-01', '2026-10-11'), // 10 late
      paid('Bupa', '2026-09-01', '2026-09-06'), // 5 late
      paid('Vena', '2026-10-10', '2026-10-07'), // 3 early
      paid('Emburse', '2026-10-01', '2026-10-31'), // 30 late
      paid('Emburse', '2026-10-01', null),
      paid('Inspired', '2026-10-01', '2026-10-20', 'open'),
    ]);
    expect(out).toEqual([
      { client: 'Emburse', count: 1, avgDaysLate: 30, maxDaysLate: 30 },
      { client: 'Bupa', count: 2, avgDaysLate: 7.5, maxDaysLate: 10 },
      { client: 'Vena', count: 1, avgDaysLate: -3, maxDaysLate: -3 },
    ]);
  });

  it('breaks a tie on the average with the worst single payment', () => {
    const out = daysToPayByClient([
      paid('A', '2026-10-01', '2026-10-06'),
      paid('A', '2026-10-01', '2026-10-06'),
      paid('B', '2026-10-01', '2026-10-01'),
      paid('B', '2026-10-01', '2026-10-11'),
    ]);
    expect(out.map((c) => c.client)).toEqual(['B', 'A']);
  });
});
