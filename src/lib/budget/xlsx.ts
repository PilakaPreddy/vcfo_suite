import ExcelJS from 'exceljs';
import { computeBudget, computeScenario, sumSeries, toReportCurrency, type BudgetResult } from './engine';
import { BENEFIT_BASES, FREQUENCIES, MONTHS, ROW_SECTION, fyName, type BenefitData, type BudgetRow, type BudgetSection, type BudgetSettings, type BudgetState, type OnceData, type RecurringData, type RoleData, type RowKind } from './model';
import { advanceTaxSchedule, computeTax, type TaxActuals } from './tax';
import { VARIANCE_STATUS_LABEL, entriesOfMonth, monthBudget, taxActualsOf, type VarianceData } from './variance';

/**
 * BUDGET EXCEL — the export of every tab and the import of the same layout. The fill-in sheets use
 * names (of lines, departments, months), never ids, so a person can type them, and importing an
 * exported file gives the same budget back.
 *
 * Month columns are headed Jan to Dec and written in financial-year order. Values go back by the
 * month name, so a file still imports after the financial-year start changes. The owner's own
 * workbook layout imports through `import-linked.ts`.
 */

const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF4' } } as const;
const TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1EF' } } as const;
const NUMBER = '#,##,##0;(#,##,##0);-';

const yes = (v: boolean) => (v ? 'Yes' : 'No');
const isYes = (v: unknown) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());
const monthName = (m: number | null | undefined) => (m ? MONTHS[m - 1] : '');
const monthNumber = (v: unknown) => {
  const at = MONTHS.findIndex((m) => m.toLowerCase() === String(v ?? '').trim().slice(0, 3).toLowerCase());
  return at < 0 ? 0 : at + 1;
};
const number = (v: unknown) => {
  const value = v && typeof v === 'object' && 'result' in (v as object) ? (v as { result: unknown }).result : v;
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown) => {
  if (v == null) return '';
  if (typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('').trim();
  return String(v).trim();
};

function header(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = HEAD;
    c.alignment = { wrapText: true, vertical: 'middle' };
  });
  ws.views = [{ state: 'frozen', ySplit: row.number, xSplit: 1 }];
  return row;
}

function fyMonthNames(settings: BudgetSettings): string[] {
  const start = settings.fyStartMonth - 1;
  return Array.from({ length: 12 }, (_, i) => MONTHS[(start + i) % 12]);
}

const refName = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '';
const refId = (list: { id: string; name: string }[], name: unknown) => list.find((x) => x.name.toLowerCase() === text(name).toLowerCase())?.id ?? '';

interface Column<T> {
  head: string;
  get: (d: T, s: BudgetSettings) => ExcelJS.CellValue;
  set: (v: unknown, d: Partial<T>, s: BudgetSettings) => void;
}

const costColumns = <T extends RecurringData | OnceData>(): Column<T>[] => [
  { head: 'Cost item', get: (d) => d.name, set: (v, d) => ((d as unknown as RecurringData).name = text(v)) },
  { head: 'Master Budget line', get: (d, s) => refName(s.lines, d.lineId), set: (v, d, s) => ((d as unknown as RecurringData).lineId = refId(s.lines, v)) },
  { head: 'Currency', get: (d) => d.currency || 'INR', set: (v, d) => ((d as unknown as RecurringData).currency = text(v).toUpperCase() === 'INR' ? '' : text(v).toUpperCase()) },
  { head: 'GST %', get: (d) => d.gstPct, set: (v, d) => ((d as unknown as RecurringData).gstPct = number(v)) },
  { head: 'GST recoverable', get: (d) => yes(d.gstRecoverable), set: (v, d) => ((d as unknown as RecurringData).gstRecoverable = isYes(v)) },
  { head: 'Capital item', get: (d) => yes(d.capital), set: (v, d) => ((d as unknown as RecurringData).capital = isYes(v)) },
  { head: 'Life (years)', get: (d) => d.lifeYears, set: (v, d) => ((d as unknown as RecurringData).lifeYears = number(v) || 3) },
  { head: 'Payment lag (months)', get: (d) => d.payLagMonths, set: (v, d) => ((d as unknown as RecurringData).payLagMonths = number(v)) },
  { head: 'Department', get: (d, s) => refName(s.departments, d.departmentId), set: (v, d, s) => ((d as unknown as RecurringData).departmentId = refId(s.departments, v)) },
  { head: 'Location', get: (d, s) => refName(s.locations, d.locationId), set: (v, d, s) => ((d as unknown as RecurringData).locationId = refId(s.locations, v)) },
];

