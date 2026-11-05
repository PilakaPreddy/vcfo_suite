import 'server-only';

import { extractText, getDocumentProxy } from 'unpdf';

/** Text out of a PDF, locally and for free. A scan comes back with almost no text. */
export async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const document = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(document, { mergePages: true });
  return { text, pages: totalPages };
}
