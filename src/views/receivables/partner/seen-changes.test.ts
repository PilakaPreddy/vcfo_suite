import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PartnerRowDto } from '@/lib/receivables/partner-wire';
import { changeWord, changesSince, readSeen, seenFrom, seenKey, writeSeen } from './seen-changes';

const row = (over: Partial<PartnerRowDto> & { id: string }): PartnerRowDto => ({
  invoiceMonth: '2026-09-01',
  clientName: 'Duravant',
  invoiceNo: over.id,
  partnerId: null,
  dueDate: '2026-10-16',
  amountInr: 1000,
  status: 'open',
  paidOn: null,
  paidAmount: null,
  paidVia: null,
  partPaid: 0,
  remindersPausedUntil: null,
  pauseReason: null,
  partnerSlug: null,
  partnerName: null,
  promisedOn: null,
  noteCount: 0,
  ...over,
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('changesSince', () => {
  const before = seenFrom('2026-11-01T10:00:00.000Z', [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })]);
  const now = [row({ id: 'a', status: 'received' }), row({ id: 'b', amountInr: 900 }), row({ id: 'd' })];

  it('lists the rows that moved since the last published version seen', () => {
    const list = changesSince(before, '2026-11-04T10:00:00.000Z', now);
    expect(list.map((c) => [c.invoiceId, c.kind, changeWord(c)])).toEqual([
      ['a', 'changed', 'Received'],
      ['b', 'changed', 'Amount changed'],
      ['d', 'added', 'New'],
      ['c', 'removed', 'Removed'],
    ]);
  });

  it('says nothing on a first visit or when nothing was published since', () => {
    expect(changesSince(null, '2026-11-04T10:00:00.000Z', now)).toEqual([]);
    expect(changesSince(before, before.publishedAt, now)).toEqual([]);
  });
});

describe('readSeen and writeSeen', () => {
  it('round-trips per email, case-insensitively', () => {
    const s = seenFrom('2026-11-01T10:00:00.000Z', [row({ id: 'a' })]);
    writeSeen('Priya@Example.com', s);
    expect(readSeen('priya@example.com')).toEqual(s);
    expect(seenKey(' A@B.C ')).toBe('vcfo:rcv-partner-seen:a@b.c');
  });

  it('survives junk and a storage that throws', () => {
    window.localStorage.setItem(seenKey('x@y.z'), '{not json');
    expect(readSeen('x@y.z')).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSeen('x@y.z')).toBeNull();
    expect(() => writeSeen('x@y.z', seenFrom('t', []))).not.toThrow();
  });
});
