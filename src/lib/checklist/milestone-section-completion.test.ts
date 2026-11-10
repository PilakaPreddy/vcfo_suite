import { describe, expect, it } from 'vitest';
import { CLIENT_RESPONSE_FIELDS } from '@/lib/checklist/checklist-responses';
import { applyShowWhen } from '@/lib/checklist/checklist-repeat';
import {
  getSectionPendingItems,
  isSectionFieldsComplete,
} from '@/lib/checklist/milestone-section-completion';

const pre9 = CLIENT_RESPONSE_FIELDS['pre-9'] ?? [];

describe('getSectionPendingItems', () => {
  it('lists required fields that are still empty, in field order', () => {
    const pending = getSectionPendingItems(pre9, {});
    expect(pending.map((p) => p.fieldId)).toEqual(
      pre9.filter((f) => f.required !== false).map((f) => f.id),
    );
    expect(isSectionFieldsComplete(pre9, {})).toBe(false);
  });

  it('surfaces a validation error even on a filled field, once', () => {
    const filled = Object.fromEntries(pre9.map((f) => [f.id, 'x']));
    const [first] = pre9;
    const pending = getSectionPendingItems(pre9, filled, { [first!.id]: 'Bad value' });
    expect(pending).toEqual([{ fieldId: first!.id, label: first!.label }]);
    expect(isSectionFieldsComplete(pre9, filled)).toBe(true);
    expect(isSectionFieldsComplete(pre9, filled, { [first!.id]: 'Bad value' })).toBe(false);
  });
});

describe('Part A proposed directors section (UAT D-T04-01)', () => {
  // The form passes only the fields on screen, so the test applies showWhen the same way.
  const shown = (r: Record<string, string>) =>
    applyShowWhen(CLIENT_RESPONSE_FIELDS['pre-1'].filter((f) => f.section === 'Proposed Directors'), r);
  const two = {
    directorCount: '2',
    director1FirstName: 'Kiran', director1LastName: 'Rao', director1Gender: 'male', director1IndiaResident: 'yes',
    director2FirstName: 'Meera', director2LastName: 'Iyer', director2Gender: 'female', director2IndiaResident: 'yes',
  };

  it('is complete with two directors and no middle names (the middle name is optional)', () => {
    expect(getSectionPendingItems(shown(two), two)).toEqual([]);
  });

  it('still asks for director 3 when the count is 3', () => {
    const three = { ...two, directorCount: '3' };
    const pending = getSectionPendingItems(shown(three), three).map((p) => p.fieldId);
    expect(pending).toContain('director3FirstName');
    expect(pending).not.toContain('director4FirstName');
  });
});

describe('fields labelled "(optional)" (UAT D-T04-01)', () => {
  it('are never required, so they never hold a section tick open', () => {
    const wrong: string[] = [];
    for (const [item, fields] of Object.entries(CLIENT_RESPONSE_FIELDS)) {
      for (const f of fields) {
        const list = f.type === 'repeat' && 'entryFields' in f ? (f as { entryFields: typeof fields }).entryFields : [f];
        for (const x of list) if (/\(optional\)/i.test(x.label) && x.required !== false) wrong.push(`${item}.${x.id}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
