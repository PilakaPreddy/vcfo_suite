/**
 * LABOUR REGISTERS — writing one register as a workbook.
 *
 * Every register the catalogue describes is the same shape on the page: who the establishment
 * is, under what authority the form is kept, the prescribed columns in the prescribed order,
 * one row per employee, and a note of what went out blank and why. So there is one writer, and
 * `layouts.ts` holds the handful of values that differ between archetypes.
 *
 * ## Two things this file must keep doing
 *
 * **It prints the verification notice.** Not one form in the catalogue is `gazette-verified` —
 * the research behind it ran without access to indiacode.nic.in or a state labour department,
 * and `types.ts` says the generator must print that state rather than imply an authority
 * nobody checked. It is the most important line on the sheet and it goes above the table, not
 * in a footnote, because a register handed to an inspector should not overstate itself.
 *
 * **It is printable.** The Labour Laws (Exemption) Act as amended in 2014 permits an
 * electronic register provided a printout is produced to an inspector on demand. So the page
 * setup here is not a nicety: A4, fitted to one page wide, with the heading row repeated on
 * every printed page and the identity columns frozen. A thirty-column register that prints
 * across four unlabelled pages does not satisfy the requirement in any useful sense.
 *
 * ## Versioning
 *
 * Changing the layout of one archetype bumps that archetype's entry in `version.ts`, which
 * re-keys only its forms. Changing anything in *this* file changes the bytes of every register,
 * so it bumps `GENERATOR_REVISION` in `cache-key.ts` instead, which re-keys all of them. Get
 * that wrong and stored documents silently stop matching what the code would now produce.
 */
import ExcelJS from 'exceljs';

import type { EstablishmentMaster } from '../dataset';
import type { ProjectedColumn, ProjectedTable } from '../project';
import { layoutFor, numberFormat, widthFor } from './layouts';

export interface WorkbookMeta {
  establishment: EstablishmentMaster;
  /** "September 2026", or a date range for a quarter. */
  periodLabel: string;
  /** ISO timestamp the document was produced at. */
  generatedAt: string;
  generatorRevision: string;
  /** The content address, so a printed sheet can be traced back to its evidence. */
  cacheKey: string;
}

/** A4, as exceljs numbers paper sizes. */
const A4 = 9;

const INK = 'FF1F2733';
const MUTED = 'FF4A5462';
const WARNING = 'FF9A4D00';
const HEAD_FILL = 'FFEEF1F5';
const LINE = 'FFD6DBE3';

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
};

/**
 * What to say about how far this form has been checked.
 *
 * Written out rather than abbreviated: somebody reading the printed sheet months later has no
 * access to the catalogue, and "unverified" on its own does not say unverified against what.
 */
export function verificationNotice(table: ProjectedTable): string {
  const { status, on, against, open } = table.form.verification;
  const openPart = open?.length ? ` Still open: ${open.join(', ')}.` : '';

  if (status === 'gazette-verified') {
    return `Layout verified against the gazette${on ? ` on ${on}` : ''}.${openPart}`;
  }
  if (status === 'checked-against-sample') {
    return `Layout checked against ${against ?? 'a filed sample'}${on ? ` on ${on}` : ''}, not against the gazette.${openPart}`;
  }
  return `Layout not verified against the gazette or the prescribed form.${openPart}`;
}

/** A sheet name Excel will accept: 31 characters, none of []:*?/\\ */
export function sheetName(formNumber: string): string {
  const cleaned = `Form ${formNumber}`.replace(/[[\]:*?/\\]/g, '-').trim();
  return cleaned.slice(0, 31) || 'Register';
}

/** Where the identity columns stop, so the frozen pane and the repeated columns know. */
function freezeAt(columns: ProjectedColumn[], afterField: string): number {
  const at = columns.findIndex((c) => c.field === afterField);
  /* A form with no such column still freezes the serial number, if it has one. */
  if (at >= 0) return at + 1;
  const serial = columns.findIndex((c) => c.field === 'serial');
  return serial >= 0 ? serial + 1 : 0;
}

/** The grid columns, if this form has any. Asked of the table, never of the archetype. */
function gridRun(columns: ProjectedColumn[]): { first: number; last: number; band: string } | null {
  const first = columns.findIndex((c) => c.source === 'grid');
  if (first < 0) return null;
  let last = first;
  while (last + 1 < columns.length && columns[last + 1].source === 'grid') last += 1;
  return { first, last, band: columns[first].band ?? 'Days of the period' };
}

function titleRow(ws: ExcelJS.Worksheet, width: number, text: string, style: Partial<ExcelJS.Font>): ExcelJS.Row {
  const row = ws.addRow([text]);
  if (width > 1) ws.mergeCells(row.number, 1, row.number, width);
  row.getCell(1).font = { name: 'Calibri', size: 10, color: { argb: INK }, ...style };
  row.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  return row;
}

