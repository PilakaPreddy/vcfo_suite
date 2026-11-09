import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }));

const { portalNav } = await import('./Sidebar');

/**
 * R-51 (D-29): the client sidebar keeps its order — Incorporation, Compliances, Registrations
 * while incorporating — with the shared icons: Landmark, CalendarCheck and BadgeCheck.
 */
describe('client portal sidebar (R-51)', () => {
  const nav = (after: boolean) => portalNav({ after, unread: 0, inc: '6/25', docs: 0 });

  it('while incorporating: Home, the practice block, then the work rows, then Updates', () => {
    const items = nav(false);
    /* The two work rows sit after the practice block and before Updates, which is where the
       staff sidebar puts them. R-51 governs the three practice labels and their order, not
       what follows them. */
    expect(items.slice(0, 7).map((n) => n.t)).toEqual([
      'Home',
      'Incorporation',
      'Compliances',
      'Registrations',
      'Labour registers',
      'Payroll',
      'Updates',
    ]);
    expect(items.slice(1, 4).map((n) => n.i)).toEqual(['landmark', 'calendar-check', 'badge-check']);
    expect(items[1].badge).toBe('6/25');
    expect(items[2].kids?.map((k) => k.t)).toEqual(['Obligations', 'Calendar', 'Filings', 'Budgets']);
    expect(items[2].kids?.map((k) => k.k)).toEqual(['obligations', 'compliances', 'filings', 'budgets']);
    expect(items[3].k).toBe('registrations');

    /* Two rows, not a label inside Compliances, and neither folded into the other. The staff
       sidebar has had this shape all along; the client portal had the registers buried and no
       way to Payroll at all. */
    expect(items[4].k).toBe('labour-registers');
    expect(items[5].k).toBe('payroll');
    expect([items[4].i, items[5].i]).toEqual(['scroll-text', 'wallet']);
  });

  it('once incorporated: the order it had before R-51 is kept', () => {
    expect(nav(true).slice(1, 4).map((n) => n.t)).toEqual(['Compliances', 'Registrations', 'Incorporation']);
  });
});
