import { describe, expect, it } from 'vitest';
import { BadgeCheck, CalendarCheck, Landmark } from 'lucide-react';
import type { Role } from '@/lib/auth';
import {
  PRACTICE_BLOCK_LABELS,
  developerItems,
  isNavGroup,
  isNavSectionBreak,
  sidebarItemsFor,
  withOfficialUpdates,
  type NavEntry,
} from './sidebar-items';

/**
 * R-51 (D-29): every practice role has the same practice block, in the client's order —
 * Incorporation (Landmark), Compliances (CalendarCheck group), Registrations (BadgeCheck) —
 * right after the role's own daily rows and before Updates. The developer has no block.
 */

function label(e: NavEntry): string {
  return isNavSectionBreak(e) ? `--${e.id}` : e.label;
}

function hrefs(e: NavEntry): string[] {
  if (isNavSectionBreak(e)) return [];
  return isNavGroup(e) ? e.items.map((leaf) => leaf.to) : [e.to];
}

/** The block, plus the row before it and the row after it. */
function block(role: Role, staffBase: string) {
  const items = sidebarItemsFor(role, staffBase);
  const at = items.findIndex((e) => label(e) === 'Incorporation');
  expect(at).toBeGreaterThan(0);
  return { before: label(items[at - 1]), three: items.slice(at, at + 3), after: label(items[at + 3]), items };
}

function expectBlockShape(three: NavEntry[]) {
  expect(three.map(label)).toEqual([...PRACTICE_BLOCK_LABELS]);
  const [inc, comp, reg] = three;
  expect(isNavGroup(inc) || isNavSectionBreak(inc) ? null : inc.icon).toBe(Landmark);
  expect(isNavGroup(comp) ? comp.icon : null).toBe(CalendarCheck);
  expect(isNavGroup(reg) || isNavSectionBreak(reg) ? null : reg.icon).toBe(BadgeCheck);
}

const STAFF: Array<{ role: Role; base: string; before: string }> = [
  { role: 'intern', base: '/app/intern', before: 'Clients' },
  { role: 'manager', base: '/app/manager', before: 'Project leads' },
  { role: 'admin', base: '/app/admin', before: 'Managers' },
];

describe('practice block (R-51)', () => {
  for (const { role, base, before } of STAFF) {
    it(`${role}: Incorporation, Compliances, Registrations after ${before}, before Labour registers`, () => {
      const b = block(role, base);
      expect(b.before).toBe(before);
      expect(b.after).toBe('Labour registers');
      expectBlockShape(b.three);
      expect(b.three.flatMap(hrefs)).toEqual([
        `${base}/incorporation`,
        `${base}/compliances/obligations`,
        `${base}/compliances/calendar`,
        `${base}/compliances/filings`,
        `${base}/registrations`,
      ]);
      expect(isNavGroup(b.three[1]) ? b.three[1].items.map((l) => l.label) : []).toEqual(['Obligations', 'Calendar', 'Filings']);
      // Each entry appears once: the old Registrations row after Compliances is gone.
      expect(b.items.filter((e) => label(e) === 'Registrations')).toHaveLength(1);
    });
  }

  it('lead: Compliances is always there, whatever the clients', () => {
    expect(sidebarItemsFor('intern', '/app/intern').map(label)).toContain('Compliances');
  });

  it('super admin: the block replaces Practice areas, after Clients, on the Practice routes', () => {
    const b = block('super_admin', '/app/super');
    expect(b.before).toBe('Clients');
    expect(b.after).toBe('Labour registers');
    expectBlockShape(b.three);
    expect(b.items.map(label)).not.toContain('Practice areas');
    expect(b.three.flatMap(hrefs)).toEqual([
      '/app/super/practice/incorporation',
      '/app/super/practice/compliances',
      '/app/super/practice/filings',
      '/app/super/practice/registrations',
    ]);
    expect(isNavGroup(b.three[1]) ? b.three[1].items.map((l) => l.label) : []).toEqual(['Obligations', 'Filings']);
  });

  it('client (staff-shell fallback): the same block after Home', () => {
    const b = block('client', '/app/client');
    expect(b.before).toBe('Home');
    expect(b.after).toBe('Labour registers');
    expectBlockShape(b.three);
    expect(b.three.flatMap(hrefs)).toEqual([
      '/app/client/incorporation',
      '/app/client/compliances/obligations',
      '/app/client/compliances/calendar',
      '/app/client/compliances/filings',
      '/app/client/registrations',
    ]);
  });

  it('developer: unchanged, no practice block', () => {
    const items = sidebarItemsFor('developer', '/app/admin');
    expect(items).toBe(developerItems);
    for (const name of PRACTICE_BLOCK_LABELS) expect(items.map(label)).not.toContain(name);
  });

  it('super admin inside the developer console sees the console items', () => {
    expect(sidebarItemsFor('super_admin', '/app/super', true)).toBe(developerItems);
  });
});

describe('withOfficialUpdates', () => {
  it('adds the leaf to the Updates group only, on the role base', () => {
    const items = withOfficialUpdates(sidebarItemsFor('intern', '/app/intern'));
    const updates = items.find((entry) => isNavGroup(entry) && entry.label === 'Updates');
    expect(isNavGroup(updates!) && updates.items.map((leaf) => leaf.to)).toContain('/app/intern/watch');
    expect(sidebarItemsFor('intern', '/app/intern').flatMap((entry) => (isNavGroup(entry) ? entry.items : [])).some((leaf) => leaf.to.endsWith('/watch'))).toBe(false);
  });
});