export async function writeRegisterWorkbook(table: ProjectedTable, meta: WorkbookMeta): Promise<Buffer> {
  const { form, columns, rows } = table;
  const layout = layoutFor(form.archetype);
  const width = Math.max(columns.length, 1);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  wb.created = new Date(meta.generatedAt);
  const ws = wb.addWorksheet(sheetName(form.formNumber), {
    views: [{ showGridLines: false }],
  });

  /* ── The head ──────────────────────────────────────────────────────────── */
  titleRow(ws, width, meta.establishment.name || 'Establishment', { size: 13, bold: true });
  if (meta.establishment.address) {
    titleRow(ws, width, meta.establishment.address, { size: 9, color: { argb: MUTED } });
  }
  titleRow(ws, width, form.authorityLine, { size: 10, bold: true });
  titleRow(ws, width, `Form ${form.formNumber} — ${form.title}`, { size: 11, bold: true });
  titleRow(ws, width, `${form.rule} · ${form.act}`, { size: 9, color: { argb: MUTED } });
  titleRow(ws, width, `Period: ${meta.periodLabel}`, { size: 10 });

  const notice = titleRow(ws, width, verificationNotice(table), {
    size: 9,
    italic: true,
    color: { argb: WARNING },
  });
  notice.height = 26;

  ws.addRow([]);

  /* ── The headings ──────────────────────────────────────────────────────── */
  const grid = gridRun(columns);
  const bandRow = grid ? ws.addRow(columns.map((c) => (c.source === 'grid' ? '' : c.heading))) : null;
  const headRow = ws.addRow(columns.map((c) => (grid && c.source !== 'grid' ? '' : c.heading)));

  if (bandRow && grid) {
    /* The day numbers sit under one merged band carrying the prescribed heading; every other
       column is merged down through both rows so its heading reads once, not twice. */
    bandRow.getCell(grid.first + 1).value = grid.band;
    ws.mergeCells(bandRow.number, grid.first + 1, bandRow.number, grid.last + 1);
    for (const [i, col] of columns.entries()) {
      if (col.source === 'grid') continue;
      ws.mergeCells(bandRow.number, i + 1, headRow.number, i + 1);
    }
  }

  for (const row of [bandRow, headRow].filter(Boolean) as ExcelJS.Row[]) {
    row.height = 32;
    for (let i = 1; i <= width; i += 1) {
      const cell = row.getCell(i);
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: INK } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
      cell.border = BORDER;
    }
  }

  /* ── The body ──────────────────────────────────────────────────────────── */
  for (const values of rows) {
    const row = ws.addRow(values);
    row.height = layout.rowHeight;
    for (const [i, col] of columns.entries()) {
      const cell = row.getCell(i + 1);
      cell.font = { name: 'Calibri', size: 9, color: { argb: INK } };
      cell.border = BORDER;

      const fmt = numberFormat(col.kind);
      if (fmt && typeof cell.value === 'number') cell.numFmt = fmt;

      cell.alignment = {
        vertical: 'middle',
        horizontal:
          col.source === 'grid' ? 'center' : typeof cell.value === 'number' ? 'right' : 'left',
        wrapText: col.kind === 'text' && col.source !== 'grid',
      };
    }
  }

  /* ── The foot ──────────────────────────────────────────────────────────── */
  ws.addRow([]);
  for (const note of table.notes) {
    titleRow(ws, width, note, { size: 9, color: { argb: MUTED } });
  }
  titleRow(
    ws,
    width,
    `Generated ${meta.generatedAt} · generator ${meta.generatorRevision} · reference ${meta.cacheKey.slice(0, 12)}`,
    { size: 8, color: { argb: MUTED } },
  );

  /* ── Widths, freeze and print setup ────────────────────────────────────── */
  for (const [i, col] of columns.entries()) {
    ws.getColumn(i + 1).width = widthFor(layout, col.kind, col.source, col.day !== undefined);
  }

  const xSplit = freezeAt(columns, layout.freezeAfterField);
  ws.views = [
    {
      state: 'frozen',
      xSplit,
      ySplit: headRow.number,
      showGridLines: false,
    },
  ];

  ws.pageSetup = {
    orientation: layout.orientation,
    paperSize: A4,
    fitToPage: true,
    fitToWidth: 1,
    /* Zero means "as many pages tall as it takes" — a roll of two hundred employees must not
       be squeezed onto one page to satisfy a width rule. */
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    /* The heading row repeats on every printed page. Without it, page two of a wage register
       is thirty columns of unlabelled numbers. */
    printTitlesRow: `${bandRow ? bandRow.number : headRow.number}:${headRow.number}`,
    printTitlesColumn: xSplit > 0 ? `A:${String.fromCharCode(64 + Math.min(xSplit, 26))}` : undefined,
  } as ExcelJS.PageSetup;

  ws.headerFooter = {
    oddFooter: `&L&9${form.id}&C&9${meta.periodLabel}&R&9Page &P of &N`,
  } as ExcelJS.HeaderFooter;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
