import { createHash } from 'node:crypto';

/**
 * PDF TEXT — server only by way of node:crypto and pdfjs. It reads the text of a PDF with the
 * pdfjs-dist legacy build and hashes it in a normal form, so a signed copy of the same PDF, whose
 * bytes differ, has the same text hash. The text is the page content plus the values of filled form
 * fields, so a changed field value changes the hash. Signature fields and their appearances are left
 * out, so signing does not change it.
 *
 * A PDF with too little text (a scan or image) is `unreadable` and has no hash. It is never
 * treated as a match.
 */

export interface PdfTextResult {
  text: string;
  pages: number;
  unreadable: boolean;
  /** SHA-256 of the normal form of the text; null when unreadable. */
  textHash: string | null;
  /** Why the file could not be opened (not a PDF, password protected); null otherwise. */
  error: string | null;
}

/** Fewer letters and digits than this across the whole PDF cannot be a filled form. */
const MIN_READABLE_CHARS = 40;
const MAX_PAGES = 300;

/** Lower case, letters and digits only: spacing, line breaks and punctuation do not count. */
export function compactText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function hashPdfText(text: string): string {
  return createHash('sha256').update(compactText(text), 'utf8').digest('hex');
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loaded: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  loaded ??= (async () => {
    // Importing the worker by name gives the file tracer a path to it (standalone output), and
    // setting it on globalThis makes pdfjs run it in this process rather than look for a file.
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.mjs' as string),
    ]);
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return pdfjs;
  })();
  return loaded;
}

/** The values of filled text and choice fields on a page; never a signature field. */
function fieldValues(annotations: Array<{ fieldType?: string; fieldValue?: unknown }>): string {
  const out: string[] = [];
  for (const a of annotations) {
    if (a.fieldType !== 'Tx' && a.fieldType !== 'Ch') continue;
    if (typeof a.fieldValue === 'string') out.push(a.fieldValue);
    else if (Array.isArray(a.fieldValue)) out.push(...a.fieldValue.filter((v): v is string => typeof v === 'string'));
  }
  return out.join(' ');
}

export async function extractPdfText(pdf: Buffer): Promise<PdfTextResult> {
  const failed = (error: string): PdfTextResult => ({ text: '', pages: 0, unreadable: true, textHash: null, error });
  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfJs();
  } catch (e) {
    loaded = null;
    console.error('[mca-filing] pdfjs did not load', e instanceof Error ? e.message : e);
    return failed('reader_unavailable');
  }
  // pdfjs takes ownership of the buffer it is given, so it gets a copy.
  const task = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const chunks: string[] = [];
    const pages = Math.min(doc.numPages, MAX_PAGES);
    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      chunks.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
      chunks.push(fieldValues(await page.getAnnotations()));
      page.cleanup();
    }
    const text = chunks.join('\n');
    const unreadable = compactText(text).length < MIN_READABLE_CHARS;
    return { text, pages: doc.numPages, unreadable, textHash: unreadable ? null : hashPdfText(text), error: null };
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    return failed(name === 'PasswordException' ? 'password_protected' : 'not_a_readable_pdf');
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
