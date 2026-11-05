import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { formById } from '@/data/labour-registers/forms';
import { formsByAct, formsFor, monthPeriod } from './catalogue';
import { buildDataset, type SlotInput } from './dataset';
import { parseWorkbook, type WorkbookInput } from './parse';
import { matchColumns } from './match';
import { projectForm, projectForms } from './project';
import { documentFileName, batchZipName, periodLabel } from './storage';
import { isBuilt } from './xlsx/layouts';
import { renderForForm } from './xlsx/renderers';
import { createUniqueNamer, zipEntryPath } from '@/lib/zip/entry-names';
import { createZipStream } from '@/lib/zip/zip-writer';

/**
 * The whole feature, from the bytes a client sends to the archive a preparer downloads.
 *
 * Every other test here covers one module. This one covers the joins between them, which is
 * where this feature actually failed: each piece was built and tested, and nothing connected
 * any two of them, so nothing could be produced at all.
 *
 * It runs without Postgres or S3 — the database is a store of keys and rows, and what it
 * stores is not what decides whether a register can be made. What decides that is this chain:
 *
 *     a real .xlsx  →  parseWorkbook  →  matchColumns  →  buildDataset
 *                   →  projectForm    →  renderForForm →  a zip entry
 *
 * If that holds, the routes are wiring.
 */

const period = monthPeriod(2026, 9);

