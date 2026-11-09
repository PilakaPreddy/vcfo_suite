/**
 * Shared upload size limits and MIME allowlists for S3-backed document storage.
 *
 * Default: 50 MiB. Override via `NEXT_PUBLIC_MAX_UPLOAD_MB` (1–5120).
 */

const DEFAULT_MAX_UPLOAD_MB = 50;
const MAX_CONFIG_MB = 5120;

function parseMaxUploadMb(): number {
  const raw = process.env.NEXT_PUBLIC_MAX_UPLOAD_MB;
  if (!raw?.trim()) return DEFAULT_MAX_UPLOAD_MB;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_CONFIG_MB) return DEFAULT_MAX_UPLOAD_MB;
  return n;
}

/** Configured max upload size in megabytes (decimal MB label for users). */
const MAX_UPLOAD_MB = parseMaxUploadMb();

/** Max upload size in bytes (MB × 1024²). */
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Human label for UI copy, e.g. "50 MB". */
export function maxUploadSizeLabel(): string {
  return `${MAX_UPLOAD_MB} MB`;
}

/** Validation error when a file exceeds the limit. */
export function maxUploadSizeError(): string {
  return `File must be ${maxUploadSizeLabel()} or smaller.`;
}

/**
 * An Ask VCFO drop: at most this many files, counting the files unpacked from a ZIP, and at most this
 * many bytes in all. The browser checks both before it uploads, and the server checks the running
 * totals again on every file, so a script cannot get past them.
 */
export const DROP_MAX_FILES = 50;
export const DROP_MAX_BYTES = 200 * 1024 * 1024;

export function formatUploadFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// MIME allowlists
// ---------------------------------------------------------------------------

/** Canonical MIME for each supported file extension. */
export const EXTENSION_TO_MIME = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  txt: 'text/plain',
} as const;

type UploadExtension = keyof typeof EXTENSION_TO_MIME;

/** All document/image MIME types used by VCFO Suite storage buckets. */
export const ALL_DOCUMENT_MIME_TYPES = [
  EXTENSION_TO_MIME.pdf,
  EXTENSION_TO_MIME.doc,
  EXTENSION_TO_MIME.docx,
  EXTENSION_TO_MIME.xlsx,
  EXTENSION_TO_MIME.pptx,
  EXTENSION_TO_MIME.jpeg,
  EXTENSION_TO_MIME.png,
  EXTENSION_TO_MIME.webp,
  EXTENSION_TO_MIME.txt,
] as const;

/** MIME types allowed in the knowledge-bank bucket. */
export const KNOWLEDGE_BANK_MIME_TYPES = new Set<string>(ALL_DOCUMENT_MIME_TYPES);

/** Extensions allowed in the knowledge-bank bucket. */
export const KNOWLEDGE_BANK_EXTENSIONS = new Set<string>(Object.keys(EXTENSION_TO_MIME));

/** MIME types allowed in milestone-documents and signed board resolution uploads. */
export const MILESTONE_DOCUMENT_MIME_TYPES = new Set<string>([
  EXTENSION_TO_MIME.pdf,
  EXTENSION_TO_MIME.doc,
  EXTENSION_TO_MIME.docx,
  EXTENSION_TO_MIME.jpeg,
  EXTENSION_TO_MIME.png,
  EXTENSION_TO_MIME.webp,
]);

/** Extensions allowed in milestone-documents uploads. */
export const MILESTONE_DOCUMENT_EXTENSIONS = new Set<string>([
  'pdf',
  'doc',
  'docx',
  'jpg',
  'jpeg',
  'png',
  'webp',
]);

/** MIME types allowed for signed board resolution client uploads. */
export const SIGNED_BOARD_RESOLUTION_MIME_TYPES = new Set<string>([
  EXTENSION_TO_MIME.pdf,
  EXTENSION_TO_MIME.docx,
]);

/** Extensions allowed for signed board resolution client uploads. */
export const SIGNED_BOARD_RESOLUTION_EXTENSIONS = new Set<string>(['pdf', 'docx']);


/** Browser/OS sometimes report generic octet-stream for Office files on Windows. */
const UNKNOWN_UPLOAD_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const MIME_TO_EXTENSION = new Map<string, UploadExtension>(
  (Object.entries(EXTENSION_TO_MIME) as [UploadExtension, string][]).map(([ext, mime]) => [mime, ext]),
);

/** Lowercase extension from a filename (without dot), or null when absent. */
function fileExtensionFromName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext && ext !== fileName.toLowerCase() ? ext : null;
}

