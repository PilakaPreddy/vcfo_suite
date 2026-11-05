import { describe, expect, it } from 'vitest';
import { audienceFor, bellRecipients, importanceFor, isWatchStaff, reviewers, summaryFor, watchHref, type WatchPerson } from '../recipients';

const people: WatchPerson[] = [
  { id: 's', role: 'super_admin' },
  { id: 'a', role: 'admin' },
  { id: 'm', role: 'manager' },
  { id: 'i', role: 'intern' },
  { id: 'c', role: 'client' },
];

describe('who gets what', () => {
  it('derives importance from the change type and the source, never the model', () => {
    for (const change of ['due_date', 'penalty', 'law_in_force', 'form_change'] as const) {
      expect(importanceFor(change, 'everyone')).toBe('important');
    }
    for (const change of ['circular', 'faq', 'clarification', 'consultation', 'other'] as const) {
      expect(importanceFor(change, 'everyone')).toBe('normal');
    }
    expect(importanceFor('due_date', 'staff')).toBe('staff_only');
  });

  it('gives an important update one bell row per person, all five roles', () => {
    expect(bellRecipients('important', people).map((p) => p.id)).toEqual(['s', 'a', 'm', 'i', 'c']);
  });

  it('sends nothing at publish for normal and staff-only updates', () => {
    expect(bellRecipients('normal', people)).toEqual([]);
    expect(bellRecipients('staff_only', people)).toEqual([]);
  });

  it('keeps staff-only updates out of a client summary and the board', () => {
    const updates = [{ importance: 'normal' as const }, { importance: 'staff_only' as const }];
    expect(summaryFor(people[4]!, updates)).toEqual([updates[0]]);
    expect(summaryFor(people[3]!, updates)).toEqual(updates);
    expect(audienceFor('staff_only')).toBe('staff');
    expect(audienceFor('normal')).toBe('everyone');
  });

  it('lets super admin, admin and manager review, with no single named person', () => {
    expect(reviewers(people).map((p) => p.id)).toEqual(['s', 'a', 'm']);
    expect(isWatchStaff('intern')).toBe(true);
    expect(isWatchStaff('client')).toBe(false);
    expect(isWatchStaff('developer')).toBe(false);
    expect(watchHref('manager')).toBe('/app/manager/watch');
  });
});
