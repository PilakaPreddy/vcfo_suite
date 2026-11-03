/**
 * Salary rows for one payroll cycle, the statutory deductions worked out from them, and the CSV
 * export and import the Salary Updates tab offers for large changes.
 *
 * The deductions are the common Indian defaults, kept deliberately simple for the first pass:
 * - Provident Fund: 12% of basic, on a basic capped at ₹15,000 (so at most ₹1,800), when the
 *   worker is on PF.
 * - ESI: 0.75% of gross (employee share), only when gross is ₹21,000 or less.
 * - Professional tax and TDS are entered per worker, because both depend on the state and the
 *   worker's declarations, which this table does not hold.
 */

export interface SalaryRow {
  employeeId: string;
  name: string;
  designation: string;
  /** Two-letter state code (KA, MH, TG …), used to pick the labour register state. */
  state: string;
  basic: number;
  hra: number;
  allowances: number;
  /** One-off amounts for this cycle: bonus, arrears, reimbursements. */
  variablePay: number;
  pfApplicable: boolean;
  professionalTax: number;
  tds: number;
  /** Paid days in the cycle; pay is pro-rated when lower than the month's days. */
  paidDays: number;
}

export interface SalaryComputed {
  gross: number;
  pf: number;
  esi: number;
  deductions: number;
  net: number;
  /** Employer cost: gross plus employer PF (12%, same cap) and employer ESI (3.25%). */
  employerCost: number;
}

export const PF_RATE = 0.12;
export const PF_WAGE_CEILING = 15_000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;
export const ESI_GROSS_CEILING = 21_000;

function round(n: number): number {
  return Math.round(n);
}

export function computeSalary(row: SalaryRow, daysInCycle: number): SalaryComputed {
  const factor = daysInCycle > 0 ? Math.min(Math.max(row.paidDays, 0), daysInCycle) / daysInCycle : 1;
  const basic = row.basic * factor;
  const fixed = (row.basic + row.hra + row.allowances) * factor;
  const gross = round(fixed + row.variablePay);
  const pf = row.pfApplicable ? round(Math.min(basic, PF_WAGE_CEILING) * PF_RATE) : 0;
  const esiApplies = gross > 0 && gross <= ESI_GROSS_CEILING;
  const esi = esiApplies ? Math.ceil(gross * ESI_EMPLOYEE_RATE) : 0;
  const deductions = pf + esi + round(row.professionalTax) + round(row.tds);
  const employerEsi = esiApplies ? Math.ceil(gross * ESI_EMPLOYER_RATE) : 0;
  return { gross, pf, esi, deductions, net: gross - deductions, employerCost: gross + pf + employerEsi };
}

export interface PayrollTotals extends SalaryComputed {
  workers: number;
}

export function totalsFor(rows: SalaryRow[], daysInCycle: number): PayrollTotals {
  const zero: PayrollTotals = { workers: 0, gross: 0, pf: 0, esi: 0, deductions: 0, net: 0, employerCost: 0 };
  return rows.reduce((t, row) => {
    const c = computeSalary(row, daysInCycle);
    return {
      workers: t.workers + 1,
      gross: t.gross + c.gross,
      pf: t.pf + c.pf,
      esi: t.esi + c.esi,
      deductions: t.deductions + c.deductions,
      net: t.net + c.net,
      employerCost: t.employerCost + c.employerCost,
    };
  }, zero);
}

export function emptyRow(n: number, daysInCycle: number): SalaryRow {
  return {
    employeeId: `EMP${String(n).padStart(3, '0')}`,
    name: '',
    designation: '',
    state: 'KA',
    basic: 0,
    hra: 0,
    allowances: 0,
    variablePay: 0,
    pfApplicable: true,
    professionalTax: 0,
    tds: 0,
    paidDays: daysInCycle,
  };
}

/* ── CSV ─────────────────────────────────────────────────────────────── */

/** The columns, in order. The header row of an export, and what an import expects. */
export const CSV_COLUMNS: Array<{ key: keyof SalaryRow; header: string }> = [
  { key: 'employeeId', header: 'Employee ID' },
  { key: 'name', header: 'Name' },
  { key: 'designation', header: 'Designation' },
  { key: 'state', header: 'State' },
  { key: 'paidDays', header: 'Paid days' },
  { key: 'basic', header: 'Basic' },
  { key: 'hra', header: 'HRA' },
  { key: 'allowances', header: 'Allowances' },
  { key: 'variablePay', header: 'Variable pay' },
  { key: 'pfApplicable', header: 'PF applicable' },
  { key: 'professionalTax', header: 'Professional tax' },
  { key: 'tds', header: 'TDS' },
];

