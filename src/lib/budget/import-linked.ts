import ExcelJS from 'exceljs';
import { MONTHS, fyCalendarMonths, newId, type BenefitBasis, type BudgetLine, type BudgetSettings, type Frequency, type NamedRef, type RowKind } from './model';

/**
 * Reads the owner's linked budget workbook (Budget_Linked_Template_v3), the Excel file this module
 * replaces, so a team can bring a budget it already filled. A file is this layout when it has a
 * "Benefits Config" sheet. Settings merge by name: departments and lines already on the budget
 * keep their ids, and new ones are added. Fractions in the file (0.18) become typed percents (18).
 */

export interface LinkedImport {
  settings: BudgetSettings;
  rows: { kind: RowKind; data: object }[];
  warnings: string[];
  sheets: string[];
}

const SHEET = { settings: 'Settings', master: 'Master Budget', hiring: 'Salary & Hiring', benefits: 'Benefits Config', admin: 'Admin Costs', finance: 'Finance Costs' };

const BASIS: Record<string, BenefitBasis> = {
  'per employee per month': 'per_employee_month',
  'per employee per quarter': 'per_employee_quarter',
  'per employee per year': 'per_employee_year',
  'per new joiner (one-time)': 'per_joiner',
  'fixed amount per month': 'fixed_month',
  'fixed amount per year': 'fixed_year',
  '% of salary': 'pct_salary',
};

const FREQUENCY: Record<string, Frequency> = {
  monthly: 'monthly',
  quarterly: 'quarterly',
  'half-yearly': 'half_yearly',
  'annually (in start month)': 'annual',
  'annually (spread monthly)': 'annual_spread',
};

function plain(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('result' in value) return value.result;
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return value.text;
    if ('formula' in value || 'sharedFormula' in value) return null;
  }
  return value;
}

