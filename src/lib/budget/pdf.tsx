import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ComponentProps, ReactNode } from 'react';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { computeBudget, rollUp, sumSeries, toReportCurrency, type BudgetResult } from './engine';
import { fyName, type BudgetState, type BudgetStatus } from './model';
import { advanceTaxSchedule, computeTax, type TaxActuals, type TaxCalc } from './tax';
import { VARIANCE_STATUS_LABEL, entriesOfMonth, monthBudget, taxActualsOf, type VarianceData } from './variance';

/**
 * The board pack: the budget by quarter, headcount, departments and cash, on A4 landscape, with the
 * approval on the first page. It reads only what the engine returns, so it matches the screen.
 * When income tax is on it adds the advance tax computation and instalments, and when the viewer
 * may see the Variance tab it adds one summary line for each month that has a status.
 */

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2433' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, borderBottom: '1pt solid #d9dde6', paddingBottom: 8 },
  logo: { width: 100, height: 26, objectFit: 'contain' },
  headerText: { marginLeft: 'auto', textAlign: 'right' },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#5b6478' },
  h: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 5 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tile: { flex: 1, border: '1pt solid #d9dde6', borderRadius: 4, padding: 8 },
  tileLabel: { fontSize: 7.5, color: '#5b6478' },
  tileValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #e6e9f0', paddingVertical: 2.5 },
  head: { backgroundColor: '#eef1f6', fontFamily: 'Helvetica-Bold' },
  total: { backgroundColor: '#f4f5f8', fontFamily: 'Helvetica-Bold' },
  grp: { fontFamily: 'Helvetica-Bold', marginTop: 3 },
  name: { flex: 3, paddingLeft: 3 },
  cell: { flex: 1, textAlign: 'right', paddingRight: 3 },
  wide: { flex: 4, paddingLeft: 3 },
  neg: { color: '#b42318' },
  note: { fontSize: 7.5, color: '#5b6478', marginTop: 4 },
  footer: { position: 'absolute', bottom: 16, left: 32, right: 32, fontSize: 7.5, color: '#5b6478', textAlign: 'center' },
});

const inr = (n: number): string => {
  const r = Math.round(n);
  if (!r) return '-';
  const text = new Intl.NumberFormat('en-IN').format(Math.abs(r));
  return r < 0 ? `(${text})` : text;
};
const crore = (n: number): string => (Math.abs(n) >= 1e7 ? `Rs ${(n / 1e7).toFixed(2)} Cr` : Math.abs(n) >= 1e5 ? `Rs ${(n / 1e5).toFixed(2)} L` : `Rs ${inr(n)}`);

function loadLogo(): string | null {
  try {
    return `data:image/png;base64,${readFileSync(path.join(process.cwd(), 'public', 'sbc-logo-light.png')).toString('base64')}`;
  } catch {
    return null;
  }
}

function Line({ label, series, style }: { label: string; series: number[]; style?: ComponentProps<typeof View>['style'] }) {
  return (
    <View style={style ? [s.row, style] : s.row} wrap={false}>
      <Text style={s.name}>{label}</Text>
      {rollUp(series, 3).map((v, i) => (
        <Text key={i} style={s.cell}>
          {inr(v)}
        </Text>
      ))}
      <Text style={s.cell}>{inr(sumSeries(series))}</Text>
    </View>
  );
}

function Head({ first }: { first: string }) {
  return (
    <View style={[s.row, s.head]} fixed>
      <Text style={s.name}>{first}</Text>
      {['Q1', 'Q2', 'Q3', 'Q4', 'Year'].map((h) => (
        <Text key={h} style={s.cell}>
          {h}
        </Text>
      ))}
    </View>
  );
}

