import { describe, expect, it } from 'vitest';
import { repeatFieldId } from '@/lib/checklist/checklist-repeat';
import { changesFor, RECORD_WATCHES, sameValue, watchesForItem } from './detect';

const directors = (...names: Array<[string, string]>) => {
  const ids = names.map((_, i) => `e${i + 1}`);
  const out: Record<string, string> = { directors: ids.join(',') };
  names.forEach(([first, last], i) => {
    out[repeatFieldId('directors', ids[i]!, 'firstName')] = first;
    out[repeatFieldId('directors', ids[i]!, 'lastName')] = last;
  });
  return out;
};

describe('record watches', () => {
  it('watches the registered office, the auditor and the directors', () => {
    expect(RECORD_WATCHES.map((w) => w.itemId).sort()).toEqual(['post-11', 'post-2', 'pre-14', 'pre-15']);
    expect(watchesForItem('pre-1')).toEqual([]);
  });

  it('reads the directors from the repeat group', () => {
    const [watch] = watchesForItem('pre-15');
    const read = watch!.read(directors(['Asha', 'Rao'], ['Vikram', 'Shah']));
    expect(read).toEqual(['Asha Rao', 'Vikram Shah']);
  });
});

describe('changesFor', () => {
  it('ignores a first answer and an unchanged value', () => {
    expect(changesFor('pre-14:address', '', '12 MG Road, Bengaluru')).toEqual([]);
    expect(changesFor('pre-14:address', '12 MG Road', '12  mg road')).toEqual([]);
    expect(changesFor('pre-15:directors', [], ['Asha Rao'])).toEqual([]);
  });

  it('proposes a registered office change with the new and old address', () => {
    const [c] = changesFor('post-11:address', '12 MG Road', '4 Park Street, Kolkata');
    expect(c).toMatchObject({ kind: 'registered_office_changed', details: { address: '4 Park Street, Kolkata', previous: '12 MG Road' } });
  });

  it('proposes an auditor appointment when the auditor changes', () => {
    expect(changesFor('post-2:auditor', 'A & Co', 'B & Co')[0]).toMatchObject({ kind: 'auditor_appointed', details: { person: 'B & Co' } });
  });

  it('does not propose when an address is cleared', () => {
    expect(changesFor('pre-14:address', '12 MG Road', '')).toEqual([]);
  });

  it('turns added and removed directors into appointments and resignations', () => {
    const out = changesFor('pre-15:directors', ['Asha Rao', 'Vikram Shah'], ['asha rao', 'Meera Iyer']);
    expect(out.map((c) => [c.kind, c.details.person])).toEqual([
      ['director_appointed', 'Meera Iyer'],
      ['director_resigned', 'Vikram Shah'],
    ]);
  });

  it('compares names in any order and any case', () => {
    expect(sameValue(['Asha Rao', 'Vikram Shah'], ['vikram shah', 'ASHA RAO'])).toBe(true);
    expect(sameValue(['Asha Rao'], ['Asha Rao', 'Meera Iyer'])).toBe(false);
  });
});
