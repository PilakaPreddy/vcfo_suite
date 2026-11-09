import 'server-only';

import { READABLE_EXTENSIONS } from '@/lib/ask/data-router/read';
import { EXTENSION_TO_MIME } from '@/lib/upload-limits';

/**
 * Which files a drop takes. A drop reads what the chat reads, and also takes a ZIP (unpacked in the
 * job) and a macro-enabled workbook (a payroll sheet is often one). A legacy .xls or an .ods is
 * refused with a request to save it as .xlsx, because neither can be read.
 */
const DROP_EXTRA_EXTENSIONS: ReadonlySet<string> = new Set(['zip', 'xlsm']);
const RESAVE_EXTENSIONS: ReadonlySet<string> = new Set(['xls', 'ods']);

export const DROP_FILE_TYPES_COPY = 'I can read PDF, Word, Excel, CSV, text and image files, and ZIP files of them.';

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

export function isZipName(fileName: string): boolean {
  return extensionOf(fileName) === 'zip';
}

/** Why a drop cannot take this file, or null when it can. */
export function dropFileRefusal(fileName: string): string | null {
  const ext = extensionOf(fileName);
  if (RESAVE_EXTENSIONS.has(ext)) return `.${ext} files cannot be read. Please open it in Excel, save it as .xlsx and drop it again.`;
  if (READABLE_EXTENSIONS.has(ext) || DROP_EXTRA_EXTENSIONS.has(ext)) return null;
  return DROP_FILE_TYPES_COPY;
}

/** The content type a drop file is stored under, by its extension. */
export function dropContentType(fileName: string): string {
  const ext = extensionOf(fileName);
  if (ext === 'csv') return 'text/csv';
  if (ext === 'tsv') return 'text/tab-separated-values';
  if (ext === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12';
  if (ext === 'zip') return 'application/zip';
  return (EXTENSION_TO_MIME as Record<string, string>)[ext] ?? 'application/octet-stream';
}

/** A file name safe to use as the last part of a storage key, as the attachments route makes it. */
export function safeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'file';
}
