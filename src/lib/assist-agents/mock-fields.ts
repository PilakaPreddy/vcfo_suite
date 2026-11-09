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
