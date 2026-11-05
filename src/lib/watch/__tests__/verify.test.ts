import { describe, expect, it } from 'vitest';
import { datesIn, firstDateIn } from '../dates';
import { verifyRegSummary } from '../verify';

const SOURCE = `Notification No. 139/2026 dated 30 October 2026.
The due date for filing Form 112A is extended from 30th September, 2026 to 31.03.2027.
A penalty of Rs. 5,000 applies. The ceiling is 12.5 per cent from March 2027.`;

const good = {
  act: 'Form 112A rules, 2026',
  effectiveDate: '2026-10-30',
  oldDueDate: '2026-09-30',
  newDueDate: '2027-03-31',
  affects: 'Every person filing Form 112A',
  summary: 'Notification 139/2026 moves Form 112A to 31 March 2027. The penalty is Rs. 5,000 and the ceiling is 12.5 per cent from March 2027.',
  quote: 'The due date for filing Form 112A is extended from 30th September, 2026 to 31.03.2027.',
};

describe('datesIn', () => {
  it.each([
    ['dated 30 October 2026', '2026-10-30'],
    ['30th Oct, 2026', '2026-10-30'],
    ['October 30, 2026', '2026-10-30'],
    ['30.10.2026', '2026-10-30'],
    ['30/10/2026', '2026-10-30'],
    ['30-10-2026', '2026-10-30'],
    ['03-Nov-2026', '2026-11-03'],
    ['2026-10-30', '2026-10-30'],
    ['26.12.22', '2022-12-26'],
  ])('reads %s', (text, iso) => {
    expect(firstDateIn(text)).toBe(iso);
  });

  it('refuses an impossible date and keeps a month with no day', () => {
    expect(firstDateIn('31.02.2026')).toBeNull();
    expect(datesIn('from March 2027').months.has('2027-03')).toBe(true);
  });
});

describe('verifyRegSummary', () => {
  it('passes a summary whose dates, numbers and quote are all in the source', () => {
    expect(verifyRegSummary(good, SOURCE)).toEqual([]);
  });

  it('folds whitespace and PDF ligatures in the quote, and nothing else', () => {
    const pdf = SOURCE.replace('The due date for', 'The  due\n date  for').replace('filing', 'ﬁling');
    expect(verifyRegSummary(good, pdf)).toEqual([]);
    expect(verifyRegSummary({ ...good, quote: 'the due date for filing Form 112A' }, SOURCE).map((p) => p.field)).toEqual(['quote']);
  });

  it('flags a due date that is not in the source', () => {
    const problems = verifyRegSummary({ ...good, newDueDate: '2027-04-30' }, SOURCE);
    expect(problems).toEqual([expect.objectContaining({ field: 'newDueDate', value: '2027-04-30' })]);
  });

  it('flags a changed amount or an invented date in the summary text', () => {
    const amount = verifyRegSummary({ ...good, summary: 'The penalty is Rs. 50,000.' }, SOURCE);
    expect(amount.map((p) => p.value)).toEqual(['50000']);
    const date = verifyRegSummary({ ...good, summary: 'Applies from 1 April 2027.' }, SOURCE);
    expect(date.map((p) => p.value)).toContain('2027-04-01');
  });

  it('flags a month that never appears and a number in who it affects', () => {
    const problems = verifyRegSummary({ ...good, summary: 'From June 2027.', affects: 'Firms with 20 staff' }, SOURCE);
    expect(problems.map((p) => p.value).sort()).toEqual(['20', '2027-06']);
  });

  it('treats 05 and 5 as the same number and flags an amount that is not there', () => {
    expect(verifyRegSummary({ ...good, summary: 'Form 112A, 05 days.' }, 'Form 112A within 5 days. ' + SOURCE)).toEqual([]);
    expect(verifyRegSummary({ ...good, summary: 'A fine of 8 lakh.' }, 'A fine of 7,00,000. ' + SOURCE).map((p) => p.value)).toEqual(['8']);
  });
});
