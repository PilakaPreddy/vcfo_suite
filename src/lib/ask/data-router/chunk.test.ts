import { describe, expect, it } from 'vitest';
import { chunkPages } from './chunk';

describe('chunkPages', () => {
  it('keeps short pages together in one piece, each with its page marker', () => {
    const chunks = chunkPages(['first page', 'second page'], 100);
    expect(chunks).toEqual([{ pages: [1, 2], text: '[Page 1]\nfirst page\n\n[Page 2]\nsecond page' }]);
  });

  it('cuts on page boundaries and never splits a page that fits', () => {
    const page = 'x'.repeat(40);
    const chunks = chunkPages([page, page, page], 110);
    expect(chunks.map((c) => c.pages)).toEqual([[1, 2], [3]]);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(110);
  });

  it('splits a page longer than a piece on its lines, keeping the page number', () => {
    const page = Array.from({ length: 10 }, (_, i) => `line ${i} ${'y'.repeat(20)}`).join('\n');
    const chunks = chunkPages(['short', page], 80);
    expect(chunks[0]!.pages).toEqual([1]);
    expect(chunks.slice(1).every((c) => c.pages.length === 1 && c.pages[0] === 2 && c.text.startsWith('[Page 2]\n'))).toBe(true);
    expect(chunks.slice(1).every((c) => c.text.length <= 80)).toBe(true);
    expect(chunks.slice(1).map((c) => c.text.replace('[Page 2]\n', '')).join('\n')).toBe(page);
  });

  it('cuts a single line longer than a piece', () => {
    const chunks = chunkPages(['z'.repeat(250)], 100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((c) => c.text.replace('[Page 1]\n', '')).join('')).toBe('z'.repeat(250));
  });

  it('skips empty pages', () => {
    expect(chunkPages(['', '  ', 'text'], 100)).toEqual([{ pages: [3], text: '[Page 3]\ntext' }]);
    expect(chunkPages([], 100)).toEqual([]);
  });
});
