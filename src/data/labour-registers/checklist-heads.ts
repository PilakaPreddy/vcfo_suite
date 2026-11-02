/**
 * LABOUR REGISTERS — the payroll checklist.
 *
 * A client's standing list of the pay heads and activities their payroll actually runs. It is
 * the firm's existing working document (SBC keeps one sheet per month per client, with
 * columns for the particular, who is responsible, and whether it applies in the regular cycle
 * and in the full-and-final cycle) turned into data.
 *
 * It earns its place by doing two jobs at once:
 *
 *  1. It is the monthly tick-off the project lead already does, so nothing new is asked of
 *     them.
 *  2. It decides which columns the reconciliation screen demands and which columns a register
 *     prints. A client who does not pay a night shift allowance is never asked to map one, and
 *     Form IV does not go out with an empty night shift column.
 *
 * The heads below are the ones the client's own checklist carries, plus the statutory heads
 * the registers need. `id` is referenced by `FormColumn.requiresHead`.
 */

/** Who normally supplies the head's figure. Printed on the checklist, not on any register. */
export type ChecklistOwner = 'client-hr' | 'client-finance' | 'sbc';

export interface ChecklistHead {
  id: string;
  label: string;
  /** What it is: an earning, a deduction, an input to attendance, or an activity to confirm. */
  kind: 'earning' | 'deduction' | 'attendance' | 'activity';
  owner: ChecklistOwner;
  /** Whether it normally applies in the full-and-final cycle as well as the regular one. */
  inFinalSettlement: boolean;
  /** The canonical dataset fields this head governs. */
  fields: string[];
  /** On by default for a new client, because almost every payroll runs it. */
  defaultOn: boolean;
  /** Why it matters to a register, where that is not obvious. */
  note?: string;
}

