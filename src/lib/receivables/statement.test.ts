import { describe, expect, it } from 'vitest';
import { buildStatement, defaultStatementPeriod, parseStatementQuery, statementFileName, type StatementSourceRow } from './statement';

function row(p: Partial<StatementSourceRow> & { id: string }): StatementSourceRow {
  return {
    clientName: 'Duravant',
    invoiceNo: p.id.toUpperCase(),
    invoiceMonth: '2026-09-01',
    dueDate: '2026-10-15',
    amountInr: 1000,
    status: 'open',
    paidOn: null,
    paidAmount: null,
    partPaid: 0,
    ...p,
  };
}

const q = (s: string) => new URLSearchParams(s);

describe('buildStatement', () => {
  const rows = [
    // Before the period, still open: opening and closing.
    row({ id: 'a', invoiceMonth: '2026-07-01', amountInr: 500 }),
    // Before the period, received before it: not on the statement.
    row({ id: 'b', invoiceMonth: '2026-07-01', status: 'received', paidOn: '2026-08-20', paidAmount: 700, amountInr: 700 }),
    // Before the period, received in it: opening and received.
    row({ id: 'c', invoiceMonth: '2026-08-01', status: 'received', paidOn: '2026-09-10', paidAmount: 290, amountInr: 300 }),
    // In the period, received in it: invoiced and received.
    row({ id: 'd', invoiceDate: '2026-09-05', status: 'received', paidOn: '2026-09-25', paidAmount: 200, amountInr: 200 }),
    // In the period, received after it: invoiced and closing.
    row({ id: 'e', invoiceDate: '2026-09-20', dueDate: '2026-09-25', status: 'received', paidOn: '2026-10-05', paidAmount: 400, amountInr: 400 }),
    // After the period: not on the statement.
    row({ id: 'f', invoiceMonth: '2026-10-01', amountInr: 900 }),
    // Another client.
    row({ id: 'g', clientName: 'Northwind', invoiceMonth: '2026-07-01', amountInr: 50 }),
  ];
  const s = buildStatement(rows, { client: 'Duravant', from: '2026-09-01', to: '2026-09-30' });

  it('keeps only the client and the lines that touch the period', () => {
    expect(s.lines.map((l) => l.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(s.clients).toEqual(['Duravant', 'Northwind']);
  });

  it('works out the four totals and they reconcile', () => {
    expect(s.opening).toEqual({ count: 2, inr: 800 });
    expect(s.invoiced).toEqual({ count: 2, inr: 600 });
    expect(s.received).toEqual({ count: 2, inr: 500 });
    expect(s.closing).toEqual({ count: 2, inr: 900 });
    expect(s.opening.inr + s.invoiced.inr - s.received.inr).toBe(s.closing.inr);
  });

  it('lists receipts by paid-on date with the INR credited', () => {
    expect(s.receipts.map((l) => [l.id, l.receivedOn, l.receivedInr, l.creditedInr])).toEqual([
      ['c', '2026-09-10', 300, 290],
      ['d', '2026-09-25', 200, 200],
    ]);
  });

  it('counts days overdue at the end of the period for open lines', () => {
    const e = s.lines.find((l) => l.id === 'e')!;
    expect(e.daysOverdue).toBe(5);
    expect(s.lines.find((l) => l.id === 'c')!.daysOverdue).toBeNull();
  });

  it('covers every client with no client and nobody for an unknown one', () => {
    expect(buildStatement(rows, { client: null, from: '2026-09-01', to: '2026-09-30' }).opening.count).toBe(3);
    expect(buildStatement(rows, { client: 'Nobody', from: '2026-09-01', to: '2026-09-30' }).lines).toEqual([]);
  });

  it('treats a received row without a paid-on date as received long ago', () => {
    const st = buildStatement([row({ id: 'z', invoiceMonth: '2026-01-01', status: 'received', paidOn: null })], { client: null, from: '2026-09-01', to: '2026-09-30' });
    expect(st.lines).toEqual([]);
  });
});

describe('parseStatementQuery', () => {
  it('defaults to three months back to today', () => {
    expect(defaultStatementPeriod('2026-11-03')).toEqual({ from: '2026-08-01', to: '2026-11-03' });
    expect(parseStatementQuery(q(''), '2026-11-03')).toEqual({ ok: true, query: { client: null, from: '2026-08-01', to: '2026-11-03' } });
  });

  it('reads the client and the dates', () => {
    expect(parseStatementQuery(q('client=Duravant&from=2026-09-01&to=2026-09-30'), '2026-11-03')).toEqual({
      ok: true,
      query: { client: 'Duravant', from: '2026-09-01', to: '2026-09-30' },
    });
  });

  it('refuses bad dates and periods', () => {
    expect(parseStatementQuery(q('from=2026-02-30'), '2026-11-03')).toEqual({ ok: false, error: 'from' });
    expect(parseStatementQuery(q('to=soon'), '2026-11-03')).toEqual({ ok: false, error: 'to' });
    expect(parseStatementQuery(q('from=2026-10-01&to=2026-09-01'), '2026-11-03')).toEqual({ ok: false, error: 'period' });
    expect(parseStatementQuery(q('from=2020-01-01&to=2026-09-01'), '2026-11-03')).toEqual({ ok: false, error: 'period' });
  });
});

it('makes a safe file name', () => {
  expect(statementFileName('Duravant / "US"', '2026-09-01', '2026-09-30')).toBe('Statement Duravant  US 2026-09-01 to 2026-09-30.xlsx');
});
