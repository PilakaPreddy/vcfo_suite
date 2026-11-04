import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { FormVerification } from '@/data/labour-registers/types';
import { signatoriesFor, signatureNote } from '@/data/labour-registers/signatories';
import type { ProjectedColumn, ProjectedTable } from '../project';
import { layoutFor, widthFor } from '../xlsx/layouts';
import { verificationNotice } from '../xlsx/scaffold';

/**
 * LABOUR REGISTERS — the register as a printout somebody signs.
 *
 * The workbook is the working copy: it is read on a screen, forwarded, opened in Excel. This
 * is the other half, and it exists because of how a register is actually attested. The firm's
 * decision, taken in November 2026, is that a register is attested by a wet signature on a
 * printout — not a DSC and not an Aadhaar eSign. So the product's job is to produce the sheet
 * that gets printed, signed, sealed and scanned back, and the signature block at the foot of
 * it is not decoration: it is the part of the page the whole flow turns on.
 *
 * Everything above the table is the same frame as the workbook, in the same order, because a
 * register and its printout saying different things would be the worst of both. The
 * verification notice is shared code rather than reimplemented — one wording, two outputs.
 *
 * Three things are specific to print:
 *
 *  - **The heading row repeats.** A twelve-page muster roll whose column headings appear once
 *    is unreadable from page two. react-pdf's `fixed` repeats the row on every page.
 *  - **Columns are proportional, not absolute.** The workbook can scroll; a sheet of A4
 *    cannot. The xlsx widths are reused as weights, so a day column stays narrow beside a name
 *    without either being measured in points.
 *  - **The signature blocks are last and are never split.** A page whose signature line sits
 *    alone after the table has ended is a page somebody signs in the wrong place.
 */

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 44, paddingHorizontal: 24, fontSize: 7.5, fontFamily: 'Helvetica', color: '#1f2733' },
  establishment: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  address: { fontSize: 7.5, color: '#5b6472', marginTop: 1 },
  authority: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginTop: 6 },
  formTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  rule: { fontSize: 7.5, color: '#5b6472', marginTop: 1 },
  period: { fontSize: 8.5, marginTop: 4 },

  notice: { marginTop: 6, padding: 5, borderRadius: 3, fontSize: 7.5 },
  noticeQuiet: { color: '#9a4d00', backgroundColor: '#fff6e8' },
  noticeLoud: { color: '#c0182f', backgroundColor: '#ffe6e9', fontSize: 9, fontFamily: 'Helvetica-Bold' },
  noticeExtra: { color: '#c0182f', fontSize: 7.5, marginTop: 3 },

  table: { marginTop: 8, borderTop: '0.75pt solid #9aa3b0', borderLeft: '0.75pt solid #9aa3b0' },
  band: { flexDirection: 'row', backgroundColor: '#eef1f5' },
  head: { flexDirection: 'row', backgroundColor: '#eef1f5' },
  row: { flexDirection: 'row' },
  cell: {
    borderRight: '0.75pt solid #9aa3b0',
    borderBottom: '0.75pt solid #9aa3b0',
    paddingVertical: 2.5,
    paddingHorizontal: 2.5,
  },
  headText: { fontFamily: 'Helvetica-Bold', fontSize: 6.5 },
  /* A day cell holds at most two characters — P, A, WO, HP — in a column a month wide has to
     be narrow. The padding comes off and the type comes down, because "WO" set at the body
     size in a full-padded cell runs over its right border and into the next day. */
  dayCell: { paddingHorizontal: 0.5 },
  dayText: { fontSize: 5.8, textAlign: 'center' },
  right: { textAlign: 'right' },
  centre: { textAlign: 'center' },

  notes: { marginTop: 8 },
  note: { fontSize: 7, color: '#5b6472', marginBottom: 1.5 },

  signWrap: { marginTop: 22 },
  signNote: { fontSize: 7, color: '#5b6472', marginBottom: 10 },
  signRow: { flexDirection: 'row', gap: 28 },
  signBlock: { flex: 1 },
  signLine: { borderTop: '0.75pt solid #1f2733', marginTop: 34, paddingTop: 3 },
  signLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  signSub: { fontSize: 6.5, color: '#5b6472', marginTop: 1 },
  signDate: { fontSize: 6.5, color: '#5b6472', marginTop: 6 },

  footer: { position: 'absolute', bottom: 20, left: 24, right: 24, flexDirection: 'row', fontSize: 6.5, color: '#5b6472' },
});

export interface RegisterPdfMeta {
  establishmentName: string;
  establishmentAddress: string;
  periodLabel: string;
  generatedAt: string;
  generatorRevision: string;
  cacheKey: string;
  /** The firm's verdict, where it has one. Left out, the catalogue's claim prints. */
  verification?: FormVerification;
}

/** Text alignment follows the kind of value, as it does in the workbook. */
function align(column: ProjectedColumn) {
  if (column.day !== undefined) return s.centre;
  switch (column.kind) {
    case 'money':
    case 'number':
    case 'hours':
    case 'days':
      return s.right;
    default:
      return undefined;
  }
}