/** Resolve a canonical extension from a File (name first, then MIME). */
export function resolveUploadExtension(
  file: Pick<File, 'name' | 'type'>,
  allowedExtensions: ReadonlySet<string>,
): string | null {
  const nameExt = fileExtensionFromName(file.name);
  if (nameExt && allowedExtensions.has(nameExt)) return nameExt;

  if (file.type && !UNKNOWN_UPLOAD_MIME_TYPES.has(file.type)) {
    const fromMime = MIME_TO_EXTENSION.get(file.type);
    if (fromMime && allowedExtensions.has(fromMime)) return fromMime;
    if (file.type === EXTENSION_TO_MIME.jpeg && allowedExtensions.has('jpg')) return 'jpg';
  }

  return null;
}

/** Resolve the upload Content-Type (never generic octet-stream when ext is known). */
export function resolveUploadContentType(
  file: Pick<File, 'name' | 'type'>,
  allowedExtensions: ReadonlySet<string>,
): string {
  const ext = resolveUploadExtension(file, allowedExtensions);
  if (ext && ext in EXTENSION_TO_MIME) {
    return EXTENSION_TO_MIME[ext as UploadExtension];
  }
  if (file.type && !UNKNOWN_UPLOAD_MIME_TYPES.has(file.type)) return file.type;
  return 'application/octet-stream';
}

/** Validate file size + extension/MIME against an allowlist. Returns error message or null. */
export function validateUploadFileType(
  file: Pick<File, 'name' | 'type'>,
  allowedExtensions: ReadonlySet<string>,
  allowedMimeTypes: ReadonlySet<string>,
  unsupportedMessage: string,
): string | null {
  const ext = resolveUploadExtension(file, allowedExtensions);
  if (!ext) return unsupportedMessage;

  if (file.type && !UNKNOWN_UPLOAD_MIME_TYPES.has(file.type) && !allowedMimeTypes.has(file.type)) {
    return unsupportedMessage;
  }

  return null;
}

/**
 * Spreadsheets a labour-register batch takes as an input.
 *
 * Narrower than the document buckets on purpose: these files are parsed, not merely stored, so
 * accepting a PDF or an image would mean failing after the upload instead of refusing it.
 * The reader is `src/lib/labour-registers/parse.ts`.
 *
 * `xlsm` and `csv` are deliberately **not** added to `EXTENSION_TO_MIME`:
 * `KNOWLEDGE_BANK_EXTENSIONS` is derived from its keys, so putting them there would quietly
 * widen what the knowledge bank accepts. This pair stands on its own.
 *
 * Legacy `.xls` is absent on purpose. exceljs cannot read the BIFF format at all, so accepting
 * one would fail after the upload rather than at it.
 */
export const LABOUR_REGISTER_MIME_TYPES = new Set<string>([
  EXTENSION_TO_MIME.xlsx,
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'text/csv',
  /* Windows reports a .csv as this, having handed the extension to Excel. The file name still
     governs — `.xls` is not an allowed extension, so a real one is refused whatever its MIME
     says — and without this a perfectly good CSV is rejected on a Windows machine. */
  'application/vnd.ms-excel',
]);

/** Extensions allowed as a labour-register input. */
export const LABOUR_REGISTER_EXTENSIONS = new Set<string>(['xlsx', 'xlsm', 'csv']);

/** The MIME to store a labour-register input under, by its extension. */
export function labourRegisterContentType(file: Pick<File, 'name' | 'type'>): string {
  const ext = resolveUploadExtension(file, LABOUR_REGISTER_EXTENSIONS);
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12';
  return EXTENSION_TO_MIME.xlsx;
}

/** What to tell somebody who tried to upload something else. */
export const LABOUR_REGISTER_FILE_ERROR =
  'Upload a spreadsheet: .xlsx, .xlsm or .csv. A legacy .xls cannot be read — open it in Excel and save as .xlsx.';

/**
 * What a labour-register verification may rest on.
 *
 * Not the same set as a register input. The evidence behind "this layout is checked" is a
 * gazette page, a scan of a filed form, a photograph of a page in an inspector's file or a
 * downloaded notification — a document or an image, never a spreadsheet. Accepting a workbook
 * here would invite somebody to attach the paysheet, which proves nothing about the layout.
 */
export const LABOUR_REGISTER_EVIDENCE_MIME_TYPES = new Set<string>([
  EXTENSION_TO_MIME.pdf,
  EXTENSION_TO_MIME.docx,
  EXTENSION_TO_MIME.png,
  EXTENSION_TO_MIME.jpg,
  EXTENSION_TO_MIME.webp,
]);

/** Extensions allowed as verification evidence. */
export const LABOUR_REGISTER_EVIDENCE_EXTENSIONS = new Set<string>([
  'pdf',
  'docx',
  'png',
  'jpg',
  'jpeg',
  'webp',
]);

/** What to tell somebody who attached the wrong kind of file. */
export const LABOUR_REGISTER_EVIDENCE_FILE_ERROR =
  'Attach the gazette page, the prescribed form or a scan of a filed one: .pdf, .docx, .png, .jpg or .webp.';