function csvCell(value: string | number | boolean): string {
  const s = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function salariesToCsv(rows: SalaryRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c.key])).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Split CSV text into rows of cells, honouring quotes and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface ImportResult {
  rows: SalaryRow[];
  errors: string[];
}

const NUMERIC: Array<keyof SalaryRow> = ['paidDays', 'basic', 'hra', 'allowances', 'variablePay', 'professionalTax', 'tds'];

/**
 * Read an exported (or hand-made) CSV back into rows. Headers are matched by name, case and
 * spacing ignored, so columns may be reordered. A row without an Employee ID is skipped with
 * an error; a bad number is an error too, and that row is left out rather than half-read.
 */
export function salariesFromCsv(text: string, daysInCycle: number): ImportResult {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length === 0) return { rows: [], errors: ['The file is empty.'] };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const header = table[0]!.map(norm);
  const index = new Map<keyof SalaryRow, number>();
  for (const col of CSV_COLUMNS) {
    const at = header.indexOf(norm(col.header));
    if (at >= 0) index.set(col.key, at);
  }
  if (!index.has('employeeId')) return { rows: [], errors: ['The file has no "Employee ID" column.'] };

  const rows: SalaryRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (key: keyof SalaryRow) => {
      const at = index.get(key);
      return at === undefined ? undefined : (cells[at] ?? '').trim();
    };
    const id = get('employeeId');
    if (!id) {
      errors.push(`Row ${line}: no Employee ID.`);
      return;
    }
    const row = emptyRow(0, daysInCycle);
    row.employeeId = id;
    row.name = get('name') ?? '';
    row.designation = get('designation') ?? '';
    row.state = (get('state') || 'KA').toUpperCase();
    const pf = get('pfApplicable');
    if (pf !== undefined && pf !== '') row.pfApplicable = /^(y|yes|true|1)$/i.test(pf);
    let bad = false;
    for (const key of NUMERIC) {
      const raw = get(key);
      if (raw === undefined || raw === '') continue;
      const n = Number(raw.replace(/[₹,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`Row ${line}: "${raw}" is not a valid amount for ${CSV_COLUMNS.find((c) => c.key === key)!.header}.`);
        bad = true;
      } else (row[key] as number) = n;
    }
    if (!bad) rows.push(row);
  });
  return { rows, errors };
}

/**
 * Merge imported rows into the current table by Employee ID: matching rows are replaced, new
 * IDs are added at the end, and rows the file does not mention are kept.
 */
export function mergeRows(current: SalaryRow[], incoming: SalaryRow[]): { rows: SalaryRow[]; updated: number; added: number } {
  const byId = new Map(incoming.map((r) => [r.employeeId, r]));
  let updated = 0;
  const rows = current.map((r) => {
    const next = byId.get(r.employeeId);
    if (!next) return r;
    byId.delete(r.employeeId);
    updated += 1;
    return next;
  });
  const added = [...byId.values()];
  return { rows: [...rows, ...added], updated, added: added.length };
}

/** The payroll summary as CSV: every worker's computed pay, and a totals row. */
export function summaryToCsv(rows: SalaryRow[], daysInCycle: number): string {
  const head = ['Employee ID', 'Name', 'State', 'Paid days', 'Gross', 'PF', 'ESI', 'Professional tax', 'TDS', 'Total deductions', 'Net pay', 'Employer cost'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const c = computeSalary(r, daysInCycle);
    lines.push([r.employeeId, r.name, r.state, r.paidDays, c.gross, c.pf, c.esi, r.professionalTax, r.tds, c.deductions, c.net, c.employerCost].map(csvCell).join(','));
  }
  const t = totalsFor(rows, daysInCycle);
  const pt = rows.reduce((s, r) => s + r.professionalTax, 0);
  const tds = rows.reduce((s, r) => s + r.tds, 0);
  lines.push(['Total', `${t.workers} workers`, '', '', t.gross, t.pf, t.esi, pt, tds, t.deductions, t.net, t.employerCost].map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** "₹1,23,456" in the Indian grouping. */
export function formatInr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