const noteColumn = <T extends { notes: string }>(): Column<T> => ({ head: 'Notes', get: (d) => d.notes, set: (v, d) => (d.notes = text(v)) });

const roleColumns: Column<RoleData>[] = [
  { head: 'Role', get: (d) => d.role, set: (v, d) => (d.role = text(v)) },
  { head: 'Department', get: (d, s) => refName(s.departments, d.departmentId), set: (v, d, s) => (d.departmentId = refId(s.departments, v)) },
  { head: 'Location', get: (d, s) => refName(s.locations, d.locationId), set: (v, d, s) => (d.locationId = refId(s.locations, v)) },
  { head: 'Annual CTC (INR)', get: (d) => d.ctc, set: (v, d) => (d.ctc = number(v)) },
  { head: 'Opening headcount', get: (d) => d.opening, set: (v, d) => (d.opening = number(v)) },
  { head: 'Joining day', get: (d) => d.joinDay, set: (v, d) => (d.joinDay = number(v) || 1) },
  { head: 'Increase %', get: (d) => d.incrementPct ?? '', set: (v, d) => (d.incrementPct = text(v) === '' ? null : number(v)) },
  { head: 'Increase month', get: (d) => monthName(d.incrementMonth), set: (v, d) => (d.incrementMonth = monthNumber(v) || null) },
  noteColumn<RoleData>(),
];

const benefitColumns: Column<BenefitData>[] = [
  { head: 'Benefit', get: (d) => d.name, set: (v, d) => (d.name = text(v)) },
  { head: 'Master Budget line', get: (d, s) => refName(s.lines, d.lineId), set: (v, d, s) => (d.lineId = refId(s.lines, v)) },
  {
    head: 'Cost basis',
    get: (d) => (d.basis ? BENEFIT_BASES[d.basis].label : ''),
    set: (v, d) => (d.basis = ((Object.keys(BENEFIT_BASES) as (keyof typeof BENEFIT_BASES)[]).find((k) => BENEFIT_BASES[k].label.toLowerCase() === text(v).toLowerCase()) ?? '') as BenefitData['basis']),
  },
  { head: 'Cost per unit', get: (d) => d.rate, set: (v, d) => (d.rate = number(v)) },
  { head: 'Applies to', get: (d, s) => (d.appliesTo === 'all' ? 'All' : refName(s.departments, d.appliesTo)), set: (v, d, s) => (d.appliesTo = refId(s.departments, v) || 'all') },
  { head: 'Exclude department', get: (d, s) => refName(s.departments, d.excludeDepartmentId), set: (v, d, s) => (d.excludeDepartmentId = refId(s.departments, v)) },
  { head: '% eligible', get: (d) => d.eligiblePct ?? '', set: (v, d) => (d.eligiblePct = text(v) === '' ? null : number(v)) },
  {
    head: 'When charged',
    get: (d) => (d.timing === 'monthly' ? 'Every month' : d.timing === 'quarter_end' ? 'Quarter-end months' : monthName(Number(d.timing))),
    set: (v, d) => {
      const t = text(v).toLowerCase();
      d.timing = t.startsWith('quarter') ? 'quarter_end' : monthNumber(v) ? String(monthNumber(v)) : 'monthly';
    },
  },
  { head: 'Location', get: (d, s) => refName(s.locations, d.locationId), set: (v, d, s) => (d.locationId = refId(s.locations, v)) },
  noteColumn<BenefitData>(),
];

