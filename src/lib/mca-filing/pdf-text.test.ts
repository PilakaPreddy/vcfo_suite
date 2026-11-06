// @vitest-environment node
import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { comparePdfText, dateVariants, flattenExpected, numberTokens, type ExpectedValue } from './pdf-compare';
import { compactText, extractPdfText, hashPdfText } from './pdf-text';
import type { AssistProfile } from '@/lib/assist-profile/types';

function makePdf(draw: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

const FORM_TEXT = [
  'SPICe+ Part B: Application for incorporation of ACME ROBOTICS PRIVATE LIMITED',
  'Director: Asha  Rao, DIN 01234567, date of birth 25-01-1990',
  'Authorised capital Rs 1,00,000.00 and PIN 560001',
];

describe('extractPdfText', () => {
  it('reads the page text and hashes it', async () => {
    const pdf = await makePdf((doc) => FORM_TEXT.forEach((line) => doc.text(line)));
    const out = await extractPdfText(pdf);
    expect(out.unreadable).toBe(false);
    expect(out.error).toBeNull();
    expect(out.pages).toBe(1);
    expect(out.text).toContain('ACME ROBOTICS');
    expect(out.textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same hash when only spacing and layout differ', async () => {
    const one = await extractPdfText(await makePdf((doc) => doc.text(FORM_TEXT.join(' '))));
    const two = await extractPdfText(await makePdf((doc) => FORM_TEXT.forEach((line) => doc.fontSize(9).text(line))));
    expect(one.textHash).toBe(two.textHash);
  });

  it('gives a different hash when a value changes', async () => {
    const one = await extractPdfText(await makePdf((doc) => doc.text(FORM_TEXT.join(' '))));
    const two = await extractPdfText(await makePdf((doc) => doc.text(FORM_TEXT.join(' ').replace('01234567', '01234568'))));
    expect(one.textHash).not.toBe(two.textHash);
  });

  it('reads filled form fields, so a changed value changes the hash', async () => {
    const withField = (value: string) =>
      makePdf((doc) => {
        doc.initForm();
        doc.text(FORM_TEXT.join(' '));
        doc.formText('din', 72, 300, 200, 20, { value });
      });
    const one = await extractPdfText(await withField('DIN-FIELD-11111111'));
    const two = await extractPdfText(await withField('DIN-FIELD-22222222'));
    expect(one.text).toContain('DIN-FIELD-11111111');
    expect(one.textHash).not.toBe(two.textHash);
  });

  it('reports an image-only PDF as unreadable with no hash', async () => {
    const pdf = await makePdf((doc) => {
      doc.rect(50, 50, 200, 200).fill('#333333');
    });
    expect(await extractPdfText(pdf)).toMatchObject({ unreadable: true, textHash: null, error: null });
  });

  it('reports a file that is not a PDF as unreadable, without throwing', async () => {
    const out = await extractPdfText(Buffer.from('%PDF-1.4 this is not really a pdf'));
    expect(out.unreadable).toBe(true);
    expect(out.textHash).toBeNull();
  });
});

describe('comparePdfText', () => {
  const expected: ExpectedValue[] = [
    { field: 'company.name', expected: 'Acme Robotics Private Limited or Acme Labs Private Limited', anyOf: ['Acme Robotics Private Limited', 'Acme Labs Private Limited'] },
    { field: 'director.1.name', expected: 'Asha Rao' },
    { field: 'director.1.din', expected: '01234567' },
    { field: 'director.1.dob', expected: '25/01/1990' },
    { field: 'capital', expected: '100000' },
    { field: 'office.pincode', expected: '560001' },
  ];

  it('finds values whatever the case, spacing, punctuation, grouping and date form', async () => {
    const pdf = await makePdf((doc) => FORM_TEXT.forEach((line) => doc.text(line)));
    const { text, unreadable } = await extractPdfText(pdf);
    expect(comparePdfText(text, unreadable, expected)).toEqual({ checked: 6, found: 6, missing: [], unreadable: false });
  });

  it('names what is missing', () => {
    const out = comparePdfText('Acme Robotics Private Limited, Asha Rao, 100000', false, expected);
    expect(out.checked).toBe(6);
    expect(out.found).toBe(3);
    expect(out.missing.map((m) => m.field)).toEqual(['director.1.din', 'director.1.dob', 'office.pincode']);
  });

  it('does not find a number inside a longer number', () => {
    expect(comparePdfText('Capital 100000', false, [{ field: 'x', expected: '1000' }]).missing).toHaveLength(1);
    expect(comparePdfText('Capital 1,000.00', false, [{ field: 'x', expected: '1000' }]).missing).toHaveLength(0);
  });

  it('never passes an unreadable PDF', async () => {
    const pdf = await makePdf((doc) => {
      doc.rect(10, 10, 100, 100).fill('#000000');
    });
    const { text, unreadable } = await extractPdfText(pdf);
    const out = comparePdfText(text, unreadable, expected);
    expect(out).toMatchObject({ unreadable: true, checked: 0, found: 0 });
    expect(out.missing).toHaveLength(expected.length);
  });
});

describe('normal forms', () => {
  it('compacts case, spaces and punctuation', () => {
    expect(compactText('  A.C.M.E  Robotics (P) Ltd. ')).toBe('acmeroboticspltd');
    expect(hashPdfText('Acme  Robotics')).toBe(hashPdfText('ACME-ROBOTICS'));
  });

  it('writes a date in its usual forms and refuses a non-date', () => {
    const forms = dateVariants('05/01/2026')!;
    expect(forms).toEqual(expect.arrayContaining(['05012026', '20260105', '05jan2026', '5january2026', 'jan052026']));
    expect(dateVariants('2026')).toBeNull();
    expect(dateVariants('01/13/2026')).toBeNull();
  });

  it('reads whole numbers from Indian and Western grouping', () => {
    expect([...numberTokens('1,00,000.50 and 2,500 and 007')]).toEqual(['100000', '2500', '7']);
  });
});

describe('flattenExpected', () => {
  const profile: AssistProfile = {
    mcaLogin: { userId: '' },
    company: { proposedNames: ['Acme Robotics Private Limited', 'Acme Labs Private Limited'], nicCode: '62011', capital: { authorized: 100000, subscribed: 100000 } },
    registeredOffice: { line1: '12 MG Road', pincode: '560001', city: 'Bengaluru', state: 'Karnataka' },
    directors: [{ id: 'd1', index: 1, firstName: 'Asha', surName: 'Rao', din: '01234567', pan: 'ABCDE1234F', dob: '25/01/1990', gender: 'Female' }],
    subscribers: [
      { index: 1, kind: 'individual', isDirector: false, firstName: 'Ravi', surName: 'Kumar', shares: { equity: { number: 5000 } } },
      { index: 2, kind: 'bodyCorporate', isDirector: false, name: 'Parent Inc', representative: { firstName: 'Asha', surName: 'Rao' } },
    ],
    agile: {},
    moa: {},
    aoa: {},
  };

  it('keeps Part A to the names and the activity', () => {
    const out = flattenExpected(profile, 'spice-part-a');
    expect(out.map((e) => e.field)).toEqual(['company.name', 'company.nicCode']);
    expect(out[0]!.anyOf).toHaveLength(2);
  });

  it('adds the office, capital and people for Part B, and no choice-list words', () => {
    const out = flattenExpected(profile, 'spice-part-b');
    const fields = out.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['office.line1', 'company.authorizedCapital', 'director.1.din', 'subscriber.1.shares', 'subscriber.2.name', 'subscriber.2.representative.name']));
    expect(out.map((e) => e.expected)).not.toContain('Female');
  });

  it('expects nothing Suite does not hold', () => {
    const out = flattenExpected({ ...profile, company: {}, registeredOffice: undefined, directors: [], subscribers: [] }, 'spice-part-b');
    expect(out).toEqual([]);
  });
});
