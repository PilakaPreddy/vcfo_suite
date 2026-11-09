import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ComponentProps } from 'react';
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { computeBudget, rollUp, sumSeries, toReportCurrency, type BudgetResult } from './engine';
import { fyName, type BudgetState, type BudgetStatus } from './model';

/**
 * The board pack: the budget by quarter, headcount, departments and cash, on A4 landscape, with the
 * approval on the first page. It reads only what the engine returns, so it matches the screen.
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

function Pack({ state, r, status, version, approvedByName, approvedAt, companyName, logo }: { state: BudgetState; r: BudgetResult; status: BudgetStatus; version: number; approvedByName: string | null; approvedAt: string | null; companyName: string; logo: string | null }) {
  const st = state.settings;
  const report = toReportCurrency(st, r.grandTotal);
  const taxOn = st.tax.mode === 'cost_plus';
  const standing = status === 'approved' ? `Approved by ${approvedByName ?? 'the client'}${approvedAt ? ` on ${approvedAt.slice(0, 10)}` : ''}, version ${version}` : status === 'published' ? `Version ${version}, waiting for approval` : 'Draft, not published';
  return (
    <Document title={`${companyName} budget ${fyName(st)}`} author="VCFO Suite">
      <Page size="A4" orientation="landscape" style={s.page}>
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
    </Document>
  );
}

export async function renderBudgetPdf(input: { state: BudgetState; status: BudgetStatus; version: number; approvedByName: string | null; approvedAt: string | null; companyName: string }): Promise<Uint8Array> {
  const r = computeBudget(input.state);
  const buffer = await renderToBuffer(<Pack {...input} r={r} logo={loadLogo()} />);
  return new Uint8Array(buffer);
}