export const CHECKLIST_HEADS: ChecklistHead[] = [
  /* Attendance and days. */
  {
    id: 'attendance-lop',
    label: 'Attendance and loss of pay',
    kind: 'attendance',
    owner: 'client-hr',
    inFinalSettlement: true,
    fields: ['lossOfPayDays', 'daysWorked', 'workingDays'],
    defaultOn: true,
    note: 'Every muster roll and wage register needs it. Loss of pay from the paysheet overrides the daily grid, so a mid-month leaver is not overstated.',
  },
  {
    id: 'overtime',
    label: 'Overtime',
    kind: 'earning',
    owner: 'client-hr',
    inFinalSettlement: true,
    fields: ['overtimeHours', 'overtimeDates', 'overtimeWages'],
    defaultOn: true,
    note: 'Drives the overtime register and the overtime columns of the wage registers.',
  },

  /* Earnings. */
  { id: 'dearness-allowance', label: 'Dearness allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['dearnessAllowance'], defaultOn: false, note: 'Prescribed as its own column on most wage registers, so an establishment that folds it into basic should say so here.' },
  { id: 'night-shift-allowance', label: 'Night shift allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['nightShiftAllowance'], defaultOn: false },
  { id: 'conveyance-allowance', label: 'Conveyance or transport allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['conveyanceAllowance'], defaultOn: false },
  { id: 'food-allowance', label: 'Food allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['foodAllowance'], defaultOn: false },
  { id: 'medical-allowance', label: 'Medical allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['medicalAllowance'], defaultOn: false },
  { id: 'child-education-allowance', label: 'Child education and hostel allowance', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['childEducationAllowance'], defaultOn: false },
  { id: 'attendance-bonus', label: 'Attendance bonus', kind: 'earning', owner: 'client-hr', inFinalSettlement: false, fields: ['attendanceBonus'], defaultOn: false },
  { id: 'referral-bonus', label: 'Referral bonus', kind: 'earning', owner: 'client-hr', inFinalSettlement: false, fields: ['referralBonus'], defaultOn: false },
  { id: 'arrears', label: 'Arrears payment', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['arrears'], defaultOn: true },
  { id: 'leave-encashment', label: 'Leave encashment', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['leaveEncashment'], defaultOn: true },
  { id: 'notice-pay', label: 'Notice period pay or recovery', kind: 'earning', owner: 'client-hr', inFinalSettlement: true, fields: ['noticePay'], defaultOn: true },
  {
    id: 'maternity-benefit',
    label: 'Maternity benefit',
    kind: 'earning',
    owner: 'client-hr',
    inFinalSettlement: false,
    fields: ['maternityBenefit'],
    defaultOn: false,
    note: 'The integrated register and Karnataka Form T both carry a maternity benefit column.',
  },

  /* Deductions. */
  { id: 'vpf', label: 'Voluntary provident fund', kind: 'deduction', owner: 'client-hr', inFinalSettlement: true, fields: ['vpf'], defaultOn: false },
  {
    id: 'esi',
    label: 'Employee state insurance',
    kind: 'deduction',
    owner: 'client-finance',
    inFinalSettlement: true,
    fields: ['esi'],
    defaultOn: false,
    note: 'Often nil for an establishment whose wages are all above the ESI ceiling. Leaving it off keeps an empty statutory column out of the register.',
  },
  { id: 'lwf', label: 'Labour welfare fund', kind: 'deduction', owner: 'client-finance', inFinalSettlement: true, fields: ['labourWelfareFund'], defaultOn: false },
  { id: 'nps', label: 'National pension scheme', kind: 'deduction', owner: 'client-hr', inFinalSettlement: true, fields: ['npsDeduction'], defaultOn: false },
  { id: 'food-coupon', label: 'Food coupon deduction', kind: 'deduction', owner: 'client-finance', inFinalSettlement: true, fields: ['foodCouponDeduction'], defaultOn: false },
  { id: 'asset-deduction', label: 'Asset deduction', kind: 'deduction', owner: 'client-hr', inFinalSettlement: true, fields: ['assetDeduction'], defaultOn: false },
  { id: 'mediclaim', label: 'Medical claim deduction', kind: 'deduction', owner: 'client-finance', inFinalSettlement: true, fields: ['mediclaimDeduction'], defaultOn: false },
  {
    id: 'advances',
    label: 'Advances and loans',
    kind: 'deduction',
    owner: 'client-finance',
    inFinalSettlement: true,
    fields: ['advances'],
    defaultOn: false,
    note: 'Code on Wages Form IV carries the instalment recovery cap of half a wage period, so an establishment that recovers advances needs this on.',
  },
  {
    id: 'fines',
    label: 'Fines and damages',
    kind: 'deduction',
    owner: 'client-hr',
    inFinalSettlement: true,
    fields: ['fines'],
    defaultOn: false,
    note: 'A fine may only be deducted after the prescribed procedure, so the register showing one is a compliance signal in itself.',
  },

  /* Activities — things to confirm rather than figures to map. They never reach a register
     column, but an unconfirmed one blocks the monthly close. */
  { id: 'resigned-employees', label: 'Resigned employees reconciled', kind: 'activity', owner: 'client-hr', inFinalSettlement: true, fields: [], defaultOn: true, note: 'A leaver missing from the paysheet but present on the muster roll is the commonest register error.' },
  { id: 'new-joiners', label: 'New joiners added', kind: 'activity', owner: 'client-hr', inFinalSettlement: false, fields: [], defaultOn: true },
  { id: 'salary-revision', label: 'Salary revisions applied', kind: 'activity', owner: 'client-hr', inFinalSettlement: false, fields: [], defaultOn: true },
  { id: 'employee-master-changes', label: 'Employee master data changes', kind: 'activity', owner: 'client-hr', inFinalSettlement: true, fields: [], defaultOn: true, note: 'Addresses and guardian names come from the client record, so a change here changes the registers.' },
  { id: 'bank-accounts', label: 'New or changed salary accounts', kind: 'activity', owner: 'client-finance', inFinalSettlement: true, fields: ['bankAccount', 'ifsc'], defaultOn: true },
  { id: 'prior-month-remarks', label: 'Previous payroll remarks cleared', kind: 'activity', owner: 'sbc', inFinalSettlement: true, fields: [], defaultOn: true },
  { id: 'lop-reconciliation', label: 'Loss of pay checked against attendance', kind: 'activity', owner: 'sbc', inFinalSettlement: true, fields: [], defaultOn: true },
  {
    id: 'minimum-wage-coverage',
    label: 'Minimum wage coverage confirmed',
    kind: 'activity',
    owner: 'sbc',
    inFinalSettlement: false,
    fields: ['minimumWageRate'],
    defaultOn: true,
    note: 'Overtime at twice the ordinary rate under section 14 of the Code on Wages applies to employees whose minimum rate of wages is fixed under the Code. Most employees of a professional services client are above any scheduled minimum, so this must be settled per employee before an overtime register is produced.',
  },
];

const BY_ID = new Map(CHECKLIST_HEADS.map((h) => [h.id, h]));

/** One head by its id. */
export function headById(id: string): ChecklistHead | undefined {
  return BY_ID.get(id);
}

/** The heads a new client starts with. */
export function defaultHeadIds(): string[] {
  return CHECKLIST_HEADS.filter((h) => h.defaultOn).map((h) => h.id);
}

/** The heads that govern a dataset field, if any. */
export function headsForField(field: string): ChecklistHead[] {
  return CHECKLIST_HEADS.filter((h) => h.fields.includes(field));
}
