// Builds the October 2026 paysheet for Kaveri Foods (12 employees) and, separately, the expected
// totals worked out by hand-written rules, so the app's registers and payroll are checked against
// numbers the app did not produce. Run: node e2e/uat/fixtures/make-paysheet.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ExcelJS = createRequire(import.meta.url)('exceljs');
const here = dirname(fileURLToPath(import.meta.url));
const WORKING_DAYS = 26;
const EMP = [
  ['E001', 'Arjun Kumar', 'Male', '2026-08-05', 'Production Supervisor', 'Production', 32000, 26],
  ['E002', 'Divya Nair', 'Female', '2026-08-05', 'Quality Analyst', 'Quality', 28000, 25],
  ['E003', 'Ravi Teja', 'Male', '2026-08-10', 'Machine Operator', 'Production', 18000, 24],
  ['E004', 'Sunita Devi', 'Female', '2026-08-10', 'Packer', 'Packing', 15000, 26],
  ['E005', 'Mohammed Irfan', 'Male', '2026-08-12', 'Machine Operator', 'Production', 18000, 22],
  ['E006', 'Lakshmi Prasad', 'Female', '2026-08-15', 'Store Keeper', 'Stores', 20000, 26],
  ['E007', 'Vikram Singh', 'Male', '2026-08-15', 'Driver', 'Logistics', 17000, 23],
  ['E008', 'Pooja Hegde', 'Female', '2026-08-20', 'Accounts Assistant', 'Accounts', 22000, 26],
  ['E009', 'Naveen Gowda', 'Male', '2026-08-20', 'Helper', 'Production', 14000, 20],
  ['E010', 'Shabana Begum', 'Female', '2026-09-01', 'Packer', 'Packing', 15000, 26],
  ['E011', 'Rahul Menon', 'Male', '2026-09-01', 'Maintenance Technician', 'Maintenance', 24000, 25],
  ['E012', 'Kavya Reddy', 'Female', '2026-09-15', 'HR Executive', 'HR', 26000, 26],
];

// The rules, written out plainly:
//   earned gross = monthly salary × days worked ÷ 26, rounded to the rupee
//   basic = 50% of earned gross; HRA = 20%; special allowance = the rest
//   PF = 12% of basic, on basic up to ₹15,000
//   ESI = 0.75% of earned gross, rounded up, only when the monthly salary is ₹21,000 or less
//   PT (Karnataka) = ₹200 when the monthly salary is ₹25,000 or more, else nil
//   net = gross − PF − ESI − PT
const rows = EMP.map(([id, name, sex, doj, desig, dept, salary, days]) => {
  const gross = Math.round((salary * days) / WORKING_DAYS);
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(gross * 0.2);
  const special = gross - basic - hra;
  const pf = Math.round(Math.min(basic, 15000) * 0.12);
  const esi = salary <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = salary >= 25000 ? 200 : 0;
  const net = gross - pf - esi - pt;
  return { id, name, sex, doj, desig, dept, salary, days, gross, basic, hra, special, pf, esi, pt, net };
});
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
const expected = { period: '2026-10', workingDays: WORKING_DAYS, employees: rows.length, gross: sum('gross'), basic: sum('basic'), hra: sum('hra'), pf: sum('pf'), esi: sum('esi'), pt: sum('pt'), net: sum('net'), rows };

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Paysheet Oct 2026');
// October 2026: 31 days, 4 Sundays (weekly offs), 1 holiday (Gandhi Jayanti, 2 Oct) → 26 working days.
// Absence is first taken from leave (up to 2 days), the rest is loss of pay; 12 days of leave a year.
ws.addRow(['Employee ID', 'Employee Name', "Father's name", 'Gender', 'Date of birth', 'Date of Joining', 'Designation', 'Department', 'Working days', 'Days worked', 'Weekly off', 'Holidays', 'Leave availed', 'Leave balance', 'Loss of pay days', 'Overtime hours', 'Overtime wages', 'Basic', 'HRA', 'Special allowance', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Total deductions', 'Net pay', 'Date of payment']);
for (const r of rows) {
  const absent = WORKING_DAYS - r.days;
  const leave = Math.min(2, absent);
  ws.addRow([r.id, r.name, `${r.name.split(' ')[1] ?? 'Kumar'} Senior`, r.sex, '1992-01-01', r.doj, r.desig, r.dept, WORKING_DAYS, r.days, 4, 1, leave, 12 - leave, absent - leave, 0, 0, r.basic, r.hra, r.special, r.gross, r.pf, r.esi, r.pt, 0, r.pf + r.esi + r.pt, r.net, '2026-11-01']);
}
await wb.xlsx.writeFile(join(here, 'files', 'paysheet-oct-2026.xlsx'));

// The same people as a payroll salary-update CSV (Payroll › Import). Payroll takes monthly rates
// and paid days on a calendar-day basis: October has 31 days; paid days = 31 − loss-of-pay days,
// where absence beyond 2 days of leave is loss of pay. Expected payroll figures, by the same rules
// written out by hand: earned = rate × paid ÷ 31; PF 12% of earned basic up to ₹15,000; ESI 0.75%
// of earned gross when that gross is ₹21,000 or less (rounded up); PT ₹200 at ₹25,000 a month or more.
const payroll = EMP.map(([id, name, , , desig, , salary, days]) => {
  const absent = WORKING_DAYS - days;
  const lop = Math.max(0, absent - 2);
  const paid = 31 - lop;
  const basic = Math.round(salary * 0.5), hra = Math.round(salary * 0.2), allow = salary - basic - hra;
  const gross = Math.round(((basic + hra + allow) * paid) / 31);
  const pf = Math.round(Math.min((basic * paid) / 31, 15000) * 0.12);
  const esi = gross > 0 && gross <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = salary >= 25000 ? 200 : 0;
  return { id, name, desig, paid, basic, hra, allow, pt, gross, pf, esi, net: gross - pf - esi - pt };
});
const psum = (k) => payroll.reduce((a, r) => a + r[k], 0);
writeFileSync(join(here, 'expected-payroll-app.json'), JSON.stringify({ cycle: '2026-10', workers: payroll.length, gross: psum('gross'), pf: psum('pf'), esi: psum('esi'), pt: psum('pt'), net: psum('net'), rows: payroll }, null, 2));
const csv = ['Employee ID,Name,Designation,State,Paid days,Basic,HRA,Allowances,Variable pay,PF applicable,Professional tax,TDS',
  ...payroll.map((r) => [r.id, r.name, r.desig, 'Karnataka', r.paid, r.basic, r.hra, r.allow, 0, 'Yes', r.pt, 0].join(','))].join('\n');
writeFileSync(join(here, 'files', 'payroll-oct-2026.csv'), csv + '\n');
console.log('payroll', JSON.stringify({ gross: psum('gross'), pf: psum('pf'), esi: psum('esi'), pt: psum('pt'), net: psum('net') }));
writeFileSync(join(here, 'expected-payroll.json'), JSON.stringify(expected, null, 2));
console.log(JSON.stringify({ gross: expected.gross, pf: expected.pf, esi: expected.esi, pt: expected.pt, net: expected.net }));
