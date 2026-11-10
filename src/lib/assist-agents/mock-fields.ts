/**
 * The mock SPICe+ Part A portal's field names. The extension's mock portal mirrors this list, and
 * `recipes/spice-a.json` builds every SOM path from it, so the two cannot drift apart. The live
 * portal's names are not known yet (the recipe says `verifiedAgainst: "mock"`).
 */
export const MOCK_SPICE_A_FIELD_NAMES = [
  'proposedName1',
  'proposedName2',
  'significance',
  'companyType',
  'companyClass',
  'companyCategory',
  'companySubCategory',
  'mainDivision',
  'trademarkSimilar',
] as const;
export type MockSpiceAFieldName = (typeof MOCK_SPICE_A_FIELD_NAMES)[number];

/** The mock's AEM root panel; every Part A field sits directly under it. */
export const MOCK_SPICE_A_ROOT = 'guide[0].guide1[0].guideRootPanel[0]';

/** The SOM path of one mock field, the convention the mock portal follows. */
export function mockSomPath(name: MockSpiceAFieldName): string {
  return `${MOCK_SPICE_A_ROOT}.${name}[0]`;
}

/**
 * The mock SPICe+ Part B portal (`extensions/vcfo-assist/mock-portal/spice-b.html`). Single fields
 * sit directly under the root panel, like Part A. Directors and subscribers are AEM repeatable
 * panels: instance `i` (0-based) of a group is `<root>.<group>[0].<item>[i]`, and its fields sit
 * under that. `recipes/spice-b.json` builds every SOM path from these lists.
 */
export const MOCK_SPICE_B_ROOT = MOCK_SPICE_A_ROOT;

export const MOCK_SPICE_B_FIELD_NAMES = [
  'authorisedCapital',
  'subscribedCapital',
  'equityShares',
  'faceValue',
  'officeLine1',
  'officeLine2',
  'officePincode',
  'officeCity',
  'officeDistrict',
  'officeState',
  'officeEmail',
  'officeMobile',
] as const;
export type MockSpiceBFieldName = (typeof MOCK_SPICE_B_FIELD_NAMES)[number];

export const MOCK_SPICE_B_GROUPS = {
  subscribers: {
    panel: 'subscribers',
    item: 'subscriber',
    fields: ['firstName', 'surName', 'fatherFirstName', 'dob', 'pan', 'email', 'mobile', 'shares'],
  },
  directors: {
    panel: 'directors',
    item: 'director',
    fields: ['firstName', 'surName', 'din', 'pan', 'dob', 'email', 'mobile', 'designation'],
  },
} as const;
export type MockSpiceBGroup = keyof typeof MOCK_SPICE_B_GROUPS;

/** How many blocks of each group the mock page shows. */
export const MOCK_SPICE_B_BLOCKS = 2;

export function mockSpiceBSomPath(name: MockSpiceBFieldName): string {
  return `${MOCK_SPICE_B_ROOT}.${name}[0]`;
}

/** The SOM path of one repeating field; `index` is a number, or `{i}` in a recipe template. */
export function mockSpiceBGroupSomPath<G extends MockSpiceBGroup>(group: G, field: (typeof MOCK_SPICE_B_GROUPS)[G]['fields'][number], index: number | '{i}'): string {
  const g = MOCK_SPICE_B_GROUPS[group];
  return `${MOCK_SPICE_B_ROOT}.${g.panel}[0].${g.item}[${index}].${field}[0]`;
}

/** The mock's `name` attribute of one repeating field: `director1Din` for director 1 (1-based). */
export function mockSpiceBGroupName<G extends MockSpiceBGroup>(group: G, field: (typeof MOCK_SPICE_B_GROUPS)[G]['fields'][number], n: number | '{n}'): string {
  return `${MOCK_SPICE_B_GROUPS[group].item}${n}${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}
