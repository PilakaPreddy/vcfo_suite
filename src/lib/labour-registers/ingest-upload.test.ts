import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

const recordUpload = vi.fn();
const putObject = vi.fn();
vi.mock('@/db/repositories/labour-registers', () => ({ recordUpload: (...a: unknown[]) => recordUpload(...a) }));
vi.mock('@/storage/s3', () => ({ putObject: (...a: unknown[]) => putObject(...a) }));

const { ingestRegisterUpload, readRegisterSheet, RegisterUploadRefused } = await import('./ingest-upload');

const lead: AuthContext = { userId: 'u-lead', email: 'lead@x.test', name: 'Lead', role: 'intern' };
const batch = { id: 'b1', engagementId: 'e-db-1', stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31', markedReadyAt: null } as never;

async function paysheet(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Paysheet');
  ws.addRow(['Emp Code', 'Employee Name', 'Basic', 'Net Pay']);
  ws.addRow(['E1', 'Asha Rao', 20000, 18000]);
  ws.addRow(['E2', 'Ravi Kumar', 22000, 19500]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeEach(() => {
  vi.clearAllMocks();
  recordUpload.mockImplementation(async (_ctx: unknown, input: Record<string, unknown>) => ({ id: 'up-1', ...input }));
});

describe('ingestRegisterUpload', () => {
  it('reads the sheet, stores the bytes under the batch and slot, and records the upload', async () => {
    const bytes = await paysheet();
    const out = await ingestRegisterUpload(lead, { batch, slot: 'paysheet', bytes, fileName: 'aug.xlsx' });
    expect(out.parsed).toMatchObject({ headers: ['Emp Code', 'Employee Name', 'Basic', 'Net Pay'], rowCount: 2, headerRow: 1 });
    const key = putObject.mock.calls[0]![0] as string;
    expect(key).toBe(`labour-registers/e-db-1/b1/paysheet-${out.sha256.slice(0, 12)}`);
    expect(putObject.mock.calls[0]![2]).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(recordUpload).toHaveBeenCalledWith(lead, expect.objectContaining({ batchId: 'b1', slot: 'paysheet', fileName: 'aug.xlsx', objectKey: key, rowCount: 2 }));
    expect(out.upload.id).toBe('up-1');
  });

  it('refuses a closed period before reading or storing anything', async () => {
    const closed = { ...(batch as object), markedReadyAt: new Date() } as never;
    await expect(ingestRegisterUpload(lead, { batch: closed, slot: 'paysheet', bytes: await paysheet(), fileName: 'aug.xlsx' })).rejects.toMatchObject({ status: 409 });
    expect(putObject).not.toHaveBeenCalled();
  });

  it('refuses an empty file and a file that is not a workbook', async () => {
    await expect(readRegisterSheet(Buffer.alloc(0), 'a.xlsx')).rejects.toBeInstanceOf(RegisterUploadRefused);
    await expect(ingestRegisterUpload(lead, { batch, slot: 'paysheet', bytes: Buffer.from('not a zip'), fileName: 'a.xlsx' })).rejects.toMatchObject({ status: 400 });
    expect(recordUpload).not.toHaveBeenCalled();
  });

  it('answers 404 when the repository cannot see the batch', async () => {
    recordUpload.mockResolvedValue(null);
    await expect(ingestRegisterUpload(lead, { batch, slot: 'paysheet', bytes: await paysheet(), fileName: 'aug.xlsx' })).rejects.toMatchObject({ status: 404 });
  });
});
