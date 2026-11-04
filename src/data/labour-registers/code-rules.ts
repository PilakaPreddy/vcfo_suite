import type { StateCode } from './types';

/**
 * LABOUR REGISTERS — where each state has got to, code by code.
 *
 * `StateSpec.codeRules` carried one value for a whole state, and that is not how the
 * transition works. The four codes were commenced together but the states are notifying rules
 * under them separately, so a state can have final Wage Code rules and nothing at all under
 * the OSH Code. One lumped value answers the question wrongly in both directions: it tells a
 * client with notified wage rules that nothing has moved, or tells a client with nothing under
 * OSH that everything has.
 *
 * Which matters here because the answer decides which registers a client owes. The wage
 * registers follow the Wage Code's rules; the muster roll and the accident register follow the
 * OSH Code's. A state that has notified one and not the other is on a split regime, and that
 * is the ordinary case rather than an edge.
 *
 * **Every row is a product input, not a legal position.** The research pass of 28 October 2026
 * could not open a gazette: trackers disagreed on Telangana and Haryana, and nothing here has
 * been confirmed against a primary source. So each row carries where it came from and when it
 * was last looked at, and both are printed on the tracker screen. A firm that knows better
 * records it, which is what `labour_register_code_rules` is for.
 */

export const LABOUR_CODES = [
  { key: 'wages', title: 'Code on Wages, 2019', short: 'Wages' },
  { key: 'osh', title: 'Occupational Safety, Health and Working Conditions Code, 2020', short: 'OSH' },
  { key: 'socialSecurity', title: 'Code on Social Security, 2020', short: 'Social Security' },
  { key: 'relations', title: 'Industrial Relations Code, 2020', short: 'Industrial Relations' },
] as const;

export type LabourCode = (typeof LABOUR_CODES)[number]['key'];

/** How far a state has got under one code. */
export type RuleStage = 'notified' | 'draft' | 'none';

export interface CodeRuleRow {
  state: StateCode;
  code: LabourCode;
  stage: RuleStage;
  /** ISO date the rules were notified or the draft was published, where one was found. */
  on?: string;
  /** Where the claim came from. Never a gazette: none was reachable. */
  source: string;
  /** When somebody last looked. A tracker nobody dates is a tracker nobody trusts. */
  lastVerified: string;
}

const TRACKERS = 'Secondary compliance trackers, 28 October 2026';
const RESEARCH = 'Research pass, 4 November 2026';

/**
 * The four states the catalogue is configured for, plus the three found to have notified rules.
 *
 * A state and code with no row here is unknown rather than `none`, and the tracker says so.
 * Recording "no rules" for a state nobody checked would be a claim, and the distinction
 * between "we looked and there are none" and "nobody looked" is the only thing this file is
 * actually good for.
 */
export const CODE_RULES: CodeRuleRow[] = [
  /* The four configured states. Trackers disagreed on Telangana and Haryana, which is why both
     carry the disagreement in the source rather than a confident stage. */
  { state: 'TG', code: 'wages', stage: 'draft', on: '2026-05-01', source: `${TRACKERS} — trackers disagreed on whether these are final`, lastVerified: '2026-10-28' },
  { state: 'TG', code: 'osh', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'TG', code: 'socialSecurity', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'TG', code: 'relations', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },

  { state: 'KA', code: 'wages', stage: 'draft', on: '2026-01-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'KA', code: 'osh', stage: 'draft', on: '2026-01-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'KA', code: 'socialSecurity', stage: 'draft', on: '2026-01-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'KA', code: 'relations', stage: 'draft', on: '2026-01-01', source: TRACKERS, lastVerified: '2026-10-28' },

  { state: 'KL', code: 'wages', stage: 'none', source: `${TRACKERS} — nothing newer than a December 2021 draft`, lastVerified: '2026-10-28' },
  { state: 'KL', code: 'osh', stage: 'none', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'KL', code: 'socialSecurity', stage: 'none', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'KL', code: 'relations', stage: 'none', source: TRACKERS, lastVerified: '2026-10-28' },

  { state: 'HR', code: 'wages', stage: 'draft', on: '2026-05-01', source: `${TRACKERS} — trackers disagreed on whether these are final`, lastVerified: '2026-10-28' },
  { state: 'HR', code: 'osh', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'HR', code: 'socialSecurity', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },
  { state: 'HR', code: 'relations', stage: 'draft', on: '2026-05-01', source: TRACKERS, lastVerified: '2026-10-28' },

  /* Not configured, but the thing a preparer most needs to know before the forms exist. */
  { state: 'GJ', code: 'wages', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'GJ', code: 'osh', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'GJ', code: 'socialSecurity', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'GJ', code: 'relations', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },

  { state: 'AP', code: 'wages', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'AP', code: 'osh', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'AP', code: 'socialSecurity', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'AP', code: 'relations', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },

  { state: 'UP', code: 'wages', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'UP', code: 'osh', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'UP', code: 'socialSecurity', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
  { state: 'UP', code: 'relations', stage: 'notified', source: RESEARCH, lastVerified: '2026-11-04' },
];

/** One state's four rows, in code order, with the unknown ones named as unknown. */
export function codeRulesFor(state: string): Array<CodeRuleRow | { state: string; code: LabourCode; stage: 'unknown' }> {
  return LABOUR_CODES.map(
    ({ key }) =>
      CODE_RULES.find((r) => r.state === state && r.code === key) ?? { state, code: key, stage: 'unknown' as const },
  );
}

/** One cell of the tracker, or undefined where nobody has looked. */
export function codeRule(state: string, code: LabourCode): CodeRuleRow | undefined {
  return CODE_RULES.find((r) => r.state === state && r.code === code);
}

/**
 * Whether a state is on a split regime for the codes that govern registers.
 *
 * Only the Wage Code and the OSH Code are asked about, because those two are what the
 * catalogue's register-bearing forms sit under. A state that has notified both is on the codes'
 * registers; anything else leaves its existing rules governing registers under section 6 of the
 * General Clauses Act 1897, which is the hybrid position.
 */
export function isHybrid(state: string): boolean {
  return (['wages', 'osh'] as const).some((code) => codeRule(state, code)?.stage !== 'notified');
}

/** The oldest `lastVerified` across a state's rows — how stale the worst of it is. */
export function staleSince(state: string): string | null {
  const dates = CODE_RULES.filter((r) => r.state === state).map((r) => r.lastVerified);
  return dates.length ? dates.slice().sort()[0] : null;
}
