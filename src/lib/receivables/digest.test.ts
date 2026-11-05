import { describe, expect, it } from 'vitest';
import { buildReceivablesDigest, receivablesDigestEmail, type DigestInput, type DigestInvoice } from './digest';

function inv(p: Partial<DigestInvoice> & { id: string }): DigestInvoice {
  return {
    clientName: 'Duravant',
    invoiceNo: p.id.toUpperCase(),
    dueDate: '2026-11-20',
    amountInr: 1000,
    status: 'open',
    paidOn: null,
    paidAmount: null,
    promisedOn: null,
    partnerName: 'Priya Raman',
    ...p,
  };
}

// Monday 9 Nov 2026: last week is 2 to 8 Nov, this week 9 to 15 Nov.
const base: DigestInput = {
  sheetName: 'Demo receivables',
  clientOrgName: 'Demo Summit',
  managerName: 'Project Manager',
  today: '2026-11-09',
  invoices: [],
  failedReminders: [],
  unpublishedChanges: 0,
  lastPublishedAt: null,
  url: 'https://app.example/receivables/manager?sheet=1',
};

describe('buildReceivablesDigest', () => {
  const invoices = [
    inv({ id: 'p1', status: 'received', paidOn: '2026-11-03', paidAmount: 500, amountInr: 500 }),
    inv({ id: 'p2', status: 'received', paidOn: '2026-11-09', paidAmount: 700 }), // today: not last week
    inv({ id: 'p3', status: 'received', paidOn: '2026-11-01', paidAmount: 900 }), // before last week
    ...[1, 2, 3, 4, 5, 6].map((n) => inv({ id: `o${n}`, dueDate: '2026-10-01', amountInr: n * 100 })),
    inv({ id: 'd1', dueDate: '2026-11-09', amountInr: 250, promisedOn: '2026-11-12' }),
    inv({ id: 'd2', dueDate: '2026-11-15', amountInr: 150 }),
    inv({ id: 'd3', dueDate: '2026-11-16', amountInr: 50, promisedOn: '2026-11-16' }), // next week
  ];
  const d = buildReceivablesDigest({ ...base, invoices });

  it('sums what was collected in the seven days before today', () => {
    expect(d.weekFrom).toBe('2026-11-02');
    expect(d.weekTo).toBe('2026-11-08');
    expect(d.collected.count).toBe(1);
    expect(d.collected.inr).toBe(500);
  });

  it('keeps the five largest overdue invoices', () => {
    expect(d.overdue.count).toBe(6);
    expect(d.overdue.inr).toBe(2100);
    expect(d.overdue.top.map((l) => l.label)).toEqual(['Duravant O6', 'Duravant O5', 'Duravant O4', 'Duravant O3', 'Duravant O2']);
    expect(d.overdue.top[0].note).toBe('39 days overdue');
  });

  it('lists promises and invoices due this week only', () => {
    expect(d.promises.map((l) => l.label)).toEqual(['Duravant D1']);
    expect(d.promises[0].note).toBe('promised 12-Nov-26 by Priya Raman');
    expect(d.dueThisWeek.lines.map((l) => l.label)).toEqual(['Duravant D1', 'Duravant D2']);
    expect(d.dueThisWeek.inr).toBe(400);
  });

  it('is empty when nothing is open, collected, failed or waiting', () => {
    expect(buildReceivablesDigest(base).empty).toBe(true);
    expect(receivablesDigestEmail(base)).toBeNull();
    expect(buildReceivablesDigest({ ...base, unpublishedChanges: 2 }).empty).toBe(false);
  });
});

describe('receivablesDigestEmail', () => {
  it('writes the subject, the sections and escapes names', () => {
    const mail = receivablesDigestEmail({
      ...base,
      clientOrgName: 'Demo <Summit>',
      invoices: [inv({ id: 'x', dueDate: '2026-11-01', amountInr: 123456 })],
      failedReminders: [{ clientName: 'Duravant', invoiceNo: 'X', forDate: '2026-11-05', toEmail: 'a@b.c', error: 'Mailbox full' }],
      unpublishedChanges: 1,
    })!;
    expect(mail.subject).toBe('Receivables this week · Demo <Summit>: ₹1,23,456 overdue, ₹0 collected');
    expect(mail.html).toContain('Demo &lt;Summit&gt;');
    expect(mail.html).toContain('Reminders that failed · 1');
    expect(mail.html).toContain('1 change is waiting for an Update');
    expect(mail.text).toContain('- Duravant X: ₹1,23,456, 8 days overdue');
    expect(mail.text).toContain('Open the sheet: https://app.example/receivables/manager?sheet=1');
  });
});
