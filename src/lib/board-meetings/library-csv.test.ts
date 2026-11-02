import { describe, expect, it } from 'vitest';
import { libraryCsv, libraryRowsFromCsv, parseCsv } from './library-csv';

describe('agenda library CSV', () => {
  it('parses quoted fields with commas, quotes and line breaks', () => {
    expect(parseCsv('a,"b, c","d ""e""",\r\n"x\ny",z\n')).toEqual([
      ['a', 'b, c', 'd "e"', ''],
      ['x\ny', 'z'],
    ]);
  });

  it('round-trips the export and skips rows without an ID or wording', () => {
    const row = { id: 'BM-001', topic: 'Opening', scenario: 'Chair', wording: 'To elect the Chairperson, "if any"', law: 'SS-1', applicability: 'All', action: 'Noting', notes: '' };
    const text = libraryCsv([row]) + ',Topic only,,,,,,\r\n';
    const out = libraryRowsFromCsv(text);
    expect(out.rows).toEqual([row]);
    expect(out.skipped).toBe(1);
  });

  it('names the missing columns', () => {
    expect(libraryRowsFromCsv('Topic,Scenario\nA,B').missing).toEqual(['ID', 'Agenda wording']);
  });
});
