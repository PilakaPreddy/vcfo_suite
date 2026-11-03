/**
 * LABOUR REGISTERS — the shapes the catalogue is written in.
 *
 * A register is a dated rendering of one canonical dataset, never a bespoke document. The
 * catalogue therefore describes forms, and the generator projects the dataset through them.
 *
 * Two findings from the November 2026 research shape these types, and both are recorded in
 * `docs/context/notes/labour-registers.md`:
 *
 *  1. A form number is not an identity. Form XXII is the Register of Employment in Telangana,
 *     the Register of Advances under the central Contract Labour rules, and the register of
 *     hours of work in Goa. Every form is therefore keyed on jurisdiction, act, rule, number
 *     and title together, and `FormSpec.id` is the only safe handle.
 *  2. The four labour codes commenced on 21 November 2025 and the central rules under all four
 *     were notified on 8 May 2026, while Telangana, Karnataka, Kerala and Haryana have not
 *     notified final state rules. A client in those states is on a hybrid regime, so a form
 *     carries the window in which it applies and the catalogue is always read for a date.
 *
 * Nothing here was verified against the gazette: the research ran without access to
 * indiacode.nic.in or labour.gov.in. `FormSpec.verification` records that honestly, and the
 * generator prints it on the document rather than implying an authority we have not checked.
 */

/**
 * A state or union territory, by its ISO 3166-2:IN subdivision code without the `IN-` prefix.
 *
 * Every subdivision the map draws is here, whether or not its forms are configured. They used
 * to be eleven, which made the picker say "7 other states and union territories" when the map
 * beside it drew thirty-five — an undercount of twenty-four, and in the data rather than the
 * copy. `JK` covers Jammu and Kashmir and Ladakh together, because the 2019 division is not in
 * the licensed geometry and inventing that boundary is the thing not to do.
 */
export type StateCode =
  | 'TG' | 'KA' | 'KL' | 'HR' | 'MH' | 'TN' | 'DL' | 'GJ' | 'UP' | 'WB' | 'AP'
  | 'AN' | 'AR' | 'AS' | 'BR' | 'CH' | 'CG' | 'DH' | 'GA' | 'HP' | 'JK' | 'JH'
  | 'LD' | 'MP' | 'MN' | 'ML' | 'MZ' | 'NL' | 'OD' | 'PY' | 'PB' | 'RJ' | 'SK'
  | 'TR' | 'UK';

/**
 * Which body of law a form belongs to. `state` forms are prescribed by a state's own rules,
 * most often under its Shops and Establishments Act; `central-legacy` forms come from the
 * pre-code central Acts and their rules, the 2017 Ease of Compliance forms included; and
 * `central-code` forms are prescribed by the rules notified under the four labour codes.
 */
export type Regime = 'state' | 'central-legacy' | 'central-code';

/**
 * The seven shapes every register in the catalogue reduces to. One renderer serves each, which
 * is why 41 forms across four states do not need 41 writers.
 *
 *  - `musterRoll`     — an identity block then one column per day of the period.
 *  - `wages`          — one row per employee, earnings and deductions across the columns.
 *  - `combinedWages`  — a muster roll and a wage register in one sheet (Karnataka Form T).
 *  - `leave`          — leave earned, availed and carried, usually per calendar year.
 *  - `employment`     — who is employed, with hours, shift and rest interval.
 *  - `wageSlip`       — one small document per employee rather than one row.
 *  - `periodicReturn` — aggregates for a quarter, half year or year, not a row per employee.
 */
export type FormArchetype =
  | 'musterRoll'
  | 'wages'
  | 'combinedWages'
  | 'leave'
  | 'employment'
  | 'wageSlip'
  | 'periodicReturn';

/** How often a form falls due. `perpetual` is kept open and amended rather than filed. */
export type PeriodKind = 'monthly' | 'quarterly' | 'halfYearly' | 'annual' | 'perpetual';

