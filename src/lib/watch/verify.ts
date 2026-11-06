import { datesIn } from './dates';
import type { RegSummary, RegVerifyProblem } from './types';

/**
 * The code check on a summary. Every date and number the summary states must be in the source, and
 * the quote must be there word for word once whitespace is folded. A failure never sends anything:
 * the update waits with a person. Nothing here judges meaning; that is the reviewer's job.
 */
const NUMBER = /\d+(?:[.,]\d+)*/g;

const unzero = (digits: string): string => digits.replace(/^0+(?=\d)/, '');

function numbersIn(text: string, withParts: boolean): Set<string> {
  const found = new Set<string>();
  for (const token of text.match(NUMBER) ?? []) {
    found.add(unzero(token.replace(/,/g, '')));
    if (withParts) for (const part of token.split(/[.,]/)) found.add(unzero(part));
  }
  return found;
}

/** Unicode forms, typographic marks and whitespace only: ligatures and curly quotes fold, and no word can change. */
export function foldText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

type Checked = Pick<RegSummary, 'act' | 'effectiveDate' | 'oldDueDate' | 'newDueDate' | 'affects' | 'summary' | 'quote'>;

const DATE_FIELDS = ['effectiveDate', 'oldDueDate', 'newDueDate'] as const;
const TEXT_FIELDS = ['summary', 'affects', 'act'] as const;

export function verifyRegSummary(summary: Checked, sourceText: string): RegVerifyProblem[] {
  const problems: RegVerifyProblem[] = [];
  const source = foldText(sourceText);
  const sourceDates = datesIn(source);
  const sourceNumbers = numbersIn(source, true);

  for (const field of DATE_FIELDS) {
    const value = summary[field];
    if (value && !sourceDates.days.has(value)) {
      problems.push({ field, value, message: 'This date is not in the source.' });
    }
  }
  for (const field of TEXT_FIELDS) {
    const text = foldText(summary[field] ?? '');
    const found = datesIn(text);
    for (const day of found.days) {
      if (!sourceDates.days.has(day)) problems.push({ field, value: day, message: 'This date is not in the source.' });
    }
    for (const month of found.months) {
      if (!sourceDates.months.has(month)) problems.push({ field, value: month, message: 'This month is not in the source.' });
    }
    for (const number of numbersIn(found.rest, false)) {
      if (!sourceNumbers.has(number)) problems.push({ field, value: number, message: 'This number is not in the source.' });
    }
  }
  // A closing full stop added to a cut-off sentence changes no word of the source.
  if (!source.includes(foldText(summary.quote).replace(/[.;,:]$/, ''))) {
    problems.push({ field: 'quote', value: summary.quote.slice(0, 80), message: 'The quote is not word for word in the source.' });
  }
  return problems;
}
