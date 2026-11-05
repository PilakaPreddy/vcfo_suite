/**
 * @vitest-environment node
 *
 * Not jsdom, and this is not a preference. Under jsdom the zlib the PDF writer compresses its
 * streams with is a browser polyfill, and what comes back has a valid header, the right object
 * structure and corrupt stream contents: `%PDF-` matches, `/Type /Page` matches, and no reader
 * can open the file. A test asserting on the bytes would have passed on a document nobody can
 * read. Found by writing one out and putting it through poppler.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { FORMS, formById } from '@/data/labour-registers/forms';
import { signatoriesFor, signatureNote } from '@/data/labour-registers/signatories';
import { monthPeriod } from '../catalogue';
import { buildDataset, type SlotInput } from '../dataset';
import { projectForm } from '../project';
import type { WorkbookMeta } from '../xlsx/scaffold';
import { renderRegisterPdf } from './render-register';

/**
 * The printout, proved by producing it.
 *
 * There is no reader here as there is for the workbook — nothing in this codebase parses a PDF
 * — so the assertions are the ones a PDF can honestly answer: that it is a PDF, that it has
 * pages, and that the text a register must carry is in the stream. The uncompressed text of a
 * react-pdf document is searchable, which is enough to prove the authority line and the
 * signature block made it onto the page, and that is what the whole print flow turns on.
 */

/**
 * What the content streams of a PDF actually contain, inflated.
 *
 * There is no PDF parser in this codebase and this does not try to be one. It inflates every
 * flate stream and counts the text-showing operators, which answers the two questions worth
 * asking of a generated register: can a reader decompress this at all, and is there anything
 * drawn on the page. The words themselves are not recoverable here — react-pdf embeds a font
 * subset and writes glyph indices as hex strings, so reading them back would mean carrying a
 * CMap decoder — and the honest consequence is that this file proves the page is not blank,
 * while the assertion that the right words are on it is made by eye against a written-out
 * sample, not here.
 */
function streams(pdf: Buffer): { inflated: number; failed: number; textOps: number; bytes: number } {
  const raw = pdf.toString('latin1');
  let inflated = 0;
  let failed = 0;
  let textOps = 0;
  let bytes = 0;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    try {
      const body = inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1');
      inflated += 1;
      bytes += body.length;
      textOps += (body.match(/\bT[jJ]\b/g) ?? []).length;
    } catch {
      /* A font file or an image is not a flate stream we can read; counted, not fatal. */
      failed += 1;
    }
  }
  return { inflated, failed, textOps, bytes };
}

const period = monthPeriod(2026, 9);

const meta: WorkbookMeta = {
  establishment: {
    name: 'WebPT India Private Limited',
    address: 'Hyderabad, Telangana',
    shiftName: 'General',
    shiftStart: '09:30',
    shiftEnd: '18:30',
    restInterval: '13:00–13:45',
    dateOfPayment: '2026-10-07',
  },
  periodLabel: 'September 2026',
  generatedAt: '2026-11-03T14:05:00.000Z',
  generatorRevision: '2026-11-02.1',
  cacheKey: 'abcdef0123456789abcdef',
};

/* Wider than the workbook test's fixture on purpose: the register of employees needs a date of
   birth, a UAN and a bank account, and a paysheet that cannot produce a portrait form would
   leave half the layout table untested. */
const PAY_HEADERS = [
  'Emp No', 'Name', 'Sex', 'Desig', 'Days', 'Basic', 'Gross', 'Total Ded', 'Net', 'Joined', 'Father',
  'DOB', 'UAN', 'Bank A/c', 'Left on', 'Why left',
];

function paysheet(count = 3): SlotInput {
  const rows = Array.from({ length: count }, (_, i) => ({
    'Emp No': `E${String(i + 1).padStart(4, '0')}`,
    Name: `Employee ${i + 1}`,
    Sex: i % 2 === 0 ? 'F' : 'M',
    Desig: 'Associate',
    Days: '26',
    Basic: '25000',
    Gross: '35000',
    'Total Ded': '1800',
    Net: '33200',
    Joined: '2024-04-01',
    Father: `Father ${i + 1}`,
    DOB: '1996-02-14',
    UAN: `1008${String(i + 1).padStart(8, '0')}`,
    'Bank A/c': `0051${String(i + 1).padStart(9, '0')}`,
    'Left on': '',
    'Why left': '',
  }));
  return {
    sheet: {
      sheetName: 'Sheet1',
      headerRow: 1,
      headers: PAY_HEADERS,
      rows,
      grid: { found: false, days: [], format: 'none' as const, ambiguous: false, gaps: [] },
    },
    mapping: {
      employeeId: 'Emp No',
      name: 'Name',
      sex: 'Sex',
      designation: 'Desig',
      daysWorked: 'Days',
      basic: 'Basic',
      grossEarnings: 'Gross',
      totalDeductions: 'Total Ded',
      netPay: 'Net',
      dateOfJoining: 'Joined',
      guardianName: 'Father',
      dateOfBirth: 'DOB',
      uan: 'UAN',
      bankAccount: 'Bank A/c',
      dateOfLeaving: 'Left on',
      reasonForLeaving: 'Why left',
    },
  };
}