/** A paysheet shaped like the filed ones: a title row, an instruction row, headings on row 3. */
async function realPaysheet(employees = 8): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sept Payroll');
  ws.addRow(['WebPT India Private Limited — Payroll Register']);
  ws.addRow(['September 2026 · prepared by HR · do not edit below this line']);
  ws.addRow([
    'Emp No',
    'Employee Name',
    'Gender',
    'Designation',
    'Days Worked',
    'Basic Pay',
    'HRA',
    'Gross Earnings',
    'PF',
    'Total Deductions',
    'Net Pay',
  ]);
  for (let i = 1; i <= employees; i += 1) {
    ws.addRow([
      `E${String(i).padStart(4, '0')}`,
      `Employee ${i}`,
      i % 2 === 0 ? 'Male' : 'Female',
      'Associate',
      26,
      25000,
      10000,
      35000,
      1800,
      1800,
      33200,
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ESTABLISHMENT = {
  name: 'WebPT India Private Limited',
  address: 'Hyderabad, Telangana',
  shiftName: 'General',
  shiftStart: '09:30',
  shiftEnd: '18:30',
  restInterval: '13:00–13:45',
  dateOfPayment: '2026-10-07',
};

describe('from an uploaded workbook to a register', () => {
  it('reads a real paysheet, matches its columns, and produces a register that opens', async () => {
    /* 1. What the upload route does: read the bytes. */
    const parsed = await parseWorkbook((await realPaysheet()) as WorkbookInput);
    expect(parsed.headerRow).toBe(3);
    expect(parsed.rows).toHaveLength(8);

    /* 2. What the mapping screen does: match the client's headings to ours, with nobody
          typing anything. "Emp No", "Gender" and "Basic Pay" are not our names for these. */
    const form = formById('in-wages-iv')!;
    const matches = matchColumns({ fields: ['employeeId', 'name', 'sex', 'designation', 'daysWorked', 'basic', 'grossEarnings', 'totalDeductions', 'netPay'], headers: parsed.headers });
    const mapping: Record<string, string> = {};
    for (const m of matches) {
      const chosen = m.candidates[0];
      if (m.bucket !== 'none' && chosen) mapping[m.field] = chosen.header;
    }
    /* Every required column of Form IV found itself. This is the "nothing is manual" claim. */
    for (const field of ['employeeId', 'name', 'sex', 'designation', 'daysWorked', 'basic', 'grossEarnings', 'totalDeductions', 'netPay']) {
      expect(mapping[field], `${field} should have matched automatically`).toBeTruthy();
    }

    /* 3. What the generate route does: assemble, project, render. */
    const slot: SlotInput = { sheet: parsed, mapping };
    const dataset = buildDataset({
      period,
      slots: { paysheet: slot },
      assumptions: { fullAttendanceAssumed: true },
      forms: [form],
      master: ESTABLISHMENT,
    });
    expect(dataset.employees).toHaveLength(8);

    const table = projectForm(form, dataset);
    const buffer = await renderForForm(table, {
      establishment: ESTABLISHMENT,
      periodLabel: periodLabel(period),
      generatedAt: '2026-11-03T14:05:00.000Z',
      generatorRevision: '2026-11-02.1',
      cacheKey: 'fedcba9876543210',
    });

    /* 4. The file is a real workbook with the client's data in it. */
    expect(buffer.byteLength).toBeGreaterThan(4000);
    const back = await parseWorkbook(buffer, { maxHeaderRow: 12 });
    expect(back.headers).toContain('Name of the employee');
    expect(back.headers).toContain('Net wages paid');
    expect(back.rows[0]['Name of the employee']).toBe('Employee 1');
    expect(back.rows[0]['Basic wages']).toBe('25000');
  });

  it('produces every register a Telangana September calls for', async () => {
    const parsed = await parseWorkbook((await realPaysheet(4)) as WorkbookInput);
    const mapping = {
      employeeId: 'Emp No',
      name: 'Employee Name',
      sex: 'Gender',
      designation: 'Designation',
      daysWorked: 'Days Worked',
      basic: 'Basic Pay',
      hra: 'HRA',
      grossEarnings: 'Gross Earnings',
      pf: 'PF',
      totalDeductions: 'Total Deductions',
      netPay: 'Net Pay',
    };
    const forms = formsFor('TG', period, 'central').filter((f) => isBuilt(f.archetype));
    const dataset = buildDataset({
      period,
      slots: { paysheet: { sheet: parsed, mapping } },
      assumptions: { fullAttendanceAssumed: true },
      forms,
      master: ESTABLISHMENT,
    });

    const { tables, blocked } = projectForms(forms, dataset);
    /* Some forms need an employee sheet this paysheet does not carry — a date of joining, a
       leave balance — and those block with a reason rather than producing a short register.
       What matters is that something is produced and nothing throws. */
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.length + blocked.length).toBe(forms.length);

    for (const table of tables) {
      const buffer = await renderForForm(table, {
        establishment: ESTABLISHMENT,
        periodLabel: periodLabel(period),
        generatedAt: '2026-11-03T14:05:00.000Z',
        generatorRevision: '2026-11-02.1',
        cacheKey: `key-${table.form.id}`,
      });
      expect(buffer.byteLength, `${table.form.id} produced no bytes`).toBeGreaterThan(3000);
    }
  });
});

describe('the act-wise archive', () => {
  it('puts each register in its act\'s folder and streams as a zip', async () => {
    const parsed = await parseWorkbook((await realPaysheet(3)) as WorkbookInput);
    const mapping = {
      employeeId: 'Emp No', name: 'Employee Name', sex: 'Gender', designation: 'Designation',
      daysWorked: 'Days Worked', basic: 'Basic Pay', grossEarnings: 'Gross Earnings',
      totalDeductions: 'Total Deductions', netPay: 'Net Pay',
    };
    const forms = formsFor('TG', period, 'central').filter((f) => isBuilt(f.archetype));
    const dataset = buildDataset({
      period, slots: { paysheet: { sheet: parsed, mapping } },
      assumptions: { fullAttendanceAssumed: true }, forms, master: ESTABLISHMENT,
    });
    const { tables } = projectForms(forms, dataset);

    const built = await Promise.all(
      tables.map(async (table) => ({
        form: table.form,
        bytes: await renderForForm(table, {
          establishment: ESTABLISHMENT, periodLabel: periodLabel(period),
          generatedAt: '2026-11-03T14:05:00.000Z', generatorRevision: '2026-11-02.1',
          cacheKey: `key-${table.form.id}`,
        }),
      })),
    );

    const unique = createUniqueNamer();
    const entries = built.map(({ form, bytes }) => ({
      name: unique(zipEntryPath(form.act, documentFileName(form, period))),
      open: () => [new Uint8Array(bytes)],
    }));

    /* Folders are the acts, as `formsByAct` groups them — which is how an inspection is run. */
    const acts = new Set(formsByAct(built.map((b) => b.form)).map((g) => g.act));
    for (const act of acts) {
      expect(entries.some((e) => e.name.startsWith(`${act.replace(/[\\/:*?"<>|]+/g, '-')}/`)), `no folder for ${act}`).toBe(true);
    }

    const stream = createZipStream(entries);
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const zip = Buffer.concat(chunks);

    /* A zip begins PK and is at least as big as what went into it. Counting local-file
       headers would be wrong here: an .xlsx is itself a zip, so every register contributes
       its own. The entry names are the thing to check. */
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zip.byteLength).toBeGreaterThan(built.reduce((n, b) => n + b.bytes.byteLength, 0) * 0.9);

    const raw = zip.toString('latin1');
    for (const entry of entries) {
      expect(raw.includes(entry.name), `${entry.name} is not in the archive`).toBe(true);
    }
  });

  it('names the archive for the state and the period', () => {
    expect(batchZipName('Telangana', period)).toBe('Telangana labour registers - Sep-2026.zip');
  });

  it('names a register the way somebody forwarding it would need', () => {
    const form = formById('in-wages-iv')!;
    expect(documentFileName(form, period)).toBe(
      'Form IV - Register of wages, overtime, fines, deductions and advances - Sep-2026.xlsx',
    );
  });
});
