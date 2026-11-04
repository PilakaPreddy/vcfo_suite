import { describe, expect, it } from 'vitest';
import { isoOfLocal, localDateOf, parseDateText } from './date-text';

describe('parseDateText', () => {
  it.each([
    ['02-Nov-26', '2026-11-02'],
    ['2 Nov 2026', '2026-11-02'],
    ['2 november, 2026', '2026-11-02'],
    ["2 Nov '26", '2026-11-02'],
    ['02/11/2026', '2026-11-02'],
    ['2/11/26', '2026-11-02'],
    ['02.11.2026', '2026-11-02'],
    ['2026-11-02', '2026-11-02'],
  ])('reads %s day first', (text, iso) => expect(parseDateText(text)).toBe(iso));

  it.each(['', 'soon', '31-Feb-26', '13/13/2026', '2026-02-30', '1 Foo 2026'])('rejects %s', (text) => expect(parseDateText(text)).toBeNull());
});

describe('calendar dates', () => {
  it('round-trips a local date', () => {
    expect(isoOfLocal(localDateOf('2026-03-09')!)).toBe('2026-03-09');
    expect(localDateOf('nope')).toBeUndefined();
  });
});
