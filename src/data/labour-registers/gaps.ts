import type { StateCode } from './types';

/**
 * LABOUR REGISTERS — the registers this product knows about and does not produce.
 *
 * A catalogue that lists only what it can make looks complete. This file is the other half:
 * the registers a November 2026 research pass named, whose prescribed layout nobody here has
 * seen, and which are therefore not in `forms.ts`.
 *
 * **Why they are not simply added with a guessed layout.** Four errors found in that research
 * pass shared one shape: a form number or a period absorbed from an adjacent central statute —
 * Haryana Form XIV from the Contract Labour Rules, Karnataka Form VII from the Minimum Wages
 * Karnataka Rules, an eight-year retention from section 128(5) of the Companies Act. Each was
 * plausible, each was wrong, and each would have produced a register carrying an authority line
 * citing a rule that does not govern the client. Adding six more on the same basis would
 * multiply exactly that error.
 *
 * So they are listed instead, with what is known and what is not, and the screen shows them
 * beside the forms that are built. A firm that knows the layout can record it; a firm that
 * does not at least knows what it is missing. An omission somebody can see is a different
 * thing from an omission nobody can.
 *
 * Tamil Nadu is deliberately absent from `states.ts` for the same reason and is listed here:
 * three conflicting form sets were found for it and none could be resolved.
 */

export interface RegisterGap {
  /** A stable handle, in the same shape as a form id, so one can replace the other. */
  id: string;
  jurisdiction: StateCode | 'IN';
  /** The Act or Rules the register sits under, as far as the research established it. */
  act: string;
  /** The form number, where one was found. Empty when even the number is unconfirmed. */
  formNumber: string;
  /** What the register is for, in the words the source used. */
  title: string;
  /** What is actually unknown. Specific, because this is the work somebody has to do. */
  unknown: string;
  /** Where the claim that this register exists came from. */
  source: string;
}

export const REGISTER_GAPS: RegisterGap[] = [
  {
    id: 'in-ss-xxii',
    jurisdiction: 'IN',
    act: 'Code on Social Security (Central) Rules',
    formNumber: 'XXII',
    title: 'Register of women employees',
    unknown:
      'The column layout, and whether the form number is XXII under the Social Security rules rather than under an adjacent set. The research reached only secondary trackers.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'in-ss-xxiii',
    jurisdiction: 'IN',
    act: 'Code on Social Security (Central) Rules',
    formNumber: 'XXIII',
    title: 'Register under the Social Security rules',
    unknown: 'What the register is for, and its column layout. Only the number was found.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'in-ss-xxvi',
    jurisdiction: 'IN',
    act: 'Code on Social Security (Central) Rules',
    formNumber: 'XXVI',
    title: 'Register under the Social Security rules',
    unknown: 'What the register is for, and its column layout. Only the number was found.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'ka-se-u',
    jurisdiction: 'KA',
    act: 'Karnataka Shops and Commercial Establishments Rules, 1963',
    formNumber: 'U',
    title: 'Register named in the Karnataka rules',
    unknown:
      'What Form U is for and what it prints. Karnataka Form T is in the catalogue and was read off a filed workbook; Form U was not, and the earlier Form VII error in this state was a number absorbed from the Minimum Wages Karnataka Rules.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'kl-se-e',
    jurisdiction: 'KL',
    act: 'Kerala Shops and Commercial Establishments Rules',
    formNumber: 'E',
    title: 'Register named in the Kerala rules',
    unknown: 'What the register is for and its column layout.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'kl-se-h',
    jurisdiction: 'KL',
    act: 'Kerala Shops and Commercial Establishments Rules',
    formNumber: 'H',
    title: 'Register named in the Kerala rules',
    unknown: 'What the register is for and its column layout.',
    source: 'Secondary compliance trackers, November 2026',
  },
  {
    id: 'tn-se-all',
    jurisdiction: 'TN',
    act: 'Tamil Nadu Shops and Establishments Act, 1947',
    formNumber: '',
    title: 'The whole Tamil Nadu set',
    unknown:
      'Which set applies. Three conflicting form sets were found and none could be resolved, so the state is not configured rather than configured wrongly.',
    source: 'Secondary compliance trackers, November 2026',
  },
];

/** The gaps that bear on one jurisdiction, central ones included. */
export function gapsFor(stateCode: string): RegisterGap[] {
  return REGISTER_GAPS.filter((g) => g.jurisdiction === stateCode || g.jurisdiction === 'IN');
}