const recurringColumns: Column<RecurringData>[] = [
  ...costColumns<RecurringData>(),
  { head: 'Amount (excl. GST)', get: (d) => d.amount, set: (v, d) => (d.amount = number(v)) },
  {
    head: 'Frequency',
    get: (d) => (d.frequency ? FREQUENCIES[d.frequency].label : ''),
    set: (v, d) => (d.frequency = ((Object.keys(FREQUENCIES) as (keyof typeof FREQUENCIES)[]).find((k) => FREQUENCIES[k].label.toLowerCase() === text(v).toLowerCase()) ?? '') as RecurringData['frequency']),
  },
  { head: 'Start month', get: (d) => monthName(d.startMonth), set: (v, d) => (d.startMonth = monthNumber(v)) },
  { head: 'End month', get: (d) => monthName(d.endMonth), set: (v, d) => (d.endMonth = monthNumber(v)) },
  { head: 'Escalation %', get: (d) => d.escalationPct, set: (v, d) => (d.escalationPct = number(v)) },
  { head: 'Escalation from', get: (d) => monthName(d.escalationMonth), set: (v, d) => (d.escalationMonth = monthNumber(v)) },
  noteColumn<RecurringData>(),
];

const onceColumns: Column<OnceData>[] = [...costColumns<OnceData>(), noteColumn<OnceData>()];

const SHEETS: { kind: RowKind; name: string; columns: Column<never>[]; monthFields: string[] }[] = [
  { kind: 'role', name: 'CTC & hiring', columns: roleColumns as Column<never>[], monthFields: ['hires', 'exits'] },
  { kind: 'benefit', name: 'Benefits', columns: benefitColumns as Column<never>[], monthFields: [] },
  { kind: 'admin_rec', name: 'Admin recurring', columns: recurringColumns as Column<never>[], monthFields: [] },
  { kind: 'admin_once', name: 'Admin one-off', columns: onceColumns as Column<never>[], monthFields: ['months'] },
  { kind: 'finance_rec', name: 'Finance recurring', columns: recurringColumns as Column<never>[], monthFields: [] },
  { kind: 'finance_once', name: 'Finance one-off', columns: onceColumns as Column<never>[], monthFields: ['months'] },
];

const MONTH_PREFIX: Record<string, string> = { hires: 'Joiners', exits: 'Exits', months: 'Amount' };

function writeFillSheets(wb: ExcelJS.Workbook, state: BudgetState, sections: BudgetSection[]) {
  const names = fyMonthNames(state.settings);
  for (const sheet of SHEETS) {
    if (!sections.includes(ROW_SECTION[sheet.kind])) continue;
    const ws = wb.addWorksheet(sheet.name);
    const heads = [...sheet.columns.map((c) => c.head), ...sheet.monthFields.flatMap((f) => names.map((m) => `${MONTH_PREFIX[f]} ${m}`))];
    header(ws, heads);
    ws.columns.forEach((c, i) => (c.width = i === 0 ? 30 : 14));
    for (const row of state.rows.filter((r) => r.kind === sheet.kind)) {
      const values: ExcelJS.CellValue[] = sheet.columns.map((c) => c.get(row.data as never, state.settings));
      for (const f of sheet.monthFields) {
        const series = (row.data as unknown as Record<string, number[]>)[f] ?? [];
        names.forEach((m) => values.push(series[MONTHS.indexOf(m as (typeof MONTHS)[number])] ?? 0));
      }
      ws.addRow(values);
    }
  }
}

function writeSeriesRow(ws: ExcelJS.Worksheet, label: string, series: number[], bold = false) {
  const row = ws.addRow([label, ...series.map((v) => Math.round(v)), Math.round(sumSeries(series))]);
  row.eachCell((c, n) => {
    if (n > 1) c.numFmt = NUMBER;
  });
  if (bold) {
    row.font = { bold: true };
    row.eachCell((c) => (c.fill = TOTAL));
  }
}

