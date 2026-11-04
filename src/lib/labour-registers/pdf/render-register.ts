import 'server-only';

import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';

import type { ProjectedTable } from '../project';
import type { WorkbookMeta } from '../xlsx/scaffold';
import { RegisterDocument, type RegisterPdfMeta } from './register-document';

/**
 * One register as a PDF.
 *
 * Takes the same `WorkbookMeta` the xlsx renderer takes, so a caller producing both formats
 * does not assemble two sets of facts about the same document. The establishment is flattened
 * here because the PDF prints two of its fields and the workbook prints all seven.
 */
export async function renderRegisterPdf(table: ProjectedTable, meta: WorkbookMeta): Promise<Buffer> {
  const pdfMeta: RegisterPdfMeta = {
    establishmentName: meta.establishment.name,
    establishmentAddress: meta.establishment.address,
    periodLabel: meta.periodLabel,
    generatedAt: meta.generatedAt,
    generatorRevision: meta.generatorRevision,
    cacheKey: meta.cacheKey,
    verification: meta.verification,
  };
  return renderToBuffer(
    createElement(RegisterDocument, { table, meta: pdfMeta }) as Parameters<typeof renderToBuffer>[0],
  );
}
