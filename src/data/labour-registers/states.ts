/**
 * LABOUR REGISTERS — the jurisdictions.
 *
 * Four states are configured because four states' filed workbooks were available to check the
 * forms against. **Every other subdivision the map draws is listed too**, so the picker can say
 * "not configured yet" rather than pretend India has four states, and so adding one is a data
 * change. The list and `india-outline.ts` must stay the same length: when they were eleven and
 * thirty-five, the picker said "7 other states" beside a map of thirty-five.
 *
 * `codeRules` records whether a state has notified final rules under the four labour codes.
 * The research behind these values (28 October 2026) could not open a gazette, and trackers
 * disagreed on Telangana and Haryana, so treat the field as a product input that the firm
 * confirms, not as a legal position. It matters because a state at draft stage leaves its
 * clients on a hybrid regime: the central code registers apply, and the old state registers
 * have not been displaced.
 */
import type { StateSpec } from './types';

export const STATES: StateSpec[] = [
  {
    code: 'TG',
    name: 'Telangana',
    zone: 'South',
    codeRules: 'draft',
    codeRulesOn: '2026-05-01',
    configured: true,
  },
  {
    code: 'KA',
    name: 'Karnataka',
    zone: 'South',
    codeRules: 'draft',
    codeRulesOn: '2026-01-01',
    configured: true,
  },
  {
    code: 'KL',
    name: 'Kerala',
    zone: 'South',
    codeRules: 'none',
    configured: true,
  },
  {
    code: 'HR',
    name: 'Haryana',
    zone: 'North',
    codeRules: 'draft',
    codeRulesOn: '2026-05-01',
    configured: true,
  },
  /* Not configured. Listed so the picker can show them as unavailable, with Gujarat, Andhra
     Pradesh and Uttar Pradesh marked as having notified rules because that is the thing a
     preparer most needs to know before the forms exist. */
  { code: 'GJ', name: 'Gujarat', zone: 'West', codeRules: 'notified', configured: false },
  { code: 'AP', name: 'Andhra Pradesh', zone: 'South', codeRules: 'notified', configured: false },
  { code: 'UP', name: 'Uttar Pradesh', zone: 'North', codeRules: 'notified', configured: false },
  { code: 'MH', name: 'Maharashtra', zone: 'West', codeRules: 'draft', configured: false },
  { code: 'TN', name: 'Tamil Nadu', zone: 'South', codeRules: 'draft', configured: false },
  { code: 'DL', name: 'Delhi', zone: 'North', codeRules: 'draft', configured: false },
  { code: 'WB', name: 'West Bengal', zone: 'East', codeRules: 'none', configured: false },
  /* The remaining subdivisions, so the list and the map agree. `codeRules: 'none'` is the
     honest default rather than a claim: the research covered the states above and did not
     reach these. */
  { code: 'AN', name: 'Andaman and Nicobar Islands', zone: 'South', codeRules: 'none', configured: false },
  { code: 'AR', name: 'Arunachal Pradesh', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'AS', name: 'Assam', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'BR', name: 'Bihar', zone: 'East', codeRules: 'none', configured: false },
  { code: 'CH', name: 'Chandigarh', zone: 'North', codeRules: 'none', configured: false },
  { code: 'CG', name: 'Chhattisgarh', zone: 'Central', codeRules: 'none', configured: false },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', zone: 'West', codeRules: 'none', configured: false },
  { code: 'GA', name: 'Goa', zone: 'West', codeRules: 'none', configured: false },
  { code: 'HP', name: 'Himachal Pradesh', zone: 'North', codeRules: 'none', configured: false },
  { code: 'JK', name: 'Jammu and Kashmir and Ladakh', zone: 'North', codeRules: 'none', configured: false },
  { code: 'JH', name: 'Jharkhand', zone: 'East', codeRules: 'none', configured: false },
  { code: 'LD', name: 'Lakshadweep', zone: 'South', codeRules: 'none', configured: false },
  { code: 'MP', name: 'Madhya Pradesh', zone: 'Central', codeRules: 'none', configured: false },
  { code: 'MN', name: 'Manipur', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'ML', name: 'Meghalaya', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'MZ', name: 'Mizoram', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'NL', name: 'Nagaland', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'OD', name: 'Odisha', zone: 'East', codeRules: 'none', configured: false },
  { code: 'PY', name: 'Puducherry', zone: 'South', codeRules: 'none', configured: false },
  { code: 'PB', name: 'Punjab', zone: 'North', codeRules: 'none', configured: false },
  { code: 'RJ', name: 'Rajasthan', zone: 'North', codeRules: 'none', configured: false },
  { code: 'SK', name: 'Sikkim', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'TR', name: 'Tripura', zone: 'North East', codeRules: 'none', configured: false },
  { code: 'UK', name: 'Uttarakhand', zone: 'North', codeRules: 'none', configured: false },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

/** One state by its code. */
export function stateByCode(code: string): StateSpec | undefined {
  return BY_CODE.get(code as StateSpec['code']);
}

/** The states we can generate registers for today, in name order. */
export function configuredStates(): StateSpec[] {
  return STATES.filter((s) => s.configured).sort((a, b) => a.name.localeCompare(b.name));
}

/** Every state, configured first and then the rest, each group in name order. */
export function statesForPicker(): StateSpec[] {
  const by = (a: StateSpec, b: StateSpec) => a.name.localeCompare(b.name);
  return [...STATES.filter((s) => s.configured).sort(by), ...STATES.filter((s) => !s.configured).sort(by)];
}

/**
 * The sentence the register catalogue shows about a state's legal position. Written out here
 * rather than in a view, so the four screens that need it cannot drift apart.
 */
export function regimeNote(state: StateSpec): string {
  /*
   * The split is substance against procedure, not two parallel stacks of equal weight.
   *
   * The Ministry's own FAQs invoke section 6 of the General Clauses Act 1897: the old rules
   * stay in force until the state notifies new ones, "to the extent these are in line with the
   * Codes". So the Codes' entitlements — the wage definition, the fifty per cent rule, leave,
   * gratuity — apply everywhere from commencement, while registration, licences, registers,
   * returns and forms keep running on the state's existing rules until it replaces them.
   *
   * For this product that is the cleaner statement: registers follow the state, entitlements
   * follow the Code. Saying "both stacks apply" overstated it and implied a client in a
   * draft-stage state owes two sets of registers, which is not what the transition does.
   *
   * The FAQ is persuasive, not binding: it says so itself, and the Code prevails on a
   * conflict. The "to the extent in line with the Codes" clause is a live conflict rule with
   * at least one known edge — the OSH Code's own ten-worker registration threshold does not
   * automatically displace a state's existing registration procedure.
   */
  if (state.codeRules === 'notified') {
    return 'This state has notified its own rules under the labour codes, so its registers are the ones the codes prescribe.';
  }
  const stage = state.codeRules === 'draft' ? 'still at draft stage' : 'not been published';
  return `This state's rules under the labour codes have ${stage}. Under section 6 of the General Clauses Act 1897 its existing rules continue to govern registers and returns, to the extent they are in line with the codes, while the codes' own entitlements apply from commencement.`;
}
