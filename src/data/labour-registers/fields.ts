/**
 * LABOUR REGISTERS — the canonical dataset.
 *
 * Every form in the catalogue renders these fields and no others. Keeping one vocabulary is
 * what lets a Telangana wage register and a Karnataka combined register share a mapping: the
 * project lead maps a client's paysheet onto these fields once, and each form picks the ones
 * it prints.
 *
 * The field list is taken from a real filed workbook (WebPT India, September 2026) plus the
 * four states' forms, so it carries what Indian payroll actually produces rather than an
 * idealised schema. `aliases` are the headings that have been seen to mean the field, and they
 * seed the matcher — they are evidence, not a guess, and every addition should come from a
 * sheet somebody actually sent us.
 */

/** What kind of value a field holds, which decides how it is parsed and printed. */
export type FieldKind = 'text' | 'number' | 'money' | 'date' | 'hours' | 'days' | 'enum';

export interface FieldSpec {
  /** The canonical key, used by `FormColumn.field`. */
  key: string;
  /** How we name it to a preparer. */
  label: string;
  kind: FieldKind;
  /** Headings seen to mean this field, lower-cased. The matcher normalises before comparing. */
  aliases: string[];
  /** The allowed values, for an enum field. */
  values?: string[];
  /** Where it normally comes from, which the reconciliation screen uses as its default. */
  usually: 'input' | 'master' | 'derived' | 'grid';
  /** The payroll checklist head that governs it, where one does. */
  head?: string;
}

/**
 * The attendance codes the filed workbook uses. They are the target of value mapping: a client
 * sheet saying `PR`, `Present` or `1` all become `P`.
 */
export const ATTENDANCE_CODES = {
  P: 'Present',
  A: 'Absent',
  WO: 'Week off',
  WOP: 'Week off worked',
  H: 'Holiday',
  HP: 'Holiday worked',
  PL: 'Paid leave',
  SCL: 'Sick or casual leave',
  M: 'Maternity leave',
  LOP: 'Loss of pay',
} as const;

export type AttendanceCode = keyof typeof ATTENDANCE_CODES;

