import { describe, expect, it } from 'vitest';
import { bandForDate, countMyDay, daysBetween, istDay, MY_DAY_BAND, rankMyDay, type MyDayItem } from './rank';
import { buildMyDayEmail } from './email';

function item(over: Partial<MyDayItem> & Pick<MyDayItem, 'id' | 'kind'>): MyDayItem {
  return { title: over.id, engagementId: 'e1', companyName: 'Acme', href: '/x', weight: 0, ...over };
}

describe('rankMyDay', () => {
  it('orders the bands as the spec lists them', () => {
    const kinds = ['task', 'request_list', 'notice', 'expiry', 'client_reply', 'approval', 'due_today', 'overdue'] as const;
    const ranked = rankMyDay(kinds.map((kind) => item({ id: kind, kind, weight: 999 })));
    expect(ranked.map((r) => r.kind)).toEqual([...kinds].reverse());
  });

  it('puts the most days late first inside overdue, and a heavy task never beats a light overdue item', () => {
    const ranked = rankMyDay([
      item({ id: 'late-1', kind: 'overdue', weight: 1 }),
      item({ id: 'late-9', kind: 'overdue', weight: 9 }),
      item({ id: 'old-task', kind: 'task', weight: 5000 }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['late-9', 'late-1', 'old-task']);
    expect(ranked[2]!.score).toBe(MY_DAY_BAND.task + 999);
  });

  it('breaks ties on the due date, undated last, then company and title', () => {
    const ranked = rankMyDay([
      item({ id: 'b', kind: 'due_today', companyName: 'Beta' }),
      item({ id: 'a', kind: 'due_today', companyName: 'Alpha' }),
      item({ id: 'later', kind: 'expiry', dueOn: '2026-11-15' }),
      item({ id: 'sooner', kind: 'expiry', dueOn: '2026-11-12' }),
      item({ id: 'undated', kind: 'expiry' }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a', 'b', 'sooner', 'later', 'undated']);
  });

  it('drops duplicate ids and honours the limit', () => {
    const ranked = rankMyDay(
      [item({ id: 'x', kind: 'task' }), item({ id: 'x', kind: 'overdue' }), item({ id: 'y', kind: 'task' })],
      1,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.id).toBe('x');
    expect(ranked[0]!.kind).toBe('task');
  });

  it('counts per kind', () => {
    const counts = countMyDay([item({ id: '1', kind: 'overdue' }), item({ id: '2', kind: 'overdue' }), item({ id: '3', kind: 'task' })]);
    expect(counts.overdue).toBe(2);
    expect(counts.task).toBe(1);
    expect(counts.notice).toBe(0);
  });
});

describe('dates', () => {
  it('uses the India date', () => {
    expect(istDay(new Date('2026-11-09T19:00:00Z'))).toBe('2026-11-10');
    expect(daysBetween('2026-11-08', '2026-11-10')).toBe(2);
  });

  it('bands a dated item as overdue, due today or its own kind', () => {
    expect(bandForDate('2026-11-09', '2026-11-10', 'task')).toBe('overdue');
    expect(bandForDate('2026-11-10', '2026-11-10', 'task')).toBe('due_today');
    expect(bandForDate('2026-11-11', '2026-11-10', 'task')).toBe('task');
    expect(bandForDate(undefined, '2026-11-10', 'task')).toBe('task');
  });
});

describe('buildMyDayEmail', () => {
  it('lists the top items with the overdue count in the subject and links to Today', () => {
    const items = rankMyDay([item({ id: 'f', kind: 'overdue', title: 'GSTR-3B', weight: 3, detail: '3 days late' }), item({ id: 't', kind: 'task' })]);
    const copy = buildMyDayEmail({ recipientName: 'Priya Rao', role: 'intern', items });
    expect(copy.subject).toBe('Your day: 2 items, 1 overdue');
    expect(copy.text).toContain('1. Overdue: GSTR-3B · Acme · 3 days late');
    expect(copy.text).toContain('/app/intern/today');
    expect(copy.html).toContain('Hi Priya');
  });
});