/**
 * Where a column's value comes from. The distinction drives the reconciliation screen: only
 * `input` columns are ever asked of a project lead.
 *
 *  - `input`     — a column of an uploaded sheet, matched by the mapper.
 *  - `master`    — the client or employee record (address, registration number, shift timings).
 *  - `derived`   — computed from other values (age from date of birth, overtime wages).
 *  - `grid`      — the per-day attendance block, mapped once as a group.
 *  - `signature` — left blank for a wet signature on the printed copy.
 */
export type ColumnSource = 'input' | 'master' | 'derived' | 'grid' | 'signature';

/** One column of a form, in the order the prescribed sheet prints it. */
export interface FormColumn {
  /** The canonical dataset field this column renders. See `FIELDS` in `fields.ts`. */
  field: string;
  /** The heading the prescribed form uses, verbatim, including its capitalisation. */
  heading: string;
  source: ColumnSource;
  /** The column number the form itself prints under the heading, where it numbers them. */
  ordinal?: number;
  /** A note for the preparer, printed nowhere. */
  note?: string;
}

/**
 * How far a form has been checked against the source of truth. Every form starts
 * `unverified`, because the research behind this catalogue could not open a gazette PDF or a
 * state labour department form. The generator prints this state on the document, so nobody
 * mistakes an unverified layout for a filed one.
 */
export interface FormVerification {
  status: 'unverified' | 'checked-against-sample' | 'gazette-verified';
  /** ISO date the check was made, when one was. */
  on?: string;
  /** What it was checked against: a filed client workbook, a gazette reference, a form PDF. */
  against?: string;
  /** What is still unresolved — signatory, seal, page initialling, column order. */
  open?: string[];
}

/** One prescribed register or return. */
export interface FormSpec {
  /**
   * The catalogue handle, `<jurisdiction>-<act>-<form>`, for example `tg-se-xxiii` or
   * `in-wages-iv`. It is stable; the form number is not, so nothing keys on the number.
   */
  id: string;
  jurisdiction: StateCode | 'IN';
  regime: Regime;
  /** The Act, as it is cited on the form. */
  act: string;
  /** The rule that prescribes the form, as it is cited on the form. */
  rule: string;
  /** The form's number as printed, without the word "Form". */
  formNumber: string;
  /** The form's own title. */
  title: string;
  archetype: FormArchetype;
  period: PeriodKind;
  columns: FormColumn[];
  /**
   * The window in which this form is the right one to produce, as ISO dates. A form with no
   * `from` has always applied; a form with a `to` was superseded or repealed on that date.
   * Form D under the Equal Remuneration Act carries `to: '2025-11-20'`, because the Act was
   * repealed by section 69(1) of the Code on Wages with effect from 21 November 2025.
   */
  effective: { from?: string; to?: string };
  /**
   * Another form whose maintenance is deemed to satisfy this one. Rule 72(3) of the
   * Occupational Safety, Health and Working Conditions (Central) Rules reportedly deems the
   * Code on Wages registers to satisfy the OSH registers, so the generator can emit one sheet
   * instead of two near-identical ones.
   */
  deemedSatisfiedBy?: string;
  /** How many years the register must be preserved after the period it covers. */
  retentionYears: number;
  verification: FormVerification;
  /** Free text printed as the form's authority line, above the table. */
  authorityLine: string;
}

/** A jurisdiction we can generate for, and how settled its law currently is. */
export interface StateSpec {
  code: StateCode;
  name: string;
  /** The zone the state picker groups it under. */
  zone: 'North' | 'South' | 'East' | 'West' | 'Central' | 'North East';
  /**
   * Whether the state has notified final rules under the four labour codes. As at 28 October
   * 2026 the research found final rules in Gujarat, Andhra Pradesh and Uttar Pradesh only;
   * Karnataka was at a January 2026 draft, Telangana and Haryana at May 2026 drafts, and
   * Kerala had nothing newer than a December 2021 draft. Trackers disagreed on Telangana and
   * Haryana, so this field is a product input, not a legal opinion.
   */
  codeRules: 'notified' | 'draft' | 'none';
  /** ISO date the state's rules were notified, when they have been. */
  codeRulesOn?: string;
  /** False until a form of this state has been checked against its own prescribed PDF. */
  configured: boolean;
}