function writeMaster(wb: ExcelJS.Workbook, state: BudgetState, r: BudgetResult) {
  const s = state.settings;
  const ws = wb.addWorksheet('Master Budget');
  ws.addRow([`${s.title} — ${s.company}`]).font = { bold: true, size: 13 };
  ws.addRow([fyName(s)]);
  ws.addRow([]);
  header(ws, ['Line item', ...r.labels, 'Annual (INR)']);
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 36 : 13));
  writeSeriesRow(ws, 'Closing headcount', r.headcount.closing);
  for (const g of r.groups) {
    ws.addRow([g.group]).font = { bold: true };
    for (const id of g.lineIds) writeSeriesRow(ws, s.lines.find((l) => l.id === id)?.name ?? id, r.lines[id]);
    writeSeriesRow(ws, `Total ${g.group}`, g.total, true);
  }
  writeSeriesRow(ws, 'Total operating cost', r.operating, true);
  if (s.tax.mode === 'cost_plus') {
    writeSeriesRow(ws, 'Cost base for income tax (see the Advance tax sheet)', r.taxBase);
    writeSeriesRow(ws, 'Income tax (estimated)', r.tax);
  }
  writeSeriesRow(ws, 'Total cost', r.grandTotal, true);
  const report = toReportCurrency(s, r.grandTotal);
  if (report) writeSeriesRow(ws, `Total cost (${s.reportCurrency})`, report, true);
  if (s.tax.mode === 'cost_plus') {
    ws.addRow([]);
    ws.addRow(['Income tax is an estimate from the assumptions in Settings. It is not tax advice.']);
  }
}

function writeViews(wb: ExcelJS.Workbook, state: BudgetState, r: BudgetResult) {
  const ws = wb.addWorksheet('Cash flow');
  header(ws, ['Cash flow (INR)', ...r.labels, 'Annual']);
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 36 : 13));
  writeSeriesRow(ws, 'Payments for cost', r.cash.outflow);
  writeSeriesRow(ws, 'of which capital items', r.cash.capex);
  writeSeriesRow(ws, 'of which GST to recover', r.cash.recoverableGst);
  writeSeriesRow(ws, 'Funds to request', r.cash.fundsRequest, true);
  writeSeriesRow(ws, 'Closing cash', r.cash.closingBeforeFunding);

  const by = wb.addWorksheet('By department');
  header(by, ['Department', ...r.labels, 'Annual']);
  by.columns.forEach((c, i) => (c.width = i === 0 ? 36 : 13));
  for (const d of r.byDepartment) writeSeriesRow(by, d.name, d.total);
  if (r.byLocation.length > 1) {
    by.addRow([]);
    by.addRow(['Location']).font = { bold: true };
    for (const d of r.byLocation) writeSeriesRow(by, d.name, d.total);
  }

  const sc = wb.addWorksheet('Scenarios');
  header(sc, ['Scenario', ...r.labels, 'Annual']);
  sc.columns.forEach((c, i) => (c.width = i === 0 ? 24 : 13));
  writeSeriesRow(sc, 'Base', r.grandTotal, true);
  for (const key of ['high', 'low'] as const) writeSeriesRow(sc, key === 'high' ? 'High' : 'Low', computeScenario(state, key).grandTotal);
}

function plainRow(ws: ExcelJS.Worksheet, values: ExcelJS.CellValue[], bold = false) {
  const row = ws.addRow(values);
  row.eachCell((c, col) => {
    if (col > 1 && typeof c.value === 'number') c.numFmt = NUMBER;
  });
  if (bold) {
    row.font = { bold: true };
    row.eachCell((c) => (c.fill = TOTAL));
  }
  return row;
}

