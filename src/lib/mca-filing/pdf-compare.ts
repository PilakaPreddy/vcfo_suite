import type { AssistProfile } from '@/lib/assist-profile/types';
import { compactText } from '@/lib/mca-filing/pdf-text';
import type { FilingForm } from '@/lib/mca-filing/filing-state';

/**
 * PDF COMPARE — pure. Does the text of the PDF the portal produced hold the values Suite expects?
 * Expected values come from the assist profile. Text values are compared without case, spacing or
 * punctuation; a digit-only value must be a whole number in the PDF, so 1000 is not found inside
 * 100000; a date is found in its usual written forms.
 *
 * `unreadable` means the PDF has no usable text: every value counts as not checked, and it is
 * never a pass. An empty `missing` with `unreadable: false` and `checked` above zero is the only
 * clean result.
 */

export interface ExpectedValue {
  field: string;
  expected: string;
  /** Any one of these is enough (the approved name is one of the proposed names). */
  anyOf?: string[];
}

export interface PdfCompareResult {
  checked: number;
  found: number;
  missing: Array<{ field: string; expected: string }>;
  unreadable: boolean;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const DIGITS = /^\d+$/;

/** The compact forms a DD/MM/YYYY date is printed in. */
export function dateVariants(value: string): string[] | null {
  const m = DATE.exec(value.trim());
  if (!m) return null;
  const day = m[1]!.padStart(2, '0');
  const mon = m[2]!.padStart(2, '0');
  const year = m[3]!;
  const name = MONTHS[Number(mon) - 1];
  if (!name) return null;
  const short = name.slice(0, 3);
  const bareDay = String(Number(day));
  return [
    `${day}${mon}${year}`,
    `${year}${mon}${day}`,
    `${day}${short}${year}`,
    `${bareDay}${short}${year}`,
    `${day}${name}${year}`,
    `${bareDay}${name}${year}`,
    `${short}${day}${year}`,
    `${short}${bareDay}${year}`,
    `${name}${day}${year}`,
    `${name}${bareDay}${year}`,
  ];
}

/** Whole numbers in the text; Indian and Western grouping and a decimal tail do not count. */
export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const whole = m[0].split('.')[0]!.replace(/,/g, '').replace(/^0+(?=\d)/, '');
    if (whole) out.add(whole);
  }
  return out;
}

function valueFound(value: string, compact: string, numbers: Set<string>): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const dates = dateVariants(trimmed);
  if (dates) return dates.some((d) => compact.includes(d));
  const plainNumber = trimmed.replace(/,/g, '');
  if (DIGITS.test(plainNumber)) return numbers.has(plainNumber.replace(/^0+(?=\d)/, ''));
  const c = compactText(trimmed);
  return c ? compact.includes(c) : true;
}

export function comparePdfText(text: string, unreadable: boolean, expected: ExpectedValue[]): PdfCompareResult {
  if (unreadable) {
    return { checked: 0, found: 0, missing: expected.map((e) => ({ field: e.field, expected: e.expected })), unreadable: true };
  }
  const compact = compactText(text);
  const numbers = numberTokens(text);
  const missing: PdfCompareResult['missing'] = [];
  for (const item of expected) {
    const options = item.anyOf?.length ? item.anyOf : [item.expected];
    if (!options.some((o) => valueFound(o, compact, numbers))) missing.push({ field: item.field, expected: item.expected });
  }
  return { checked: expected.length, found: expected.length - missing.length, missing, unreadable: false };
}

function add(out: ExpectedValue[], field: string, value: string | number | undefined | null): void {
  if (value === undefined || value === null) return;
  const text = String(value).trim();
  if (text) out.push({ field, expected: text });
}

/** A person's name as one value, and the facts printed about them. */
function addPerson(
  out: ExpectedValue[],
  prefix: string,
  p: { firstName?: string; middleName?: string; surName?: string; din?: string; pan?: string; dob?: string; email?: string; mobile?: string },
): void {
  add(out, `${prefix}.name`, [p.firstName, p.middleName, p.surName].filter((v) => v?.trim()).join(' '));
  add(out, `${prefix}.din`, p.din);
  add(out, `${prefix}.pan`, p.pan);
  add(out, `${prefix}.dob`, p.dob);
  add(out, `${prefix}.email`, p.email);
  add(out, `${prefix}.mobile`, p.mobile);
}

/**
 * The values to look for, flattened from the assist profile. Part A prints the names and the
 * activity; Part B also prints the office, the capital and the people. Choice-list words (gender,
 * occupation, class) are left out: the portal prints them in its own words, so they would only
 * raise false alarms. Nothing here is invented: a value Suite does not hold is not expected.
 */
export function flattenExpected(profile: AssistProfile, form: FilingForm): ExpectedValue[] {
  const out: ExpectedValue[] = [];
  const names = (profile.company.proposedNames ?? []).map((n) => n.trim()).filter(Boolean);
  if (names.length) out.push({ field: 'company.name', expected: names.join(' or '), anyOf: names });
  add(out, 'company.nicCode', profile.company.nicCode);
  if (form === 'spice-part-a') return out;

  add(out, 'company.authorizedCapital', profile.company.capital?.authorized);
  add(out, 'company.subscribedCapital', profile.company.capital?.subscribed);
  const office = profile.registeredOffice;
  if (office) {
    add(out, 'office.line1', office.line1);
    add(out, 'office.pincode', office.pincode);
    add(out, 'office.city', office.city);
    add(out, 'office.state', office.state);
    add(out, 'office.email', office.email);
  }
  profile.directors.forEach((d) => addPerson(out, `director.${d.index}`, d));
  profile.subscribers.forEach((s) => {
    const prefix = `subscriber.${s.index}`;
    if (s.kind === 'bodyCorporate') {
      add(out, `${prefix}.name`, s.name);
      add(out, `${prefix}.cin`, s.cin);
      if (s.representative) addPerson(out, `${prefix}.representative`, s.representative);
    } else {
      addPerson(out, prefix, s);
    }
    add(out, `${prefix}.shares`, s.shares?.equity?.number);
  });
  return out;
}
