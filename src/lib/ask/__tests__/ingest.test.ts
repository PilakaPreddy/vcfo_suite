import PizZip from 'pizzip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHUNK_MAX_CHARS, chunkDocument } from '@/lib/ask/ingest/chunk';
import { docxToText, sourceKindFor } from '@/lib/ask/ingest/extract';

const getDoc = vi.fn();
const replaceChunks = vi.fn();
const setResult = vi.fn();
const getObjectBuffer = vi.fn();
const searchAskChunks = vi.fn();
const recordUsage = vi.fn(async () => undefined);
const todayTokens = vi.fn(async () => 0);
const noRows = async () => [];
vi.mock('@/db/repositories/ask-usage', () => ({
  systemRecordAskUsage: (...a: unknown[]) => (recordUsage as (...x: unknown[]) => unknown)(...a),
  systemTodayTokenTotal: () => todayTokens(),
}));
vi.mock('@/db/repositories/ask-index', () => ({
  searchIndexItems: vi.fn(noRows),
  systemListUnembeddedCards: vi.fn(noRows),
  systemSetCardEmbeddings: vi.fn(noRows),
}));
vi.mock('@/db/repositories/ask-documents', () => ({
  systemListUnembeddedChunks: vi.fn(noRows),
  systemSetChunkEmbeddings: vi.fn(noRows),
  systemGetAskDocument: (...a: unknown[]) => getDoc(...a),
  systemReplaceAskChunks: (...a: unknown[]) => replaceChunks(...a),
  systemSetAskDocumentResult: (...a: unknown[]) => setResult(...a),
  searchAskChunks: (...a: unknown[]) => searchAskChunks(...a),
}));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: (...a: unknown[]) => getObjectBuffer(...a) }));

const { runAskIngestion } = await import('@/lib/ask/ingest/run');
const { setAskProviderForTests } = await import('@/lib/ask/provider');
const { retrieveSources } = await import('@/lib/ask/retrieve');

const para = (n: number) => `Paragraph ${n}. ` + 'The company must file the return within thirty days of the event. '.repeat(8);

beforeEach(() => {
  vi.clearAllMocks();
  setAskProviderForTests(null);
});

