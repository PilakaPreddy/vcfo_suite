import { describe, expect, it } from 'vitest';
import { billedInr, compactInr, dsoDays, sheetKpis, type KpiInvoice } from './kpis';

const TODAY = '2026-11-04';

const row = (over: Partial<KpiInvoice>): KpiInvoice => ({
  status: 'open',
  dueDate: '2026-11-20',
  amountInr: 100_000,
  partPaid: 0,
  paidOn: null,
  paidAmount: null,
  invoiceMonth: '2026-10-01',
  invoiceDate: null,
  promisedOn: null,
  ...over,
});

describe('sheetKpis', () => {
  it('counts open, overdue with the oldest days, and due in the next seven days', () => {
    const k = sheetKpis(
      [
        row({ dueDate: '2026-10-01', amountInr: 50_000 }), // 34 days overdue
        row({ dueDate: '2026-11-03', amountInr: 20_000 }), // 1 day overdue
        row({ dueDate: '2026-11-04', amountInr: 10_000 }), // due today
        row({ dueDate: '2026-11-11', amountInr: 5_000 }), // due in 7 days
        row({ dueDate: '2026-11-12', amountInr: 1_000 }), // due in 8 days
        row({ status: 'received', dueDate: '2026-10-01', paidOn: '2026-10-20', paidAmount: 9_000 }),
      ],
      TODAY,
    );
    expect(k.openCount).toBe(5);
    expect(k.openInr).toBe(86_000);
    expect(k.overdueCount).toBe(2);
    expect(k.overdueInr).toBe(70_000);
    expect(k.oldestOverdueDays).toBe(34);
    expect(k.dueSoonCount).toBe(2);
    expect(k.dueSoonInr).toBe(15_000);
  });

  it('collects only receipts dated in this month, up to today', () => {
    const k = sheetKpis(
      [
        row({ status: 'received', paidOn: '2026-11-01', paidAmount: 40_000 }),
        row({ status: 'received', paidOn: '2026-11-04', paidAmount: 10_000 }),
        row({ status: 'received', paidOn: '2026-10-31', paidAmount: 99_000 }),
        row({ status: 'open', partPaid: 5_000 }),
      ],
      TODAY,
    );
    expect(k.collectedMonthCount).toBe(2);
    expect(k.collectedMonthInr).toBe(50_000);
  });

  it('counts promises falling this week and promises already broken', () => {
    const k = sheetKpis(
      [
        row({ promisedOn: '2026-11-04', amountInr: 1_000 }),
        row({ promisedOn: '2026-11-10', amountInr: 2_000 }),
        row({ promisedOn: '2026-11-11', amountInr: 4_000 }), // a week out: not this week
        row({ promisedOn: '2026-11-01' }), // broken
        row({ status: 'received', promisedOn: '2026-11-05', paidOn: '2026-11-02', paidAmount: 1 }), // paid: no promise left
      ],
      TODAY,
    );
    expect(k.promisesWeekCount).toBe(2);
    expect(k.promisesWeekInr).toBe(3_000);
    expect(k.promisesBrokenCount).toBe(1);
  });
});

describe('dsoDays', () => {
  it('is the open balance over the amount billed in the last 90 days, times 90', () => {
    const rows = [
      row({ invoiceDate: '2026-10-15', amountInr: 300_000 }),
      row({ invoiceDate: '2026-09-01', status: 'received', paidOn: '2026-10-01', paidAmount: 300_000, amountInr: 300_000 }),
      // Billed before the window (more than 90 days ago): its open balance counts, its sale does not.
      row({ invoiceDate: '2026-07-01', amountInr: 0.0001 }),
    ];
    // 300,000 open ÷ 600,000 billed × 90 = 45 days.
    expect(dsoDays(rows, TODAY).days).toBe(45);
    expect(dsoDays(rows, TODAY).billedInr).toBe(600_000);
  });

  it('falls back to the invoice month and counts part payments as billed', () => {
    const rows = [row({ invoiceDate: null, invoiceMonth: '2026-10-01', amountInr: 60_000, partPaid: 40_000 })];
    expect(billedInr(rows[0]!)).toBe(100_000);
    // 60,000 ÷ 100,000 × 90 = 54.
    expect(dsoDays(rows, TODAY).days).toBe(54);
  });

  it('includes the 90th day back and excludes the 91st', () => {
    expect(dsoDays([row({ invoiceDate: '2026-08-07', amountInr: 100 })], TODAY).days).toBe(90);
    expect(dsoDays([row({ invoiceDate: '2026-08-06', amountInr: 100 })], TODAY).days).toBeNull();
  });

  it('is null when nothing was billed in the window', () => {
    expect(dsoDays([], TODAY)).toEqual({ days: null, billedInr: 0 });
  });
});

describe('compactInr', () => {
  it('writes crores, lakhs and plain rupees', () => {
    expect(compactInr(26_029_645)).toBe('₹2.60 Cr');
    expect(compactInr(1_845_000)).toBe('₹18.45 L');
    expect(compactInr(64_000)).toBe('₹64,000');
    expect(compactInr(0)).toBe('₹0');
    expect(compactInr(-150_000)).toBe('−₹1.50 L');
  });
});
