import ExcelJS from 'exceljs';

import { signatoriesFor } from '@/data/labour-registers/signatories';
import type { ProjectedTable } from '../project';
import {
  BORDER,
  DANGER,
  DANGER_FILL,
  HEAD_FILL,
  isDisputed,
  LINE,
  MUTED,
  sheetName,
  titleRow,
  verificationNotice,
  WARNING,
  type WorkbookMeta,
} from './scaffold';

/**
 * LABOUR REGISTERS — the wage slip, which is not a register at all.
 *
 * Every other form this product makes is one table: a row per employee, the prescribed columns
 * across. A wage slip is the opposite shape. It is one small document per person, handed to
 * that person, and it has to be readable on its own — the employee receiving it has no access
 * to the register it came from and no interest in anybody else's row.
 *
 * So the projected table is transposed. Each employee's row becomes a block of label-and-value
 * pairs, the blocks are separated by a page break so that printing gives one slip per sheet,
 * and the form's frame is repeated above every block rather than once at the top. Repeating it
 * is the point: a slip torn off the middle of a stack still says which establishment issued
 * it, under what rule, and for which period.
 *
 * The signature line is the employee's own. On a register the employee signs a column to
 * acknowledge payment; on a slip the same acknowledgement is a line at the foot of the slip.
 */
export async function writeWageSlipWorkbook(table: ProjectedTable, meta: WorkbookMeta): Promise<Buffer> {
  const { form, columns, rows } = table;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VCFO Suite';
  wb.created = new Date(meta.generatedAt);

  const ws = wb.addWorksheet(sheetName(form.formNumber), {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  /* Two columns: the prescribed heading, and the figure. Nothing else fits a slip. */
  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 24;

  const disputed = isDisputed(table, meta.verification);
  const notice = verificationNotice(table, meta.verification);
  const employeeName = columns.findIndex((c) => c.field === 'name');
  const employeeCode = columns.findIndex((c) => c.field === 'employeeId');

  /* A slip is a document in its own right, so a form with no name column still produces one
     per employee — identified by the row it came from rather than by nothing. */
  rows.forEach((values, index) => {
    if (index > 0) ws.addRow([]).addPageBreak?.();

    titleRow(ws, 2, meta.establishment.name || 'Establishment', { size: 12, bold: true });
    if (meta.establishment.address) {
      titleRow(ws, 2, meta.establishment.address, { size: 9, color: { argb: MUTED } });
    }
    titleRow(ws, 2, form.authorityLine, { size: 10, bold: true });
    titleRow(ws, 2, `Form ${form.formNumber} — ${form.title}`, { size: 11, bold: true });
    titleRow(ws, 2, `${form.rule} · ${form.act}`, { size: 9, color: { argb: MUTED } });
    titleRow(ws, 2, `Period: ${meta.periodLabel}`, { size: 10 });

    const noticeRow = titleRow(ws, 2, notice, {
      size: disputed ? 11 : 9,
      bold: disputed,
      italic: !disputed,
      color: { argb: disputed ? DANGER : WARNING },
    });
    noticeRow.height = disputed ? 44 : 26;
    if (disputed) {
      for (let i = 1; i <= 2; i += 1) {
        noticeRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DANGER_FILL } };
      }
    }

    ws.addRow([]);

    /* Who it is for, above the figures. A slip whose owner is named halfway down the page is
       a slip somebody hands to the wrong person. */
    const name = employeeName >= 0 ? String(values[employeeName] ?? '') : '';
    const code = employeeCode >= 0 ? String(values[employeeCode] ?? '') : '';
    const who = [name, code].filter(Boolean).join(' · ') || `Employee ${index + 1}`;
    const whoRow = ws.addRow(['Employee', who]);
    whoRow.getCell(1).font = { bold: true, size: 10 };
    whoRow.getCell(2).font = { bold: true, size: 10 };
    for (let i = 1; i <= 2; i += 1) {
      whoRow.getCell(i).border = BORDER;
      whoRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    }

    columns.forEach((col, i) => {
      /* The identity columns are already in the line above; repeating them is noise on a
         document this small. A signature column becomes the line at the foot instead. */
      if (i === employeeName || i === employeeCode || col.source === 'signature') return;

      const row = ws.addRow([col.heading, values[i] ?? '']);
      row.getCell(1).font = { size: 9.5, color: { argb: MUTED } };
      row.getCell(2).font = { size: 10 };
      row.getCell(2).alignment = { horizontal: 'right' };
      if (col.kind === 'money') row.getCell(2).numFmt = '#,##0.00';
      if (col.kind === 'days' || col.kind === 'hours') row.getCell(2).numFmt = '#,##0.0';
      for (let c = 1; c <= 2; c += 1) row.getCell(c).border = BORDER;
    });

    ws.addRow([]);
    for (const block of signatoriesFor(form)) {
      const sign = ws.addRow([block.label, '']);
      sign.getCell(1).font = { size: 9, color: { argb: MUTED } };
      sign.getCell(2).border = { bottom: { style: 'thin', color: { argb: LINE } } };
      sign.height = 30;
    }
    const ack = ws.addRow(['Received by the employee', '']);
    ack.getCell(1).font = { size: 9, color: { argb: MUTED } };
    ack.getCell(2).border = { bottom: { style: 'thin', color: { argb: LINE } } };
    ack.height = 30;

    for (const note of table.notes) {
      titleRow(ws, 2, note, { size: 8, color: { argb: MUTED } });
    }
    titleRow(ws, 2, `Generated ${meta.generatedAt} · generator ${meta.generatorRevision} · key ${meta.cacheKey.slice(0, 12)}`, {
      size: 8,
      color: { argb: MUTED },
    });
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