/**
 * The band row, with the day columns collapsed into one cell spanning all of them.
 *
 * A PDF has no merged cells, so "Days of the month" has to be drawn as a single wide box
 * covering the run of day columns rather than written into the first of them. Printed into one
 * narrow column it wraps to four lines and reads as a heading for day 1 alone, which is what
 * the first version of this did.
 */
function bandCells(
  columns: ProjectedColumn[],
  weights: number[],
  total: number,
): Array<{ text: string; width: string; band: boolean }> {
  const out: Array<{ text: string; width: string; band: boolean }> = [];
  let i = 0;
  while (i < columns.length) {
    if (columns[i].day === undefined) {
      out.push({ text: columns[i].heading, width: `${((weights[i] / total) * 100).toFixed(3)}%`, band: false });
      i += 1;
      continue;
    }
    /* The whole run of day columns, however long the month is, as one cell. */
    const from = i;
    let span = 0;
    while (i < columns.length && columns[i].day !== undefined) {
      span += weights[i];
      i += 1;
    }
    out.push({
      text: columns[from].band ?? '',
      width: `${((span / total) * 100).toFixed(3)}%`,
      band: true,
    });
  }
  return out;
}

/**
 * A wage slip as pages: one per employee, labels down the left.
 *
 * The frame repeats on every slip rather than appearing once at the top, because a slip torn
 * off a stack has to say on its own which establishment issued it, under what rule and for
 * which period. The register path below prints the frame once and the table under it.
 */
function WageSlipPages({ table, meta }: { table: ProjectedTable; meta: RegisterPdfMeta }) {
  const { form, columns, rows } = table;
  const verification = meta.verification ?? form.verification;
  const disputed = verification.status === 'disputed';
  const notice = verificationNotice(table, meta.verification);
  const nameAt = columns.findIndex((c) => c.field === 'name');
  const codeAt = columns.findIndex((c) => c.field === 'employeeId');

  return (
    <>
      {rows.map((values, r) => {
        const who =
          [nameAt >= 0 ? String(values[nameAt] ?? '') : '', codeAt >= 0 ? String(values[codeAt] ?? '') : '']
            .filter(Boolean)
            .join(' · ') || `Employee ${r + 1}`;

        return (
          <Page key={`slip-${r}`} size="A4" style={s.page}>
            <View>
              <Text style={s.establishment}>{meta.establishmentName || 'Establishment'}</Text>
              {meta.establishmentAddress ? <Text style={s.address}>{meta.establishmentAddress}</Text> : null}
              <Text style={s.authority}>{form.authorityLine}</Text>
              <Text style={s.formTitle}>
                Form {form.formNumber} — {form.title}
              </Text>
              <Text style={s.rule}>
                {form.rule} · {form.act}
              </Text>
              <Text style={s.period}>Period: {meta.periodLabel}</Text>
            </View>

            <View style={[s.notice, disputed ? s.noticeLoud : s.noticeQuiet]}>
              <Text>{notice}</Text>
            </View>

            <View style={s.table}>
              <View style={s.head}>
                <View style={[s.cell, { width: '62%' }]}>
                  <Text style={[s.headText, { fontSize: 8 }]}>Employee</Text>
                </View>
                <View style={[s.cell, { width: '38%' }]}>
                  <Text style={[s.headText, { fontSize: 8 }]}>{who}</Text>
                </View>
              </View>

              {columns.map((col, i) =>
                i === nameAt || i === codeAt || col.source === 'signature' ? null : (
                  <View key={`slip-${r}-${i}`} style={s.row}>
                    <View style={[s.cell, { width: '62%' }]}>
                      <Text style={{ fontSize: 8.5, color: '#5b6472' }}>{col.heading}</Text>
                    </View>
                    <View style={[s.cell, { width: '38%' }]}>
                      <Text style={[{ fontSize: 9 }, align(col)]}>
                        {values[i] === null || values[i] === undefined ? '' : String(values[i])}
                      </Text>
                    </View>
                  </View>
                ),
              )}
            </View>

            <View style={s.signWrap} wrap={false}>
              <View style={s.signRow}>
                {[...signatoriesFor(form), { label: 'Received by the employee', note: 'Signature or thumb impression' }].map(
                  (block) => (
                    <View key={block.label} style={s.signBlock}>
                      <View style={s.signLine}>
                        <Text style={s.signLabel}>{block.label}</Text>
                        <Text style={s.signSub}>{block.note}</Text>
                        <Text style={s.signDate}>Date:</Text>
                      </View>
                    </View>
                  ),
                )}
              </View>
            </View>

            <View style={s.footer} fixed>
              <Text>
                Form {form.formNumber} · {meta.periodLabel} · generator {meta.generatorRevision} · key{' '}
                {meta.cacheKey.slice(0, 12)}
              </Text>
              <Text style={{ marginLeft: 'auto' }}>{who}</Text>
            </View>
          </Page>
        );
      })}
    </>
  );
}