/** Income tax and advance tax: the computation (budget and latest estimate), blocks and instalments. */
function writeAdvanceTax(wb: ExcelJS.Workbook, state: BudgetState, r: BudgetResult, actuals: TaxActuals | null) {
  const budget = r.taxDetail;
  if (!budget.on) return;
  const latest = actuals ? computeTax(state.settings, state.rows, r, actuals) : budget;
  const ws = wb.addWorksheet('Advance tax');
  ws.columns = [{ width: 48 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.addRow([`Income tax computation, ${fyName(state.settings)}`]).font = { bold: true, size: 13 };
  ws.addRow([`Effective rate ${(latest.effectiveRate * 100).toFixed(3)}% (${latest.ratePct}% x ${(1 + latest.surchargePct / 100).toFixed(2)} surcharge x ${(1 + latest.cessPct / 100).toFixed(2)} cess). An estimate under the Income-tax Act 2025, not tax advice.`]);
  ws.addRow([]);
  header(ws, ['Line', 'Budget', actuals ? 'Latest estimate' : 'Latest estimate (no approved actuals)', 'Change']);
  const b = budget.totals;
  const l = latest.totals;
  const line = (label: string, bv: number, lv: number, bold = false) => plainRow(ws, [label, bv, lv, lv - bv], bold);
  line('Total operating cost (Master Budget lines)', b.opex, l.opex);
  if (b.gst || l.gst) line('Less: GST inside the cost', -b.gst, -l.gst);
  if (b.capitalised || l.capitalised) line('Less: lines capitalised into an asset block', -b.capitalised, -l.capitalised);
  line('Less: depreciation line in the Master Budget', -b.masterDepreciation, -l.masterDepreciation);
  if (latest.insuranceOn) {
    line('Less: insurance as booked or paid', -b.insuranceBooked, -l.insuranceBooked);
    line('Add: insurance on a prepaid basis', b.insurancePrepaid, l.insurancePrepaid);
  }
  line('Add: depreciation as per Companies Act 2013', b.cosDepreciation, l.cosDepreciation);
  line('Cost base for the mark-up', b.base, l.base, true);
  line('Revenue (cost base + mark-up)', b.revenue, l.revenue);
  line('Profit before tax', b.profitBeforeTax, l.profitBeforeTax, true);
  line('Add: gratuity', b.gratuity, l.gratuity);
  line('Add: leave encashment', b.leave, l.leave);
  line('Add: depreciation as per Companies Act 2013', b.cosDepreciation, l.cosDepreciation);
  line('Less: depreciation as per Income-tax Act', -b.itDepreciation, -l.itDepreciation);
  line('Taxable income', b.taxable, l.taxable, true);
  line('Income tax for the year', b.tax, l.tax, true);

  ws.addRow([]);
  header(ws, ['Block of assets', 'IT Act rate %', 'Opening WDV, IT Act', 'Additions', 'Depreciation, IT Act', 'Closing WDV, IT Act', 'Useful life', 'Opening WDV, Cos. Act', 'Depreciation, Cos. Act', 'Closing WDV, Cos. Act']);
  for (const blk of latest.blocks) plainRow(ws, [blk.name, blk.itRatePct, blk.openingIt, blk.additionsTotal, blk.itDepreciation, blk.closingIt, blk.lifeYears, blk.openingCos, blk.cosDepreciationTotal, blk.closingCos]);

  ws.addRow([]);
  header(ws, ['Due date', 'Quarter', 'Basis', 'Months on actuals', 'Tax for the year', 'Cumulative %', 'Cumulative due', 'Paid earlier', 'Instalment payable', 'Actual paid']);
  for (const i of advanceTaxSchedule(state.settings, state.rows, r, actuals)) plainRow(ws, [i.dueLabel, i.quarter, i.basis, i.monthsOnActuals, i.taxForYear, `${i.cumulativePct}%`, i.cumulativeDue, i.paidBefore, i.payable, i.actualPaid ?? '']);
  ws.views = [];
}

/** One block per month that has a status: budget, actual, variance and reason by line. */
function writeVariance(wb: ExcelJS.Workbook, state: BudgetState, r: BudgetResult, data: VarianceData) {
  const s = state.settings;
  const used = data.months.filter((m) => m.status !== 'open');
  if (!used.length) return;
  const ws = wb.addWorksheet('Variance');
  ws.columns = [{ width: 40 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 50 }];
  ws.addRow(['Variance = Budget - Actual. A negative figure means more was spent than budgeted.']);
  for (const m of used) {
    ws.addRow([]);
    ws.addRow([`${r.labels[m.monthIndex]}: ${VARIANCE_STATUS_LABEL[m.status]}`]).font = { bold: true, size: 12 };
    header(ws, ['Line', 'Budget', 'Actual', 'Variance', '%', 'Reason']);
    const budget = monthBudget(state, r, m.monthIndex, m.status === 'approved' ? m.budgetSnapshot : null);
    const entries = new Map(entriesOfMonth(s, data.actuals, m.monthIndex).map((e) => [e.lineId, e]));
    for (const g of r.groups) {
      for (const id of g.lineIds) {
        const b = budget.lines[id] ?? 0;
        const e = entries.get(id);
        const a = e?.amount ?? null;
        plainRow(ws, [s.lines.find((x) => x.id === id)?.name ?? id, b, a ?? '', a == null ? '' : b - a, a == null || !b ? '' : `${(((b - a) / b) * 100).toFixed(1)}%`, e?.reason ?? '']);
      }
    }
    const a = m.advanceTaxPaid;
    plainRow(ws, ['Advance tax', budget.advanceTax, a ?? '', a == null ? '' : budget.advanceTax - a, '', m.advanceTaxReason ?? '']);
    plainRow(ws, ['Closing headcount', budget.headcount, m.headcount ?? '', '', '', '']);
  }
  ws.views = [];
}

/** The whole budget this viewer may see. `sections` limits the fill-in sheets. */
export async function budgetWorkbook(state: BudgetState, options: { sections: BudgetSection[]; master: boolean; variance?: VarianceData | null }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  if (options.master) {
    const result = computeBudget(state);
    writeMaster(wb, state, result);
    writeViews(wb, state, result);
    const actuals = options.variance ? taxActualsOf(state.settings, options.variance.months, options.variance.actuals) : null;
    writeAdvanceTax(wb, state, result, actuals?.approved.some(Boolean) ? actuals : null);
    if (options.variance) writeVariance(wb, state, result, options.variance);
  }
  writeFillSheets(wb, state, options.sections);
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** A blank workbook in the import layout, listing the names the budget accepts. */
export async function budgetTemplateWorkbook(settings: BudgetSettings, sections: BudgetSection[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  writeFillSheets(wb, { settings, rows: [] }, sections);
  const names = wb.addWorksheet('Accepted names');
  names.columns = [{ width: 36 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 30 }];
  header(names, ['Master Budget line', 'Department', 'Location', 'Cost basis', 'Frequency']);
  const lists = [settings.lines.map((l) => l.name), settings.departments.map((d) => d.name), settings.locations.map((l) => l.name), Object.values(BENEFIT_BASES).map((b) => b.label), Object.values(FREQUENCIES).map((f) => f.label)];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) names.addRow(lists.map((l) => l[i] ?? ''));
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export interface ImportResult {
  rows: { kind: RowKind; data: BudgetRow['data'] }[];
  /** One line per value that could not be matched, so the person can correct the file. */
  warnings: string[];
  sheets: string[];
}

/** Read the fill-in sheets of a workbook. A sheet that is missing leaves that tab as it is. */
export async function parseBudgetWorkbook(bytes: Uint8Array, settings: BudgetSettings): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  const out: ImportResult = { rows: [], warnings: [], sheets: [] };
  for (const sheet of SHEETS) {
    const ws = wb.getWorksheet(sheet.name);
    if (!ws) continue;
    out.sheets.push(sheet.name);
    const heads = new Map<string, number>();
    ws.getRow(1).eachCell((c, n) => heads.set(text(c.value).toLowerCase(), n));
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const data: Record<string, unknown> = {};
      let hasValue = false;
      for (const col of sheet.columns) {
        const at = heads.get(col.head.toLowerCase());
        const value = at ? row.getCell(at).value : null;
        if (text(value) !== '') hasValue = true;
        col.set(value, data as never, settings);
      }
      for (const f of sheet.monthFields) {
        const series = Array(12).fill(0) as number[];
        MONTHS.forEach((m, i) => {
          const at = heads.get(`${MONTH_PREFIX[f]} ${m}`.toLowerCase());
          if (at) series[i] = number(row.getCell(at).value);
        });
        data[f] = series;
      }
      if (!hasValue) return;
      out.rows.push({ kind: sheet.kind, data: data as unknown as BudgetRow['data'] });
      const lineAt = heads.get('master budget line');
      if (lineAt && text(row.getCell(lineAt).value) && !data.lineId) out.warnings.push(`${sheet.name} row ${n}: no budget line is named "${text(row.getCell(lineAt).value)}".`);
      const deptAt = heads.get('department');
      if (deptAt && text(row.getCell(deptAt).value) && !data.departmentId) out.warnings.push(`${sheet.name} row ${n}: no department is named "${text(row.getCell(deptAt).value)}".`);
    });
  }
  return out;
}

/* ------------------------------------------------------------------ actual cost files */

export interface ParsedActual {
  ledger: string;
  /** `YYYY-MM`. */
  period: string;
  amount: number;
  reason: string | null;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let cell = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** A month as `YYYY-MM`, from a date, `2027-04`, `Apr-27`, `Apr 2027` or a bare `Apr` in this year. */
function periodOf(value: unknown, settings: BudgetSettings): string {
  if (value instanceof Date) return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  const v = text(value);
  const iso = /^(\d{4})-(\d{1,2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const named = /^([A-Za-z]{3})[A-Za-z]*[\s\-/']*(\d{2,4})?$/.exec(v);
  if (!named) return '';
  const m = monthNumber(named[1]);
  if (!m) return '';
  if (named[2]) return `${named[2].length === 2 ? `20${named[2]}` : named[2]}-${String(m).padStart(2, '0')}`;
  const year = m >= settings.fyStartMonth ? settings.fyStartYear : settings.fyStartYear + 1;
  return `${year}-${String(m).padStart(2, '0')}`;
}

/**
 * Read an accounts export (.xlsx or .csv, from Tally, Zoho or payroll). Two layouts work: one row
 * per ledger and month (columns Month, Ledger, Amount, and optionally Reason), or one row per
 * ledger with a column for each month.
 */
export async function parseActualsFile(bytes: Uint8Array, fileName: string, settings: BudgetSettings): Promise<ParsedActual[]> {
  let grid: unknown[][];
  if (/\.csv$/i.test(fileName)) grid = parseCsv(new TextDecoder().decode(bytes));
  else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    grid = [];
    ws?.eachRow((row) => grid.push((row.values as unknown[]).slice(1)));
  }
  const headAt = grid.findIndex((row) => row.filter((c) => text(c) !== '').length >= 2);
  if (headAt < 0) return [];
  const heads = grid[headAt].map((c) => text(c).toLowerCase());
  const find = (...names: string[]) => heads.findIndex((h) => names.some((n) => h.includes(n)));
  const ledgerAt = Math.max(find('ledger', 'account', 'particular', 'line', 'head'), 0);
  const monthAt = find('month', 'period', 'date');
  const amountAt = find('amount', 'debit', 'value', 'actual');
  const reasonAt = find('reason', 'note', 'remark');
  const out: ParsedActual[] = [];
  if (monthAt >= 0 && amountAt >= 0) {
    for (const row of grid.slice(headAt + 1)) {
      const ledger = text(row[ledgerAt]);
      const period = periodOf(row[monthAt], settings);
      if (ledger && period) out.push({ ledger, period, amount: number(row[amountAt]), reason: reasonAt >= 0 ? text(row[reasonAt]) || null : null });
    }
    return out;
  }
  const monthColumns = grid[headAt].map((c, i) => ({ i, period: i === ledgerAt ? '' : periodOf(c, settings) })).filter((c) => c.period);
  for (const row of grid.slice(headAt + 1)) {
    const ledger = text(row[ledgerAt]);
    if (!ledger) continue;
    for (const c of monthColumns) {
      const amount = number(row[c.i]);
      if (amount) out.push({ ledger, period: c.period, amount, reason: null });
    }
  }
  return out;
}
