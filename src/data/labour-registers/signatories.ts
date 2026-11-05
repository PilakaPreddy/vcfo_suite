import type { FormSpec } from './types';

/**
 * LABOUR REGISTERS — who signs the printed register.
 *
 * A register that nobody has signed is a spreadsheet. The whole reason the product produces a
 * PDF as well as a workbook is that the attested version is a printout somebody signs by hand,
 * seals, and files; the workbook is the working copy.
 *
 * Who signs is not uniform, and getting it wrong is the kind of error that is only found when
 * an inspector asks. The common case is the employer or a manager authorised by the employer.
 * The exceptions found in the research pass:
 *
 *  - **Punjab rule 5**, which Haryana follows, calls for the employer's signature *and* the
 *    inspector's. A Haryana register with one signature block has nowhere for the inspector to
 *    sign, which is a form that cannot be completed.
 *  - **Inspection books and visit records** carry the inspector's signature, not the
 *    employer's, because the entry is the inspector's own.
 *  - **Wage registers under the Code on Wages** carry the employer's and the employee's, the
 *    second being the acknowledgement of payment — which the form's own `sig()` column already
 *    provides per row, so no block is added for it.
 *
 * Every one of these is a reading of the rules, not a gazette-confirmed fact, and the research
 * pass of November 2026 could not open a primary source. So a block is printed with a label and
 * a rule, never with a claim that it is complete; and the layout-verification screen is where a
 * firm records that it has checked one.
 */

export interface SignatureBlock {
  /** What goes under the line: "Employer or authorised manager". */
  label: string;
  /** The rule the requirement is read from, printed small beneath. Empty where it is general. */
  note: string;
}

const EMPLOYER: SignatureBlock = {
  label: 'Employer or manager authorised by the employer',
  note: 'Signature, name, designation and the establishment seal',
};

const INSPECTOR: SignatureBlock = {
  label: 'Inspector',
  note: 'Signature and date of inspection',
};

/**
 * The states whose rules call for the inspector to sign the register as well.
 *
 * Haryana has no shops rules of its own: the Punjab Shops and Commercial Establishments Act
 * 1958 and its rules apply, and rule 5 provides for both signatures. Punjab itself is not in
 * the catalogue yet; it is listed so that adding it does not repeat the research.
 */
const INSPECTOR_SIGNS = new Set(['HR', 'PB']);

/** Forms that are the inspector's own record rather than the employer's. */
const INSPECTOR_ONLY = /inspection|visit(s)? (book|record)/i;

/** Who must sign this form's printout, in the order the blocks are printed. */
export function signatoriesFor(form: FormSpec): SignatureBlock[] {
  if (INSPECTOR_ONLY.test(form.title)) return [INSPECTOR];
  if (INSPECTOR_SIGNS.has(form.jurisdiction)) return [EMPLOYER, INSPECTOR];
  return [EMPLOYER];
}

/**
 * A line printed above the blocks, where there is something specific to say.
 *
 * Only where a state's rule is the reason for a second block. Printing "signed as the rules
 * require" under every form would be noise, and under a form nobody has checked it would be a
 * claim the product cannot make.
 */
export function signatureNote(form: FormSpec): string {
  if (INSPECTOR_SIGNS.has(form.jurisdiction)) {
    return 'Rule 5 of the Punjab Shops and Commercial Establishments Rules, which apply in Haryana, provides for the inspector’s signature as well as the employer’s.';
  }
  return '';
}