function Table({ heads, rows, widths }: { heads: string[]; rows: { cells: string[]; bold?: boolean; neg?: number[] }[]; widths?: number[] }) {
  const style = (i: number) => (i === 0 ? [s.name, widths ? { flex: widths[0] } : {}] : [s.cell, widths ? { flex: widths[i] ?? 1 } : {}]);
  return (
    <>
      <View style={[s.row, s.head]} fixed>
        {heads.map((h, i) => (
          <Text key={h + i} style={style(i)}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={r.bold ? [s.row, s.total] : s.row} wrap={false}>
          {r.cells.map((c, i) => (
            <Text key={i} style={r.neg?.includes(i) ? [...style(i), s.neg] : style(i)}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </>
  );
}

/** The income tax computation (budget against latest estimate) and the four instalments. */
function AdvanceTaxPage({ state, r, actuals, header }: { state: BudgetState; r: BudgetResult; actuals: TaxActuals | null; header: ReactNode }) {
  const budget: TaxCalc = r.taxDetail;
  const latest = actuals ? computeTax(state.settings, state.rows, r, actuals) : budget;
  const b = budget.totals;
  const l = latest.totals;
  const rows: { cells: string[]; bold?: boolean; neg?: number[] }[] = [];
  const line = (label: string, bv: number, lv: number, bold = false) => rows.push({ cells: [label, inr(bv), inr(lv), inr(lv - bv)], bold });
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
  const schedule = advanceTaxSchedule(state.settings, state.rows, r, actuals);
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      {header}
      <Text style={s.h}>Income tax computation (INR)</Text>
      <Text style={s.muted}>
        {`Effective rate ${(latest.effectiveRate * 100).toFixed(3)}% (${latest.ratePct}% with ${latest.surchargePct}% surcharge and ${latest.cessPct}% cess). ${actuals ? 'The latest estimate uses the approved months of the Variance tab.' : 'No month is approved yet, so the latest estimate equals the budget.'}`}
      </Text>
      <Table heads={['Line', 'Budget', 'Latest estimate', 'Change']} rows={rows} widths={[4, 1, 1, 1]} />
      <Text style={s.h}>Advance tax instalments (INR)</Text>
      <Table
        heads={['Due date', 'Quarter', 'Basis', 'Tax for the year', 'Cumulative %', 'Cumulative due', 'Paid earlier', 'Payable', 'Actual paid']}
        rows={schedule.map((i) => ({ cells: [i.dueLabel, i.quarter, i.basis, inr(i.taxForYear), `${i.cumulativePct}%`, inr(i.cumulativeDue), inr(i.paidBefore), inr(i.payable), i.actualPaid == null ? '' : inr(i.actualPaid)] }))}
        widths={[1.4, 1, 1, 1.2, 1, 1.2, 1.2, 1.2, 1.2]}
      />
      <Text style={s.note}>An estimate under the Income-tax Act 2025. It has no marginal relief, MAT, TDS or TCS credit, or interest for late payment. It is not tax advice.</Text>
      <Text style={s.footer} fixed>
        Prepared with VCFO Suite.
      </Text>
    </Page>
  );
}

/** One line for each month of the Variance tab that has a status: totals, variance and headcount. */
function VariancePage({ state, r, data, header }: { state: BudgetState; r: BudgetResult; data: VarianceData; header: ReactNode }) {
  const st = state.settings;
  const used = data.months.filter((m) => m.status !== 'open');
  const rows = used.map((m) => {
    const budget = monthBudget(state, r, m.monthIndex, m.status === 'approved' ? m.budgetSnapshot : null);
    const entries = entriesOfMonth(st, data.actuals, m.monthIndex);
    const bTotal = Object.values(budget.lines).reduce((a, v) => a + v, 0);
    const aTotal = entries.reduce((a, e) => a + (e.amount ?? 0), 0);
    const v = bTotal - aTotal;
    const over = entries.filter((e) => e.amount != null && e.amount > (budget.lines[e.lineId] ?? 0) + 0.5).length;
    return {
      cells: [r.labels[m.monthIndex], VARIANCE_STATUS_LABEL[m.status], inr(bTotal), inr(aTotal), inr(v), bTotal ? `${((v / bTotal) * 100).toFixed(1)}%` : '', String(over), inr(budget.advanceTax), m.advanceTaxPaid == null ? '' : inr(m.advanceTaxPaid), String(budget.headcount), m.headcount == null ? '' : String(m.headcount)],
      neg: v < -0.5 ? [4, 5] : [],
    };
  });
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      {header}
      <Text style={s.h}>Variance by month (INR)</Text>
      <Text style={s.muted}>Variance = Budget - Actual. A negative figure means more was spent than budgeted. An approved month uses the budget kept when it was approved.</Text>
      <Table
        heads={['Month', 'Status', 'Budget', 'Actual', 'Variance', '%', 'Lines over', 'Advance tax budget', 'Advance tax paid', 'Headcount budget', 'Headcount actual']}
        rows={rows}
        widths={[1, 1.1, 1.2, 1.2, 1.2, 0.8, 0.8, 1.2, 1.2, 1, 1]}
      />
      <Text style={s.footer} fixed>
        Prepared with VCFO Suite.
      </Text>
    </Page>
  );
}

function Pack({ state, r, status, version, approvedByName, approvedAt, companyName, logo, variance }: { state: BudgetState; r: BudgetResult; status: BudgetStatus; version: number; approvedByName: string | null; approvedAt: string | null; companyName: string; logo: string | null; variance: VarianceData | null }) {
  const st = state.settings;
  const report = toReportCurrency(st, r.grandTotal);
  const taxOn = st.tax.mode === 'cost_plus';
  const taxActuals = variance ? taxActualsOf(st, variance.months, variance.actuals) : null;
  const hasVariance = !!variance && variance.months.some((m) => m.status !== 'open');
  const standing = status === 'approved' ? `Approved by ${approvedByName ?? 'the client'}${approvedAt ? ` on ${approvedAt.slice(0, 10)}` : ''}, version ${version}` : status === 'published' ? `Version ${version}, waiting for approval` : 'Draft, not published';
  const header = (
    <View style={s.header} fixed>
      {logo ? <Image style={s.logo} src={logo} /> : null}
      <View style={s.headerText}>
        <Text style={s.title}>
          {st.title}: {companyName}
        </Text>
        <Text style={s.muted}>
          {fyName(st)} · {standing}
        </Text>
      </View>
    </View>
  );
  return (
    <Document title={`${companyName} budget ${fyName(st)}`} author="VCFO Suite">
      <Page size="A4" orientation="landscape" style={s.page}>
        {header}
        <View style={s.tiles}>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Total cost</Text>
            <Text style={s.tileValue}>{crore(sumSeries(r.grandTotal))}</Text>
            {report ? <Text style={s.muted}>{`${st.reportCurrency} ${inr(sumSeries(report))}`}</Text> : null}
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Operating cost</Text>
            <Text style={s.tileValue}>{crore(sumSeries(r.operating))}</Text>
          </View>
          {taxOn ? (
            <View style={s.tile}>
              <Text style={s.tileLabel}>Income tax (estimate)</Text>
              <Text style={s.tileValue}>{crore(sumSeries(r.tax))}</Text>
            </View>
          ) : null}
          <View style={s.tile}>
            <Text style={s.tileLabel}>Closing headcount</Text>
            <Text style={s.tileValue}>{Math.round(r.headcount.closing[11])}</Text>
            <Text style={s.muted}>{`${Math.round(sumSeries(r.headcount.joiners))} joiners, ${Math.round(sumSeries(r.headcount.exits))} exits`}</Text>
          </View>
          <View style={s.tile}>
            <Text style={s.tileLabel}>Cost per employee per month</Text>
            <Text style={s.tileValue}>{crore(r.costPerEmployeeMonth)}</Text>
          </View>
        </View>
        <Text style={s.h}>Budget by line (INR)</Text>
        <Head first="Line" />
        {r.groups.map((g) => (
          <View key={g.group}>
            <Text style={s.grp}>{g.group}</Text>
            {g.lineIds
              .filter((id) => sumSeries(r.lines[id]) !== 0)
              .map((id) => (
                <Line key={id} label={st.lines.find((l) => l.id === id)?.name ?? id} series={r.lines[id]} />
              ))}
            <Line label={`Total ${g.group}`} series={g.total} style={s.total} />
          </View>
        ))}
        <Line label="Total operating cost" series={r.operating} style={s.total} />
        {taxOn ? <Line label="Income tax (estimate)" series={r.tax} /> : null}
        <Line label="Total cost" series={r.grandTotal} style={s.total} />
        <Text style={s.footer} fixed>
          {taxOn ? 'Income tax is an estimate from the assumptions in the budget. It is not tax advice. ' : ''}Prepared with VCFO Suite.
        </Text>
      </Page>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h}>Cost by department (INR)</Text>
        <Head first="Department" />
        {r.byDepartment.map((d) => (
          <Line key={d.id || 'shared'} label={d.name} series={d.total} />
        ))}
        {r.byLocation.length > 1 ? (
          <>
            <Text style={s.h}>Cost by location (INR)</Text>
            <Head first="Location" />
            {r.byLocation.map((d) => (
              <Line key={d.id || 'shared'} label={d.name} series={d.total} />
            ))}
          </>
        ) : null}
        <Text style={s.h}>Cash flow (INR)</Text>
        <Head first="Cash" />
        <Line label="Payments" series={r.cash.outflow} />
        <Line label="Funds to request" series={r.cash.fundsRequest} style={s.total} />
        <Text style={s.footer} fixed>
          Prepared with VCFO Suite.
        </Text>
      </Page>
      {taxOn ? <AdvanceTaxPage state={state} r={r} actuals={taxActuals?.approved.some(Boolean) ? taxActuals : null} header={header} /> : null}
      {hasVariance && variance ? <VariancePage state={state} r={r} data={variance} header={header} /> : null}
    </Document>
  );
}

export async function renderBudgetPdf(input: { state: BudgetState; status: BudgetStatus; version: number; approvedByName: string | null; approvedAt: string | null; companyName: string; variance?: VarianceData | null }): Promise<Uint8Array> {
  const r = computeBudget(input.state);
  const buffer = await renderToBuffer(<Pack {...input} variance={input.variance ?? null} r={r} logo={loadLogo()} />);
  return new Uint8Array(buffer);
}