export function RegisterDocument({ table, meta }: { table: ProjectedTable; meta: RegisterPdfMeta }) {
  const { form, columns, rows } = table;
  const layout = layoutFor(form.archetype);
  const verification = meta.verification ?? form.verification;
  const disputed = verification.status === 'disputed';
  const notice = verificationNotice(table, meta.verification);
  const signatories = signatoriesFor(form);
  const note = signatureNote(form);

  /* The xlsx widths become proportional weights. Nothing is measured in points: a form with
     eleven columns and one with forty both have to fit the same sheet of paper.
     A date is widened past the workbook's own figure: "2026-10-07" cannot be hyphenated, so a
     date column narrower than its contents runs over its border instead of wrapping. */
  const weights = columns.map((c) =>
    c.kind === 'date' && c.day === undefined ? 19 : widthFor(layout, c.kind, c.source, c.day !== undefined),
  );
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => `${((w / total) * 100).toFixed(3)}%`);

  /* A band row is printed only when the grid is actually expanded. `in-mw-muster` is a muster
     roll with no day columns at all, and a band above nothing would be a header for a column
     that is not there. */
  const bandRun = columns.some((c) => c.day !== undefined);

  /* The heading size falls as the table widens. A prescribed heading like "Employee state
     insurance" has to fit a column one twenty-sixth of a page, and the writer hyphenates but
     cannot set type smaller on its own; left at the body size it runs into its neighbour. */
  const headSize = columns.filter((c) => c.day === undefined).length > 18 ? 5.6 : 6.5;

  if (form.archetype === 'wageSlip') {
    return (
      <Document title={`Form ${form.formNumber} — ${form.title}`} author={meta.establishmentName}>
        <WageSlipPages table={table} meta={meta} />
      </Document>
    );
  }

  return (
    <Document title={`Form ${form.formNumber} — ${form.title}`} author={meta.establishmentName}>
      <Page size="A4" orientation={layout.orientation} style={s.page} wrap>
        <View>
          <Text style={s.establishment}>{meta.establishmentName || 'Establishment'}</Text>
          {meta.establishmentAddress ? <Text style={s.address}>{meta.establishmentAddress}</Text> : null}
          <Text style={s.authority}>{form.authorityLine}</Text>
          <Text style={s.formTitle}>
            Form {form.formNumber} — {form.title}
          </Text>
          <Text style={s.rule}>
            {form.rule} · {form.act}
          </Text>
          <Text style={s.period}>Period: {meta.periodLabel}</Text>
        </View>

        <View style={[s.notice, disputed ? s.noticeLoud : s.noticeQuiet]}>
          <Text>{notice}</Text>
          {disputed ? (
            <Text style={s.noticeExtra}>
              This register is produced so that the period is not left short of it. Check the layout against the
              prescribed form before it is filed or handed to an inspector.
            </Text>
          ) : null}
        </View>

        <View style={s.table}>
          {bandRun ? (
            <View style={s.band} fixed>
              {bandCells(columns, weights, total).map((cell, i) => (
                <View key={`band-${i}`} style={[s.cell, { width: cell.width }]}>
                  <Text style={[s.headText, { fontSize: headSize }, cell.band ? s.centre : undefined]}>{cell.text}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={s.head} fixed>
            {columns.map((c, i) => (
              <View
                key={`head-${c.field}-${i}`}
                style={c.day !== undefined ? [s.cell, s.dayCell, { width: widths[i] }] : [s.cell, { width: widths[i] }]}
              >
                <Text style={[s.headText, { fontSize: c.day === undefined ? headSize : 5.8 }, c.day !== undefined ? s.centre : undefined]}>
                  {bandRun && c.day === undefined ? '' : c.day !== undefined ? String(c.day) : c.heading}
                </Text>
              </View>
            ))}
          </View>

          {rows.map((values, r) => (
            <View key={`r${r}`} style={s.row} wrap={false}>
              {columns.map((c, i) => (
                <View
                  key={`c${r}-${i}`}
                  style={c.day !== undefined ? [s.cell, s.dayCell, { width: widths[i] }] : [s.cell, { width: widths[i] }]}
                >
                  <Text style={c.day !== undefined ? s.dayText : align(c)}>
                    {values[i] === null || values[i] === undefined ? '' : String(values[i])}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {table.notes.length ? (
          <View style={s.notes}>
            {table.notes.map((n, i) => (
              <Text key={`n${i}`} style={s.note}>
                {n}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={s.signWrap} wrap={false}>
          {note ? <Text style={s.signNote}>{note}</Text> : null}
          <View style={s.signRow}>
            {signatories.map((block) => (
              <View key={block.label} style={s.signBlock}>
                <View style={s.signLine}>
                  <Text style={s.signLabel}>{block.label}</Text>
                  <Text style={s.signSub}>{block.note}</Text>
                  <Text style={s.signDate}>Date:</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>
            Form {form.formNumber} · {meta.periodLabel} · generated {meta.generatedAt.slice(0, 10)} · generator{' '}
            {meta.generatorRevision} · key {meta.cacheKey.slice(0, 12)}
          </Text>
          <Text style={{ marginLeft: 'auto' }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
