import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@/lib/ask/provider';

const fetchMock = vi.fn();
const pdfMock = vi.fn();

vi.mock('../fetch', () => ({ MAX_PDF_BYTES: 1000, watchFetch: (...args: unknown[]) => fetchMock(...args) }));
vi.mock('@/lib/ask/ingest/pdf-text', () => ({ pdfText: (bytes: unknown) => pdfMock(bytes) }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: async () => Buffer.from('%PDF-file') }));

const { readUpdateText, SCAN_LABEL, WatchReadError } = await import('../read');

const LONG = 'Notification text that is long enough to read. '.repeat(20);
const scanModel = (text: string, stopReason = 'end_turn') =>
  ({
    complete: vi.fn(async () => ({ model: 'm', stopReason, usage: { inputTokens: 5, outputTokens: 6, cacheReadTokens: 0 }, content: [{ type: 'text', text }] })),
  }) as unknown as LlmProvider;
const fetched = (body: string, contentType: string) => ({ status: 'ok', finalUrl: 'https://www.sebi.gov.in/a', body: Buffer.from(body), contentType });

beforeEach(() => vi.clearAllMocks());

describe('readUpdateText', () => {
  it('uses long enough listing text and makes no request', async () => {
    const { text } = await readUpdateText({ url: 'https://www.rbi.org.in/a', s3Key: null, listingText: LONG }, null, 'm');
    expect(text).toBe(LONG.trim());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a page when the listing text is short, and masks identity numbers in it', async () => {
    fetchMock.mockResolvedValue(fetched(`<main><p>${LONG} Order against ABCDE1234F.</p></main>`, 'text/html'));
    const { text } = await readUpdateText({ url: 'https://www.sebi.gov.in/a', s3Key: null, listingText: 'Short' }, null, 'm');
    expect(text).toContain('Notification text');
    expect(text).not.toContain('ABCDE1234F');
  });

  it('reads a PDF locally without the model when it has text', async () => {
    pdfMock.mockResolvedValue({ text: LONG, pages: 1 });
    const provider = scanModel('never');
    const { text, usage } = await readUpdateText({ url: null, s3Key: 'watch/a.pdf', listingText: null }, provider, 'm');
    expect(text).toContain('Notification text');
    expect(usage).toBeUndefined();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('sends only a scan to the model, labels the result and reports its tokens', async () => {
    pdfMock.mockResolvedValue({ text: ' ', pages: 2 });
    const { text, usage } = await readUpdateText({ url: null, s3Key: 'watch/a.pdf', listingText: null }, scanModel(LONG), 'm');
    expect(text.startsWith(SCAN_LABEL)).toBe(true);
    expect(usage).toMatchObject({ inputTokens: 5, outputTokens: 6 });
  });

  it('refuses a long scan, a declined scan and a scan with no model', async () => {
    pdfMock.mockResolvedValue({ text: '', pages: 11 });
    await expect(readUpdateText({ url: null, s3Key: 'k', listingText: null }, scanModel(LONG), 'm')).rejects.toThrow('over the limit');
    pdfMock.mockResolvedValue({ text: '', pages: 1 });
    await expect(readUpdateText({ url: null, s3Key: 'k', listingText: null }, scanModel('', 'refusal'), 'm')).rejects.toThrow('declined');
    await expect(readUpdateText({ url: null, s3Key: 'k', listingText: null }, null, 'm')).rejects.toBeInstanceOf(WatchReadError);
  });
});
