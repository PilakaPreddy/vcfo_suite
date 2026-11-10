import { describe, expect, it } from 'vitest';
import { COMPLIANCE_EVENT_KINDS, EVENT_TRIGGER_RULES } from '@/data/event-triggers';
import { AGENDA_LIBRARY_SEED } from '@/data/board-agenda-library';
import { addDays, daysUntil, planEvent } from './plan';

describe('event trigger rules', () => {
  it('gives each event its form and day count', () => {
    const table = Object.fromEntries(COMPLIANCE_EVENT_KINDS.map((k) => [k, `${EVENT_TRIGGER_RULES[k].form}/${EVENT_TRIGGER_RULES[k].days}`]));
    expect(table).toEqual({
      director_appointed: 'DIR-12/30',
      director_resigned: 'DIR-12/30',
      registered_office_changed: 'INC-22/30',
      auditor_appointed: 'ADT-1/15',
      shares_allotted: 'PAS-3/15',
      authorised_capital_increased: 'SH-7/30',
      resolution_needs_filing: 'MGT-14/30',
    });
  });

  it('names only agenda library items that exist', () => {
    const ids = new Set(AGENDA_LIBRARY_SEED.map((i) => i.id));
    for (const kind of COMPLIANCE_EVENT_KINDS) {
      for (const id of EVENT_TRIGGER_RULES[kind].resolution?.agendaItemIds ?? []) expect(ids.has(id), `${kind} ${id}`).toBe(true);
    }
  });

  it('gives every rule a legal reference and at least one client request item', () => {
    for (const kind of COMPLIANCE_EVENT_KINDS) {
      expect(EVENT_TRIGGER_RULES[kind].legalReference).toMatch(/Section/);
      expect(EVENT_TRIGGER_RULES[kind].requestItems.length).toBeGreaterThan(0);
    }
  });
});

describe('planEvent', () => {
  it('counts the due date in calendar days, across months and years', () => {
    expect(planEvent({ kind: 'director_resigned', occurredOn: '2026-11-09' }).dueOn).toBe('2026-12-09');
    expect(planEvent({ kind: 'auditor_appointed', occurredOn: '2026-12-20' }).dueOn).toBe('2027-01-04');
    expect(planEvent({ kind: 'shares_allotted', occurredOn: '2028-02-20' }).dueOn).toBe('2028-03-06');
    expect(planEvent({ kind: 'authorised_capital_increased', occurredOn: '2027-01-31' }).dueOn).toBe('2027-03-02');
  });

  it('puts the person in the task title, and drops the placeholder without one', () => {
    expect(planEvent({ kind: 'director_appointed', occurredOn: '2026-11-01', details: { person: 'Asha  Rao' } }).taskTitle).toBe('File DIR-12 for the appointment of Asha Rao');
    expect(planEvent({ kind: 'director_resigned', occurredOn: '2026-11-01' }).taskTitle).toBe('File DIR-12 for the resignation');
    expect(planEvent({ kind: 'auditor_appointed', occurredOn: '2026-11-01', details: { firm: 'K & Co' } }).taskTitle).toBe('File ADT-1 for the appointment of K & Co');
  });

  it('notes MGT-14 for a director change', () => {
    expect(planEvent({ kind: 'director_appointed', occurredOn: '2026-11-01' }).notes.join(' ')).toMatch(/MGT-14/);
  });

  it('separates a move within the city from one outside it', () => {
    const within = planEvent({ kind: 'registered_office_changed', occurredOn: '2026-11-01', details: { withinCity: 'yes' } });
    expect(within.notes[0]).toMatch(/board resolution is enough/);
    expect(within.requestItems.some((i) => i.kind === 'confirmation')).toBe(false);
    const outside = planEvent({ kind: 'registered_office_changed', occurredOn: '2026-11-01', details: { withinCity: 'no' } });
    expect(outside.notes[0]).toMatch(/special resolution and file MGT-14/);
    expect(outside.requestItems.some((i) => /special resolution/.test(i.label))).toBe(true);
    const unknown = planEvent({ kind: 'registered_office_changed', occurredOn: '2026-11-01' });
    expect(unknown.requestItems.some((i) => i.kind === 'confirmation')).toBe(true);
  });

  it('adds the private placement note only when asked', () => {
    expect(planEvent({ kind: 'shares_allotted', occurredOn: '2026-11-01', details: { privatePlacement: 'yes' } }).notes[0]).toMatch(/private placement/);
    expect(planEvent({ kind: 'shares_allotted', occurredOn: '2026-11-01' }).notes[0]).not.toMatch(/This was a private placement/);
  });

  it('does not change the rule table when it adds notes', () => {
    planEvent({ kind: 'registered_office_changed', occurredOn: '2026-11-01', details: { withinCity: 'no' } });
    expect(EVENT_TRIGGER_RULES.registered_office_changed.requestItems).toHaveLength(4);
  });
});

describe('day helpers', () => {
  it('adds days and counts days left', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysUntil('2026-11-10', '2026-11-09')).toBe(-1);
    expect(daysUntil('2026-11-10', '2026-12-10')).toBe(30);
    expect(() => addDays('10/11/2026', 1)).toThrow();
  });
});
