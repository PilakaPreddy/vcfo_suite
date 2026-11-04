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

const STATES: StateSpec[] = [
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
  if (state.codeRules === 'notified') {
    return 'State rules under the four labour codes are notified, so the code registers apply.';
  }
  if (state.codeRules === 'draft') {
    return 'State rules under the labour codes are still at draft stage, so both the central code registers and the existing state registers are produced for the same month.';
  }
  return 'No state rules under the labour codes have been notified, so both the central code registers and the existing state registers are produced for the same month.';
}
