/**
 * Splitting long text into pieces one model call can read. A piece ends on a page boundary (a PDF
 * page, a workbook sheet) wherever it can, so a fact is never cut in half between two calls. A page
 * longer than a whole piece is split on line boundaries, and a single line longer than that is cut.
 */

export interface TextChunk {
  /** The one-based pages this piece holds. */
  pages: number[];
  /** The text with a `[Page n]` marker before each page, as the model reads it. */
  text: string;
}

function splitLong(text: string, max: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    for (let start = 0; start < Math.max(line.length, 1); start += max) {
      const piece = line.slice(start, start + max);
      if (current && current.length + 1 + piece.length > max) {
        out.push(current);
        current = '';
      }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current.trim()) out.push(current);
  return out;
}

export function chunkPages(pages: readonly string[], max = 30_000): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: TextChunk | null = null;
  const flush = () => {
    if (current) chunks.push(current);
    current = null;
  };
  pages.forEach((page, i) => {
    if (!page.trim()) return;
    const number = i + 1;
    const marked = `[Page ${number}]\n${page}`;
    if (marked.length > max) {
      flush();
      for (const piece of splitLong(page, max - `[Page ${number}]\n`.length)) chunks.push({ pages: [number], text: `[Page ${number}]\n${piece}` });
      return;
    }
    if (current && current.text.length + 2 + marked.length > max) flush();
    current = current ? { pages: [...current.pages, number], text: `${current.text}\n\n${marked}` } : { pages: [number], text: marked };
  });
  flush();
  return chunks;
}
