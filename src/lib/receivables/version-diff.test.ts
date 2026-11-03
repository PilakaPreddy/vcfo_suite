import { describe, expect, it } from 'vitest';
import { sheetDate } from './dates';
import { describeVersionChange, diffVersions } from './version-diff';

type R = Parameters<typeof diffVersions>[0][number];
const r = (p: Partial<R> & { id: string }): R => ({
  partnerId: 'p1',
  partnerName: 'Priya',
  clientName: 'Duravant',
  invoiceNo: p.id,
  amountInr: 1000,
  status: 'open',
  dueDate: '2026-10-16',
  ...p,
});
const money = (n: number) => `₹${n}`;

describe('diffVersions', () => {
  const prev = [r({ id: 'a' }), r({ id: 'b' }), r({ id: 'c' }), r({ id: 'd' })];
  const next = [
    r({ id: 'a', status: 'received' }),
    r({ id: 'b', amountInr: 900, dueDate: '2026-10-20' }),
    r({ id: 'c', partnerId: 'p2', partnerName: 'Rahul' }),
    r({ id: 'e', clientName: 'Acme' }),
  ];
  const list = diffVersions(prev, next);

  it('finds added, changed, partner moves and removed rows across the sheet', () => {
    expect(list.map((c) => [c.invoiceId, c.kind, c.fields])).toEqual([
      ['e', 'added', []],
      ['a', 'changed', ['status']],
      ['b', 'changed', ['amount', 'dueDate']],
      ['c', 'changed', ['partner']],
      ['d', 'removed', []],
    ]);
  });

  it('describes each change with the before value', () => {
    const text = (id: string) => describeVersionChange(list.find((c) => c.invoiceId === id)!, money, sheetDate);
    expect(text('a')).toEqual(['Marked received']);
    expect(text('b')).toEqual(['Amount ₹1000 → ₹900', 'Due 16-Oct-26 → 20-Oct-26']);
    expect(text('c')).toEqual(['Partner Priya → Rahul']);
    expect(text('e')).toEqual(['Added']);
  });

  it('is empty for identical versions', () => {
    expect(diffVersions(prev, prev)).toEqual([]);
  });
});