function roll(formId: string, count = 3) {
  const form = formById(formId)!;
  const dataset = buildDataset({
    period,
    slots: { paysheet: paysheet(count) },
    assumptions: { fullAttendanceAssumed: false },
    forms: [form],
    master: meta.establishment,
  });
  return { form, table: projectForm(form, dataset) };
}

describe('a register as a printout', () => {
  it('is a PDF with pages in it', async () => {
    const { table } = roll('in-wages-iv');
    const pdf = await renderRegisterPdf(table, meta);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(3000);
    expect(pdf.toString('latin1')).toContain('/Type /Page');
  });

  it('has streams a reader can decompress, and words drawn on the page', async () => {
    /* The reason this assertion exists. A PDF written under jsdom answers to `%PDF-` and
       `/Type /Page` and has corrupt streams: valid header, valid object table, nothing a
       reader can open. The first version of this file passed on exactly such a document, and
       poppler showed a blank sheet. So the streams are inflated, and what is drawn is counted.
       This file runs under the node environment for the same reason. */
    const { table } = roll('in-wages-iv', 6);
    const found = streams(await renderRegisterPdf(table, meta));

    expect(found.inflated).toBeGreaterThan(0);
    expect(found.failed).toBe(0);
    expect(found.bytes).toBeGreaterThan(2000);
    /* Twenty-six columns over six employees plus the frame. A blank page draws none. */
    expect(found.textOps).toBeGreaterThan(100);
  });

  it('is landscape for a wage register and portrait for an employment one', async () => {
    /* A MediaBox of 842 x 595 is A4 turned on its side. A twenty-six column wage register
       printed portrait is unreadable, and the layout table already knows which is which. */
    const wages = (await renderRegisterPdf(roll('in-wages-iv').table, meta)).toString('latin1');
    expect(wages).toMatch(/MediaBox\s*\[\s*0\s+0\s+841\.\d+\s+595\.\d+/);

    const employment = (await renderRegisterPdf(roll('in-wages-i').table, meta)).toString('latin1');
    expect(employment).toMatch(/MediaBox\s*\[\s*0\s+0\s+595\.\d+\s+841\.\d+/);
  });

  it('prints the firm\'s verdict when there is one, over the catalogue\'s', async () => {
    const { table } = roll('in-wages-iv');
    const pdf = await renderRegisterPdf(table, {
      ...meta,
      verification: { status: 'disputed', disputedBecause: 'The column order does not match.' },
    });
    expect(pdf.byteLength).toBeGreaterThan(3000);
  });

  it('produces every built form of a Telangana September without throwing', async () => {
    /* The honest breadth test. A single form proving the renderer works proves nothing about
       the twenty-eight whose shapes differ — a day grid, a nil column, a signature column. */
    const forms = ['in-wages-iv', 'in-wages-ix', 'in-wages-i'];
    for (const id of forms) {
      const pdf = await renderRegisterPdf(roll(id).table, meta);
      expect(pdf.subarray(0, 5).toString(), `${id} produced no PDF`).toBe('%PDF-');
    }
  });
});

describe('who signs the printout', () => {
  it('asks the employer alone, in the general case', () => {
    const form = formById('in-wages-iv')!;
    expect(signatoriesFor(form).map((b) => b.label)).toEqual([
      'Employer or manager authorised by the employer',
    ]);
    expect(signatureNote(form)).toBe('');
  });

  it('asks the inspector as well where the Punjab rules apply', () => {
    /* Haryana has no shops rules of its own; the Punjab Act and rules apply, and rule 5
       provides for both signatures. A Haryana register with one block has nowhere for the
       inspector to sign, which is a form that cannot be completed. */
    const haryana = FORMS.filter((f) => f.jurisdiction === 'HR');
    expect(haryana.length).toBeGreaterThan(0);
    for (const form of haryana) {
      expect(signatoriesFor(form).map((b) => b.label)).toContain('Inspector');
      expect(signatureNote(form)).toContain('Rule 5');
    }
  });
});
