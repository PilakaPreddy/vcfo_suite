/**
 * LABOUR REGISTERS — the jurisdictions.
 *
 * Four states are configured because four states' filed workbooks were available to check the
 * forms against. **Every other subdivision the map draws is listed too**, so the picker can say
 * "not configured yet" rather than pretend India has four states, and so adding one is a data
 * change. The list and `india-outline.ts` must stay the same length: when they were eleven and
 * thirty-five, the picker said "7 other states" beside a map of thirty-five.
 *
 * Where each state has got to under the four codes is **not** in this file. It used to be, as
 * one value per state, which could not be true of a state at all: the codes were commenced
 * together and are being notified separately. It lives in `code-rules.ts`, one row per state
 * and code, each carrying where it was read and when somebody last looked — and a firm entry
 * in `labour_register_code_rules` overrides it without a deploy.
 */
import { regimeLine, resolveCodeRules } from '@/lib/labour-registers/code-rules';
import type { StateSpec } from './types';

const STATES: StateSpec[] = [
  {
    code: 'TG',
    name: 'Telangana',
    zone: 'South',
    configured: true,
  },
  {
    code: 'KA',
    name: 'Karnataka',
    zone: 'South',
    configured: true,
  },
  {
    code: 'KL',
    name: 'Kerala',
    zone: 'South',
    configured: true,
  },
  {
    code: 'HR',
    name: 'Haryana',
    zone: 'North',
    configured: true,
  },
  /* Not configured. Listed so the picker can show them as unavailable, with Gujarat, Andhra
     Pradesh and Uttar Pradesh marked as having notified rules because that is the thing a
     preparer most needs to know before the forms exist. */
  { code: 'GJ', name: 'Gujarat', zone: 'West', configured: false },
  { code: 'AP', name: 'Andhra Pradesh', zone: 'South', configured: false },
  { code: 'UP', name: 'Uttar Pradesh', zone: 'North', configured: false },
  { code: 'MH', name: 'Maharashtra', zone: 'West', configured: false },
  { code: 'TN', name: 'Tamil Nadu', zone: 'South', configured: false },
  { code: 'DL', name: 'Delhi', zone: 'North', configured: false },
  { code: 'WB', name: 'West Bengal', zone: 'East', configured: false },
  /* The remaining subdivisions, so the list and the map agree. They have no rows in
     `code-rules.ts`, which reads as unknown rather than as none — "we looked and there are no
     rules" and "nobody looked" are different answers, and only one is a reason to stop
     worrying. */
  { code: 'AN', name: 'Andaman and Nicobar Islands', zone: 'South', configured: false },
  { code: 'AR', name: 'Arunachal Pradesh', zone: 'North East', configured: false },
  { code: 'AS', name: 'Assam', zone: 'North East', configured: false },
  { code: 'BR', name: 'Bihar', zone: 'East', configured: false },
  { code: 'CH', name: 'Chandigarh', zone: 'North', configured: false },
  { code: 'CG', name: 'Chhattisgarh', zone: 'Central', configured: false },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', zone: 'West', configured: false },
  { code: 'GA', name: 'Goa', zone: 'West', configured: false },
  { code: 'HP', name: 'Himachal Pradesh', zone: 'North', configured: false },
  { code: 'JK', name: 'Jammu and Kashmir and Ladakh', zone: 'North', configured: false },
  { code: 'JH', name: 'Jharkhand', zone: 'East', configured: false },
  { code: 'LD', name: 'Lakshadweep', zone: 'South', configured: false },
  { code: 'MP', name: 'Madhya Pradesh', zone: 'Central', configured: false },
  { code: 'MN', name: 'Manipur', zone: 'North East', configured: false },
  { code: 'ML', name: 'Meghalaya', zone: 'North East', configured: false },
  { code: 'MZ', name: 'Mizoram', zone: 'North East', configured: false },
  { code: 'NL', name: 'Nagaland', zone: 'North East', configured: false },
  { code: 'OD', name: 'Odisha', zone: 'East', configured: false },
  { code: 'PY', name: 'Puducherry', zone: 'South', configured: false },
  { code: 'PB', name: 'Punjab', zone: 'North', configured: false },
  { code: 'RJ', name: 'Rajasthan', zone: 'North', configured: false },
  { code: 'SK', name: 'Sikkim', zone: 'North East', configured: false },
  { code: 'TR', name: 'Tripura', zone: 'North East', configured: false },
  { code: 'UK', name: 'Uttarakhand', zone: 'North', configured: false },
];

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

/** One state by its code. */
export function stateByCode(code: string): StateSpec | undefined {
  return BY_CODE.get(code as StateSpec['code']);
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
  /*
   * Read from the per-code tracker, not from one value per state. The four codes were
   * commenced together and are being implemented separately, so "this state has notified its
   * rules" was a sentence that could not be true of a state as a whole.
   */
  return regimeLine(resolveCodeRules(state.code));
}