export const FIELDS: FieldSpec[] = [
  /* Identity. */
  { key: 'serial', label: 'Serial number', kind: 'number', aliases: ['sl no', 's no', 'sr no', 'sl. no.', 'si no'], usually: 'derived' },
  { key: 'employeeId', label: 'Employee number', kind: 'text', aliases: ['empno', 'emp no', 'emp id', 'employee id', 'employee code', 'employee_id', 'staff id', 'token no'], usually: 'input' },
  { key: 'name', label: 'Name of the employee', kind: 'text', aliases: ['name', 'employee name', 'name of employee', 'name of the employee', 'employee_name', 'name and surname of workman'], usually: 'input' },
  { key: 'guardianName', label: "Father's or husband's name", kind: 'text', aliases: ['father name', 'fathers name', "father's name", 'father / husband name', 'father or husband name', "father's / husband's name", 'guardian name', 'spouse name', "father 's / spouse's name"], usually: 'master' },
  { key: 'sex', label: 'Sex', kind: 'enum', values: ['Male', 'Female', 'Transgender'], aliases: ['sex', 'gender', 'sex (m/f)', 'm/f'], usually: 'input' },
  { key: 'dateOfBirth', label: 'Date of birth', kind: 'date', aliases: ['dob', 'date of birth', 'date_of_birth', 'birth date'], usually: 'input' },
  { key: 'age', label: 'Age', kind: 'number', aliases: ['age', 'age/ date of birth'], usually: 'derived' },
  { key: 'address', label: 'Residential address', kind: 'text', aliases: ['address', 'residential address', 'present address', 'permanent address'], usually: 'master' },
  { key: 'qualification', label: 'Education qualification', kind: 'text', aliases: ['qualification', 'education qualification', 'educational qualification'], usually: 'master' },
  { key: 'nomineeName', label: 'Nominee name', kind: 'text', aliases: ['nominee', 'nominee name'], usually: 'master' },
  { key: 'nomineeAddress', label: 'Address of nominee', kind: 'text', aliases: ['nominee address', 'address of nominee'], usually: 'master' },
  { key: 'designation', label: 'Designation', kind: 'text', aliases: ['designation', 'designation or nature of work', 'nature of work', 'designation_name', 'job title', 'grade'], usually: 'input' },
  { key: 'department', label: 'Department', kind: 'text', aliases: ['department', 'department_name', 'cost centre', 'division', 'category of workers'], usually: 'input' },
  { key: 'dateOfJoining', label: 'Date of appointment', kind: 'date', aliases: ['doj', 'date of joining', 'date_of_joining', 'date of appointment', 'date of employment', 'joining date'], usually: 'input' },
  { key: 'dateOfLeaving', label: 'Date of leaving', kind: 'date', aliases: ['dol', 'date of leaving', 'date_of_leaving', 'date of termination of employment', 'last working day', 'exit date'], usually: 'input' },
  { key: 'reasonForLeaving', label: 'Reason of termination', kind: 'text', aliases: ['reason of termination', 'reason for leaving', 'exit reason'], usually: 'input' },

  /* Attendance. */
  { key: 'attendanceGrid', label: 'Daily attendance', kind: 'enum', values: Object.keys(ATTENDANCE_CODES), aliases: [], usually: 'grid' },
  { key: 'workingDays', label: 'Working days in the period', kind: 'days', aliases: ['working days', 'working_days', 'total days', 'total_days', 'paid days'], usually: 'input' },
  { key: 'daysWorked', label: 'Days worked', kind: 'days', aliases: ['days worked', 'days_worked', 'present', 'total attendance', 'total attendance/ units of work done', 'attendance', 'days of attendance', 'total no. of actual working days', 'total no. of days worked'], usually: 'input' },
  { key: 'lossOfPayDays', label: 'Loss of pay days', kind: 'days', aliases: ['lop', 'loss of pay', 'loss of pay days', 'lwp', 'absent days', 'unpaid days'], usually: 'input', head: 'attendance-lop' },
  { key: 'weekOffs', label: 'Weekly offs granted', kind: 'days', aliases: ['week off', 'week_off', 'weekly off', 'number of weekly off granted', 'wo'], usually: 'input' },
  { key: 'holidays', label: 'Holidays', kind: 'days', aliases: ['holiday', 'holidays', 'nfh', 'national and festival holidays'], usually: 'input' },
  { key: 'leavesAvailed', label: 'Leave availed', kind: 'days', aliases: ['leaves', 'leaves_count', 'leave availed', 'leaves availed', 'number of leave granted', 'no of leaves availed'], usually: 'input' },
  { key: 'leaveBalance', label: 'Leave to credit', kind: 'days', aliases: ['leave balance', 'balance leave', 'balance of leave to credit', 'total balance leaves'], usually: 'input' },
  { key: 'leaveKind', label: 'Category of leave', kind: 'text', aliases: ['leave type', 'category of leave', 'leave category'], usually: 'input' },

  /* Earnings. */
  { key: 'minimumWageRate', label: 'Minimum rate of wages payable', kind: 'money', aliases: ['minimum rates of wages payable', 'minimum wage', 'minimum rate of wages'], usually: 'master' },
  { key: 'wageRate', label: 'Rate of wages', kind: 'money', aliases: ['rate of wages', 'rates of wages actually paid', 'rate of daily wages', 'rate of remuneration paid', 'wage rate'], usually: 'derived' },
  { key: 'basic', label: 'Basic wages', kind: 'money', aliases: ['basic', 'basic pay', 'basic_pay', 'basic wages', 'basic salary', 'basic wage or salary'], usually: 'input' },
  { key: 'dearnessAllowance', label: 'Dearness allowance', kind: 'money', aliases: ['da', 'dearness allowance'], usually: 'input', head: 'dearness-allowance' },
  { key: 'hra', label: 'House rent allowance', kind: 'money', aliases: ['hra', 'house rent allowance', 'house rent'], usually: 'input' },
  { key: 'specialAllowance', label: 'Special allowance', kind: 'money', aliases: ['special allowance', 'special_allowance', 'special allowances', 'other allowance'], usually: 'input' },
  { key: 'conveyanceAllowance', label: 'Conveyance allowance', kind: 'money', aliases: ['conveyance', 'conveyance allowance', 'transport allowance'], usually: 'input', head: 'conveyance-allowance' },
  { key: 'foodAllowance', label: 'Food allowance', kind: 'money', aliases: ['food allowance', 'food_allowance', 'food allowances', 'meal allowance'], usually: 'input', head: 'food-allowance' },
  { key: 'medicalAllowance', label: 'Medical allowance', kind: 'money', aliases: ['medical allowance', 'medical'], usually: 'input', head: 'medical-allowance' },
  { key: 'nightShiftAllowance', label: 'Night shift allowance', kind: 'money', aliases: ['nsa', 'night shift allowance', 'night shift', 'nisha', 'shift allowance'], usually: 'input', head: 'night-shift-allowance' },
  { key: 'attendanceBonus', label: 'Attendance bonus', kind: 'money', aliases: ['attendance bonus'], usually: 'input', head: 'attendance-bonus' },
  { key: 'childEducationAllowance', label: 'Child education allowance', kind: 'money', aliases: ['child educational allowance', 'child education allowance', 'child hostel allowance'], usually: 'input', head: 'child-education-allowance' },
  { key: 'leaveEncashment', label: 'Leave encashment', kind: 'money', aliases: ['leave encashment', 'leave encashment allowance', 'leave_encashment_allowance', 'encashment'], usually: 'input', head: 'leave-encashment' },
  { key: 'noticePay', label: 'Notice period pay', kind: 'money', aliases: ['notice pay', 'notice period pay', 'notice_period_pay'], usually: 'input', head: 'notice-pay' },
  { key: 'arrears', label: 'Arrears', kind: 'money', aliases: ['arrears', 'arrear', 'arrears payment', 'prv_arrear_days'], usually: 'input', head: 'arrears' },
  { key: 'referralBonus', label: 'Referral bonus', kind: 'money', aliases: ['referral bonus', 'refferal bonus', 'referral'], usually: 'input', head: 'referral-bonus' },
  { key: 'maternityBenefit', label: 'Maternity benefit', kind: 'money', aliases: ['maternity benefit', 'maternity', 'amount of maternity benefit'], usually: 'input', head: 'maternity-benefit' },
  { key: 'otherEarnings', label: 'Other earnings', kind: 'money', aliases: ['other earnings', 'other_earnings', 'others', 'misc earnings'], usually: 'input' },
  { key: 'normalWagesEarned', label: 'Normal wages earned', kind: 'money', aliases: ['normal wages earned', 'normal earnings', 'wages earned during the wage period'], usually: 'derived' },
  { key: 'overtimeHours', label: 'Overtime hours', kind: 'hours', aliases: ['ot hours', 'total ot hours', 'overtime hours', 'overtime worked', 'extent of overtime worked', 'ot'], usually: 'input', head: 'overtime' },
  { key: 'overtimeDates', label: 'Dates on which overtime was worked', kind: 'text', aliases: ['ot dates', 'dates', 'days on which overtime worked', 'date on which over-time is done'], usually: 'input', head: 'overtime' },
  { key: 'overtimeWages', label: 'Overtime wages', kind: 'money', aliases: ['ot amount', 'otall', 'overtime wages', 'overtime earnings', 'wages earned for overtime work', 'amount of overtime wages'], usually: 'derived', head: 'overtime' },
  { key: 'grossEarnings', label: 'Gross wages payable', kind: 'money', aliases: ['gross', 'gross earnings', 'gross wages', 'gross wage payable', 'gross wages payable', 'total earnings', 'gross salary'], usually: 'input' },
  { key: 'reimbursements', label: 'Total reimbursements', kind: 'money', aliases: ['reimbursement', 'reimbursements', 'total reimbursements', 'reimb_gross_salary'], usually: 'input' },

  /* Deductions. */
  { key: 'pf', label: "Employee's contribution to provident fund", kind: 'money', aliases: ['pf', 'epf', 'pf employee', "employee's contribution to p.f.", 'provident fund', 'pf deduction'], usually: 'input' },
  { key: 'vpf', label: 'Voluntary provident fund', kind: 'money', aliases: ['vpf', 'voluntary provident fund', 'volutary provident fund'], usually: 'input', head: 'vpf' },
  { key: 'esi', label: 'Employee state insurance', kind: 'money', aliases: ['esi', 'esic', 'esi deduction', 'esi employee'], usually: 'input', head: 'esi' },
  { key: 'professionTax', label: 'Profession tax', kind: 'money', aliases: ['pt', 'profession tax', 'professional tax', 'ptax'], usually: 'input' },
  { key: 'tds', label: 'Income tax deducted', kind: 'money', aliases: ['tds', 'income tax', 'total income tax', 'it deduction'], usually: 'input' },
  { key: 'labourWelfareFund', label: 'Labour welfare fund', kind: 'money', aliases: ['lwf', 'labour welfare fund', 'lwf deduction'], usually: 'input', head: 'lwf' },
  { key: 'advances', label: 'Advances or loans', kind: 'money', aliases: ['advance', 'advances', 'salary advance', 'cash advance', 'amount of advances / loans', 'loan'], usually: 'input', head: 'advances' },
  { key: 'fines', label: 'Fines imposed', kind: 'money', aliases: ['fine', 'fines', 'deductions of fines imposed', 'damages/loss'], usually: 'input', head: 'fines' },
  { key: 'foodCouponDeduction', label: 'Food coupon deduction', kind: 'money', aliases: ['food coupon', 'food coupon deduction', 'food_coupon_deduction', 'meal card'], usually: 'input', head: 'food-coupon' },
  { key: 'assetDeduction', label: 'Asset deduction', kind: 'money', aliases: ['asset deduction', 'asset recovery'], usually: 'input', head: 'asset-deduction' },
  { key: 'mediclaimDeduction', label: 'Medical claim deduction', kind: 'money', aliases: ['medi claim deduction', 'mediclaim', 'medical insurance deduction', 'insurance'], usually: 'input', head: 'mediclaim' },
  { key: 'npsDeduction', label: 'National pension scheme deduction', kind: 'money', aliases: ['nps', 'nps deduction', 'nps_deduction', 'pran deduction'], usually: 'input', head: 'nps' },
  { key: 'otherDeductions', label: 'Other deductions', kind: 'money', aliases: ['other deduction', 'other_deduction', 'other deductions', 'society'], usually: 'input' },
  { key: 'totalDeductions', label: 'Total deductions', kind: 'money', aliases: ['total deduction', 'total_dedn', 'total deductions', 'gross deductions'], usually: 'input' },
  { key: 'netPay', label: 'Net wages paid', kind: 'money', aliases: ['net pay', 'net_pay', 'net salary', 'net amount payable', 'actual wages paid', 'total wages paid', 'net wages payable', 'net transfer', 'total net pay'], usually: 'input' },
  { key: 'netPayInWords', label: 'Amount in words', kind: 'text', aliases: ['in words', 'inwords', 'amount in words'], usually: 'derived' },
  { key: 'dateOfPayment', label: 'Date of payment', kind: 'date', aliases: ['date of payment', 'payment date', 'paid on', 'dates on which overtime payments made'], usually: 'derived' },

  /* Employment conditions, which come from the client record rather than a sheet. */
  { key: 'shiftStart', label: 'Time at which employment commences', kind: 'text', aliases: ['shift start', 'in time', 'time at which employment commences'], usually: 'master' },
  { key: 'shiftEnd', label: 'Time at which employment ceases', kind: 'text', aliases: ['shift end', 'out time', 'time at which employment ceases'], usually: 'master' },
  { key: 'restInterval', label: 'Rest interval', kind: 'text', aliases: ['rest interval', 'break', 'lunch'], usually: 'master' },
  { key: 'shiftName', label: 'Shift', kind: 'text', aliases: ['shift', 'shift no', 'relay', 'group'], usually: 'master' },
  { key: 'normalHours', label: 'Normal hours', kind: 'hours', aliases: ['normal hours', 'period of work'], usually: 'derived' },
  { key: 'remarks', label: 'Remarks', kind: 'text', aliases: ['remarks', 'remark', 'note'], usually: 'input' },
  { key: 'signature', label: 'Signature or thumb impression', kind: 'text', aliases: [], usually: 'derived' },

  /* Bank and statutory identifiers, which the wider registers and some returns carry. */
  { key: 'bankName', label: 'Bank', kind: 'text', aliases: ['bank', 'bank name'], usually: 'input' },
  { key: 'bankAccount', label: 'Bank account number', kind: 'text', aliases: ['account no', 'accountno', 'bank account no', 'a/c no'], usually: 'input' },
  { key: 'ifsc', label: 'IFSC code', kind: 'text', aliases: ['ifsc', 'ifsccode', 'ifsc code'], usually: 'input' },
  { key: 'uan', label: 'Universal account number', kind: 'text', aliases: ['uan', 'uan number'], usually: 'input' },
  { key: 'pan', label: 'Permanent account number', kind: 'text', aliases: ['pan', 'pannumber', 'pan number'], usually: 'input' },
  { key: 'pfAccount', label: 'Provident fund account number', kind: 'text', aliases: ['pf account', 'pfaccnumber', 'pf account number'], usually: 'input' },
  { key: 'mobile', label: 'Mobile number', kind: 'text', aliases: ['mobile', 'mobile number', 'phone'], usually: 'input' },
  { key: 'email', label: 'Email', kind: 'text', aliases: ['email', 'e-mail id', 'email id'], usually: 'input' },
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** One field by its canonical key, or undefined when the key is not in the dataset. */
export function fieldByKey(key: string): FieldSpec | undefined {
  return BY_KEY.get(key);
}

/** The label a preparer sees for a field, falling back to the key so nothing renders blank. */
export function fieldLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