describe('chunker', () => {
  it('splits by heading and keeps chunks within the size band', () => {
    const text = ['# Registration', para(1), para(2), '# Annual filings', para(3), para(4), para(5)].join('\n\n');
    const chunks = chunkDocument(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS + 40);
    expect(chunks[0]!.heading).toBe('Registration');
    expect(chunks.some((c) => c.heading === 'Annual filings')).toBe(true);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it('breaks one huge paragraph at sentence ends', () => {
    const chunks = chunkDocument('The rule applies. '.repeat(400));
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('is deterministic and ignores empty input', () => {
    const text = ['# A', para(1), para(2)].join('\n\n');
    expect(chunkDocument(text)).toEqual(chunkDocument(text));
    expect(chunkDocument('   \n\n ')).toEqual([]);
  });
});

describe('extraction', () => {
  it('reads paragraphs and headings from a .docx', () => {
    const zip = new PizZip();
    zip.file(
      'word/document.xml',
      '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>FEMA reporting</w:t></w:r></w:p><w:p><w:r><w:t>File FC-GPR within 30 days &amp; keep proof.</w:t></w:r></w:p></w:body></w:document>',
    );
    const text = docxToText(zip.generate({ type: 'nodebuffer' }));
    expect(text).toBe('# FEMA reporting\n\nFile FC-GPR within 30 days & keep proof.');
  });

  it('accepts only PDF, DOCX, TXT and MD', () => {
    expect(sourceKindFor('a.pdf', null)).toBe('pdf');
    expect(sourceKindFor('a.DOCX', null)).toBe('docx');
    expect(sourceKindFor('notes.md', null)).toBe('text');
    expect(sourceKindFor('sheet.xlsx', null)).toBeNull();
  });
});

describe('ingestion job', () => {
  const doc = { id: 'doc-1', title: 'GST guide', status: 'processing', s3Key: 'knowledge-bank/ask-sources/doc-1/guide.md' };

  it('is idempotent — a re-run replaces the same chunks, never adds more', async () => {
    getDoc.mockResolvedValue(doc);
    getObjectBuffer.mockResolvedValue(Buffer.from(['# GST', para(1), para(2), para(3)].join('\n\n')));
    const first = await runAskIngestion('doc-1');
    const second = await runAskIngestion('doc-1');
    expect(first).toEqual(second);
    expect(first.status).toBe('ready');
    expect(replaceChunks).toHaveBeenCalledTimes(2);
    expect(replaceChunks.mock.calls[0]).toEqual(replaceChunks.mock.calls[1]);
    expect(setResult).toHaveBeenLastCalledWith('doc-1', { status: 'ready' });
    // No provider configured: chunks are indexed without a context prefix.
    expect((replaceChunks.mock.calls[0]![1] as Array<{ contextPrefix: string | null }>)[0]!.contextPrefix).toBeNull();
  });

  it('marks an unreadable PDF failed with a readable reason', async () => {
    getDoc.mockResolvedValue({ ...doc, s3Key: 'knowledge-bank/ask-sources/doc-1/rules.pdf' });
    getObjectBuffer.mockResolvedValue(Buffer.from('%PDF-1.4'));
    expect((await runAskIngestion('doc-1')).status).toBe('failed');
    expect(setResult).toHaveBeenLastCalledWith('doc-1', {
      status: 'failed',
      error: expect.stringContaining('not a readable PDF'),
    });
    expect(replaceChunks).not.toHaveBeenCalled();
  });

  it('settles a source with no file, loaded from this repository, instead of leaving it indexing', async () => {
    getDoc.mockResolvedValue({ ...doc, s3Key: null });
    expect((await runAskIngestion('doc-1')).status).toBe('skipped');
    expect(setResult).toHaveBeenLastCalledWith('doc-1', { status: 'ready' });
    expect(replaceChunks).not.toHaveBeenCalled();
  });

  it('meters indexing under its own path and skips the model past the daily budget', async () => {
    const complete = vi.fn(async () => ({
      model: 'claude-haiku-5-5',
      stopReason: 'end_turn',
      usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
      content: [{ type: 'text', text: 'Context.' }],
    }));
    setAskProviderForTests({ name: 'mock', complete } as never);
    getDoc.mockResolvedValue(doc);
    getObjectBuffer.mockResolvedValue(Buffer.from(['# GST', para(1)].join('\n\n')));
    expect((await runAskIngestion('doc-1')).status).toBe('ready');
    expect(complete).toHaveBeenCalled();
    const request = (complete.mock.calls[0] as unknown as [{ thinking?: string; effort?: string }])[0];
    expect(request).toMatchObject({ thinking: 'off', effort: 'low' });
    expect(recordUsage).toHaveBeenCalledWith('ingest', expect.arrayContaining([expect.objectContaining({ model: 'claude-haiku-5-5' })]));

    complete.mockClear();
    recordUsage.mockClear();
    todayTokens.mockResolvedValueOnce(Number.MAX_SAFE_INTEGER);
    expect((await runAskIngestion('doc-1')).status).toBe('ready');
    expect(complete).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('skips archived sources', async () => {
    getDoc.mockResolvedValue({ ...doc, status: 'archived' });
    expect((await runAskIngestion('doc-1')).status).toBe('skipped');
    expect(getObjectBuffer).not.toHaveBeenCalled();
  });
});

describe('retrieval audience', () => {
  const hit = (id: string, text: string) => ({ id, documentId: 'd', documentTitle: 'Guide', sourceType: 'govt', sourceUrl: null, text, contextPrefix: null, rank: 1 });
  const staff = { userId: 's1', email: 's@x.test', name: 'S', role: 'manager' as const };

  it('searches the asked words and the widened words, at most four sources, and masks identity numbers', async () => {
    searchAskChunks.mockImplementation(async (_ctx: unknown, input: { query: string }) =>
      input.query === 'jurmana kitna'
        ? [hit('a', 'PAN ABCDE1234F on file')]
        : [hit('a', 'PAN ABCDE1234F on file'), hit('b', 'two'), hit('c', 'three'), hit('d', 'four'), hit('e', 'five')],
    );
    const sources = await retrieveSources(staff, { query: 'jurmana kitna', persona: 'staff', topK: 4, applicability: null });
    expect(searchAskChunks).toHaveBeenCalledTimes(2);
    expect(searchAskChunks.mock.calls[1]![1].query).toContain('penalty');
    expect(sources).toHaveLength(4);
    expect(sources[0]).toMatchObject({ id: 'a', kind: 'chunk' });
    expect(sources[0]!.text).not.toContain('ABCDE1234F');
  });

  it('a failed search leaves the rest of the answer standing', async () => {
    searchAskChunks.mockRejectedValue(new Error('database down'));
    await expect(retrieveSources(staff, { query: 'gst threshold', persona: 'staff', topK: 4, applicability: null })).resolves.toBeInstanceOf(Array);
  });


  it('asks the repository for the client persona on a client question', async () => {
    searchAskChunks.mockResolvedValue([]);
    const ctx = { userId: 'c1', email: 'c@x.test', name: 'C', role: 'client' as const };
    await retrieveSources(ctx, { query: 'gst threshold', persona: 'client', topK: 5, applicability: null });
    expect(searchAskChunks).toHaveBeenCalledWith(ctx, { query: 'gst threshold', persona: 'client', limit: 5, queryVector: null });
  });
});
