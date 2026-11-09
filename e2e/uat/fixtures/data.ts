/**
 * Test data for the user acceptance run. All of it is invented; the PAN, Aadhaar and DIN numbers
 * have the right shape but belong to nobody.
 */

export const TEAM = {
  admin: { name: 'Asha Admin', email: 'asha.admin@uat.vcfo.test' },
  manager: { name: 'Manoj Manager', email: 'manoj.manager@uat.vcfo.test' },
  lead: { name: 'Lata Lead', email: 'lata.lead@uat.vcfo.test' },
  lead2: { name: 'Leo Lead', email: 'leo.lead@uat.vcfo.test' },
  client: { name: 'Kiran Rao', email: 'kiran.rao@uat-client.test' },
  clientB: { name: 'Bina Shah', email: 'bina.shah@uat-client.test' },
} as const;

/** One password for every test login, long enough for the password rules. */
export const UAT_PASSWORD = 'Uat-Test-2026!secure';

/** Track A: the "real" client, a new private company being incorporated. */
export const TRACK_A = {
  company: 'Nilgiri Analytics Private Limited',
  short: 'Nilgiri Analytics',
  ownership: 'Independent',
  stage: 'Pre-Incorporation',
  nicCode: '62011',
  nicWords: 'computer program',
  authorisedCapital: 1000000,
  paidUpCapital: 100000,
  faceValue: 10,
  office: {
    line1: '4th Floor, 12 Residency Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pin: '560025',
  },
  directors: [
    {
      first: 'Kiran', last: 'Rao', father: 'Suresh Rao', dob: '1988-04-14', pan: 'ABCPR1234K', aadhaar: '234567890123',
      email: 'kiran.rao@uat-client.test', phone: '9845012345', shares: 6000,
      address: '22 Lavelle Road, Bengaluru, Karnataka 560001',
    },
    {
      first: 'Meera', last: 'Iyer', father: 'Ramesh Iyer', dob: '1990-09-02', pan: 'BCDPI5678L', aadhaar: '345678901234',
      email: 'meera.iyer@uat-client.test', phone: '9845067890', shares: 4000,
      address: '7 Cunningham Road, Bengaluru, Karnataka 560052',
    },
  ],
} as const;

/** Track B: the sandbox, already incorporated on 1 Aug 2026, for post-incorporation work. */
export const TRACK_B = {
  company: 'Kaveri Foods Private Limited',
  short: 'Kaveri Foods',
  ownership: 'Independent',
  cin: 'U15400KA2026PTC123456',
  incorporatedOn: '2026-08-01',
  pan: 'AAKCK1234F',
  tan: 'BLRK12345F',
  office: { line1: '18 Industrial Area, Peenya', city: 'Bengaluru', state: 'Karnataka', pin: '560058' },
} as const;

/** Twelve employees for labour registers and payroll (October 2026, 26 working days). */
export const EMPLOYEES = [
  ['E001', 'Arjun Kumar', 'M', '1992-01-10', '2026-08-05', 'Production Supervisor', 32000],
  ['E002', 'Divya Nair', 'F', '1995-03-22', '2026-08-05', 'Quality Analyst', 28000],
  ['E003', 'Ravi Teja', 'M', '1990-07-01', '2026-08-10', 'Machine Operator', 18000],
  ['E004', 'Sunita Devi', 'F', '1993-11-15', '2026-08-10', 'Packer', 15000],
  ['E005', 'Mohammed Irfan', 'M', '1991-05-30', '2026-08-12', 'Machine Operator', 18000],
  ['E006', 'Lakshmi Prasad', 'F', '1996-02-18', '2026-08-15', 'Store Keeper', 20000],
  ['E007', 'Vikram Singh', 'M', '1989-09-09', '2026-08-15', 'Driver', 17000],
  ['E008', 'Pooja Hegde', 'F', '1998-12-01', '2026-08-20', 'Accounts Assistant', 22000],
  ['E009', 'Naveen Gowda', 'M', '1994-06-25', '2026-08-20', 'Helper', 14000],
  ['E010', 'Shabana Begum', 'F', '1997-04-04', '2026-09-01', 'Packer', 15000],
  ['E011', 'Rahul Menon', 'M', '1987-08-17', '2026-09-01', 'Maintenance Technician', 24000],
  ['E012', 'Kavya Reddy', 'F', '1999-10-30', '2026-09-15', 'HR Executive', 26000],
] as const;

/** Days present out of 26 in October 2026, by employee code. */
export const DAYS_PRESENT: Record<string, number> = {
  E001: 26, E002: 25, E003: 24, E004: 26, E005: 22, E006: 26, E007: 23, E008: 26, E009: 20, E010: 26, E011: 25, E012: 26,
};
export const WORKING_DAYS = 26;
