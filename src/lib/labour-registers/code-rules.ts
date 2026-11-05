import { codeRule, LABOUR_CODES, type LabourCode, type RuleStage } from '@/data/labour-registers/code-rules';

/**
 * LABOUR REGISTERS — the firm's reading of a state's position, over the catalogue's.
 *
 * Same shape as `verification.ts` and for the same reason: the catalogue's figures are a
 * research pass's reading of secondary trackers, changed only by a deploy, and what they
 * describe moves whenever a state publishes a notification. A row in
 * `labour_register_code_rules` overrides one state and one code; no row means the catalogue's
 * reading stands.
 *
 * One difference from a form's verdict, and it drives the whole screen: this is a fact about a
 * state on a date, not a property of the law. So `lastVerified` is carried everywhere and is
 * printed, and a cell nobody has looked at reads `unknown` rather than `none`. "We looked and
 * there are no rules" and "nobody looked" are different answers, and only one of them is a
 * reason to stop worrying.
 */

export type ResolvedStage = RuleStage | 'unknown';

export interface ResolvedCodeRule {
  state: string;
  code: LabourCode;
  title: string;
  short: string;
  stage: ResolvedStage;
  on: string;
  source: string;
  lastVerified: string;
  note: string;
  /** True when a firm entry governs rather than the catalogue's reading. */
  fromFirm: boolean;
}

/** The subset of a stored row this module needs. Keeps the seam out of the domain. */
export interface CodeRuleRecord {
  stateCode: string;
  code: string;
  stage: string;
  notifiedOn: string;
  source: string;
  note: string;
  verifiedAt: Date | string;
}

const STAGES = new Set<RuleStage>(['notified', 'draft', 'none']);

export function codeRuleIndex(rows: CodeRuleRecord[]): Map<string, CodeRuleRecord> {
  return new Map(rows.map((row) => [`${row.stateCode}:${row.code}`, row]));
}

/** One state's four codes, firm entries winning over the catalogue's reading. */
export function resolveCodeRules(
  state: string,
  index?: Map<string, CodeRuleRecord>,
): ResolvedCodeRule[] {
  return LABOUR_CODES.map(({ key, title, short }) => {
    const row = index?.get(`${state}:${key}`);
    if (row) {
      const at = row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : String(row.verifiedAt);
      return {
        state,
        code: key,
        title,
        short,
        stage: STAGES.has(row.stage as RuleStage) ? (row.stage as RuleStage) : 'none',
        on: row.notifiedOn,
        source: row.source || 'Recorded by the firm',
        lastVerified: at.slice(0, 10),
        note: row.note,
        fromFirm: true,
      };
    }

    const known = codeRule(state, key);
    return {
      state,
      code: key,
      title,
      short,
      stage: known?.stage ?? 'unknown',
      on: known?.on ?? '',
      source: known?.source ?? 'Nobody has looked at this state under this code.',
      lastVerified: known?.lastVerified ?? '',
      note: '',
      fromFirm: false,
    };
  });
}

/**
 * Whether this state is on a split regime, for the two codes that govern registers.
 *
 * Only the Wage Code and the OSH Code are asked, because those are what the catalogue's
 * register-bearing forms sit under. An unknown counts as not notified: the safe reading of
 * "nobody has looked" is that the state's existing rules still govern, which is what section 6
 * of the General Clauses Act 1897 provides for anyway.
 */
export function hybridFrom(rules: ResolvedCodeRule[]): boolean {
  return rules.filter((r) => r.code === 'wages' || r.code === 'osh').some((r) => r.stage !== 'notified');
}

/** The oldest check across a state's four codes, so staleness is visible. */
export function oldestCheck(rules: ResolvedCodeRule[]): string {
  const dates = rules.map((r) => r.lastVerified).filter(Boolean);
  return dates.length ? dates.slice().sort()[0] : '';
}

/** One line a screen can print about a state's position, derived from the four cells. */
export function regimeLine(rules: ResolvedCodeRule[]): string {
  const governing = rules.filter((r) => r.code === 'wages' || r.code === 'osh');
  const notified = governing.filter((r) => r.stage === 'notified');

  if (notified.length === governing.length) {
    return 'This state has notified rules under both codes that govern registers, so its registers are the ones the codes prescribe.';
  }
  if (notified.length > 0) {
    const done = notified.map((r) => r.short).join(' and ');
    const left = governing.filter((r) => r.stage !== 'notified').map((r) => r.short).join(' and ');
    /* The split case, which one lumped value could not express at all: registers under the
       notified code follow the code, the rest stay on the state's existing rules. */
    return `This state has notified rules under the ${done} Code but not under the ${left} Code. Registers under the ${done} Code follow the code; the rest stay on the state's existing rules under section 6 of the General Clauses Act 1897.`;
  }
  const anyKnown = governing.some((r) => r.stage !== 'unknown');
  if (!anyKnown) {
    return 'Nobody has recorded where this state has got to under the codes. Its existing rules are assumed to govern registers until somebody checks, which is the safe reading but is not a checked one.';
  }
  return "This state has not notified its rules under the codes that govern registers. Under section 6 of the General Clauses Act 1897 its existing rules continue to govern registers and returns, to the extent they are in line with the codes, while the codes' own entitlements apply from commencement.";
}
