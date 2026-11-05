import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

const { portalNav } = await import('./Sidebar');

/**
 * R-51 (D-29): the client sidebar keeps its order — Incorporation, Compliances, Registrations
 * while incorporating — with the shared icons: Landmark, CalendarCheck and BadgeCheck.
 */
describe('client portal sidebar (R-51)', () => {
  const nav = (after: boolean) => portalNav({ after, unread: 0, inc: '6/25', docs: 0 });

  it('while incorporating: Home, Incorporation, Compliances, Registrations, Updates', () => {
    const items = nav(false);
    expect(items.slice(0, 5).map((n) => n.t)).toEqual(['Home', 'Incorporation', 'Compliances', 'Registrations', 'Updates']);
    expect(items.slice(1, 4).map((n) => n.i)).toEqual(['landmark', 'calendar-check', 'badge-check']);
    expect(items[1].badge).toBe('6/25');
    expect(items[2].kids?.map((k) => k.t)).toEqual(['Obligations', 'Calendar', 'Filings', 'Labour registers']);
    expect(items[2].kids?.map((k) => k.k)).toEqual(['obligations', 'compliances', 'filings', 'labour-registers']);
    expect(items[3].k).toBe('registrations');
  });

  it('once incorporated: the order it had before R-51 is kept', () => {
    expect(nav(true).slice(1, 4).map((n) => n.t)).toEqual(['Compliances', 'Registrations', 'Incorporation']);
  });
});