const text = (ws: ExcelJS.Worksheet, row: number, col: number) => String(plain(ws.getRow(row).getCell(col).value) ?? '').trim();
const number = (ws: ExcelJS.Worksheet, row: number, col: number) => {
  const v = plain(ws.getRow(row).getCell(col).value);
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const percent = (ws: ExcelJS.Worksheet, row: number, col: number) => Math.round(number(ws, row, col) * 1e6) / 1e4;
const monthNumber = (name: string) => MONTHS.findIndex((m) => m.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;

/** The rows under a heading in column B, up to the first total row or the end of the sheet. */
function rowsUnder(ws: ExcelJS.Worksheet, heading: string, skip = 0): number[] {
  let found = 0;
  const rows: number[] = [];
  let inside = false;
  for (let r = 1; r <= ws.rowCount; r++) {
    const b = text(ws, r, 2);
    if (!inside) {
      if (b.toLowerCase() === heading.toLowerCase() && found++ === skip) inside = true;
      continue;
    }
    if (/^total|\(total\)/i.test(b)) break;
    if (b) rows.push(r);
  }
  return rows;
}

function byLabel(ws: ExcelJS.Worksheet, label: string, labelCol = 2): number {
  for (let r = 1; r <= ws.rowCount; r++) if (text(ws, r, labelCol).toLowerCase().startsWith(label.toLowerCase())) return r;
  return 0;
}

export async function parseLinkedWorkbook(bytes: Uint8Array, current: BudgetSettings): Promise<LinkedImport | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  const benefits = wb.getWorksheet(SHEET.benefits);
  const set = wb.getWorksheet(SHEET.settings);
  if (!benefits || !set) return null;
  const warnings: string[] = [];
  const settings: BudgetSettings = { ...current, departments: [...current.departments], lines: [...current.lines] };

  /* Settings. The financial-year start moves the month columns, so it is read first. */
  const named = (label: string) => {
    const r = byLabel(set, label);
    return r ? set.getRow(r).getCell(3).value : null;
  };
  const start = plain(named('Financial year start month'));
  const startMonth = start instanceof Date ? start.getUTCMonth() + 1 : current.fyStartMonth;
  if (start instanceof Date && start.getUTCFullYear() !== current.fyStartYear) warnings.push(`The file starts in ${start.getUTCFullYear()} and this budget starts in ${current.fyStartYear}. The year of this budget stays.`);
  settings.fyStartMonth = startMonth;
  const calendar = fyCalendarMonths(startMonth);
  const company = String(plain(named('Company name')) ?? '').trim();
  const title = String(plain(named('Budget title')) ?? '').trim();
  if (company) settings.company = company;
  if (title) settings.title = title;
  const usd = Number(plain(named('USD')) ?? 0);
  if (usd > 0) {
    settings.fx = [...settings.fx.filter((f) => f.code !== 'USD'), { code: 'USD', rate: usd, monthly: Array(12).fill(0) }];
    settings.reportCurrency = 'USD';
  }

  const departmentId = (name: string): string => {
    if (!name || name.toLowerCase() === 'all') return '';
    const known = settings.departments.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (known) return known.id;
    const added: NamedRef = { id: newId('dept'), name };
    settings.departments.push(added);
    return added.id;
  };
  for (let r = 5; r <= 30; r++) {
    const dept = text(set, r, 8);
    if (dept) departmentId(dept);
    const lineName = text(set, r, 19);
    if (lineName && !settings.lines.some((l) => l.name.toLowerCase() === lineName.toLowerCase())) {
      const added: BudgetLine = { id: newId('line'), group: text(set, r, 18) || 'Other costs', name: lineName };
      settings.lines.push(added);
    }
  }
  const lineId = (name: string, where: string): string => {
    if (!name) return '';
    const known = settings.lines.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (!known) warnings.push(`${where}: no budget line is named "${name}".`);
    return known?.id ?? '';
  };

  const rows: LinkedImport['rows'] = [];
  const sheets = [SHEET.settings, SHEET.benefits];

  /* CTC and hiring. Month columns F to Q are in financial-year order. */
  const hiring = wb.getWorksheet(SHEET.hiring);
  if (hiring) {
    sheets.push(SHEET.hiring);
    for (const r of rowsUnder(hiring, 'Role / Designation')) {
      const hires = Array(12).fill(0) as number[];
      calendar.forEach((m, i) => (hires[m - 1] = number(hiring, r, 6 + i)));
      rows.push({ kind: 'role', data: { role: text(hiring, r, 2), departmentId: departmentId(text(hiring, r, 3)), ctc: number(hiring, r, 4), opening: number(hiring, r, 5), hires } });
    }
  }

  /* The workbook types the salary of existing staff on the Master Budget, so the budget does too. */
  const master = wb.getWorksheet(SHEET.master);
  if (master) {
    const r = byLabel(master, "Existing Employees' Salary");
    const typed = r ? number(master, r, 3) : 0;
    if (typed > 0) {
      settings.currentMonthlyPayroll = typed;
      settings.payrollSource = 'typed';
      sheets.push(SHEET.master);
    }
  }

  /* Benefits. */
  for (const r of rowsUnder(benefits, 'Benefit / Per-Employee Cost')) {
    const name = text(benefits, r, 2);
    const basis = BASIS[text(benefits, r, 4).toLowerCase()] ?? '';
    if (!basis) warnings.push(`${name}: the cost basis "${text(benefits, r, 4)}" is not recognised.`);
    const eligible = text(benefits, r, 8);
    const charged = text(benefits, r, 9).toLowerCase();
    rows.push({
      kind: 'benefit',
      data: {
        name,
        lineId: lineId(text(benefits, r, 3), name),
        basis,
        /* A share of salary is a fraction in the file. */
        rate: basis === 'pct_salary' ? percent(benefits, r, 5) : number(benefits, r, 5),
        appliesTo: departmentId(text(benefits, r, 6)) || 'all',
        excludeDepartmentId: departmentId(text(benefits, r, 7)),
        eligiblePct: eligible ? percent(benefits, r, 8) : null,
        timing: !charged || charged === 'every month' ? 'monthly' : charged.startsWith('quarter') ? 'quarter_end' : String(monthNumber(charged) || 'monthly'),
        notes: text(benefits, r, 10),
      },
    });
  }

  /* Admin and Finance share one layout: a recurring block, then a month-wise block. */
  const costs = (sheetName: string, recurring: RowKind, once: RowKind) => {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) return;
    sheets.push(sheetName);
    const month = (r: number, c: number) => monthNumber(text(ws, r, c));
    for (const r of rowsUnder(ws, 'Cost Item', 0)) {
      const name = text(ws, r, 2);
      const frequency = FREQUENCY[text(ws, r, 5).toLowerCase()] ?? '';
      if (!frequency) warnings.push(`${name}: the frequency "${text(ws, r, 5)}" is not recognised.`);
      rows.push({
        kind: recurring,
        data: { name, lineId: lineId(text(ws, r, 3), name), amount: number(ws, r, 4), frequency, startMonth: month(r, 6), endMonth: month(r, 7), gstPct: percent(ws, r, 8), escalationPct: percent(ws, r, 9), escalationMonth: month(r, 10), notes: text(ws, r, 26) },
      });
    }
    for (const r of rowsUnder(ws, 'Cost Item', 1)) {
      const name = text(ws, r, 2);
      const months = Array(12).fill(0) as number[];
      /* Columns L to W, in financial-year order. */
      calendar.forEach((m, i) => (months[m - 1] = number(ws, r, 12 + i)));
      rows.push({ kind: once, data: { name, lineId: lineId(text(ws, r, 3), name), gstPct: percent(ws, r, 8), months, notes: text(ws, r, 26) } });
    }
  };
  costs(SHEET.admin, 'admin_rec', 'admin_once');
  costs(SHEET.finance, 'finance_rec', 'finance_once');

  /* The tax block sits at the top of the Finance sheet. */
  const finance = wb.getWorksheet(SHEET.finance);
  if (finance) {
    const at = (label: string) => byLabel(finance, label);
    const include = at('Include income tax');
    settings.tax = {
      mode: include && /^y/i.test(text(finance, include, 3)) ? 'cost_plus' : 'none',
      markupPct: at('Cost-plus mark-up') ? percent(finance, at('Cost-plus mark-up'), 3) : current.tax.markupPct,
      ratePct: at('Corporate tax rate') ? percent(finance, at('Corporate tax rate'), 3) : current.tax.ratePct,
      surchargePct: at('Surcharge') ? percent(finance, at('Surcharge'), 3) : current.tax.surchargePct,
      cessPct: at('Health & education cess') ? percent(finance, at('Health & education cess'), 3) : current.tax.cessPct,
    };
  }

  return { settings, rows, warnings, sheets };
}
