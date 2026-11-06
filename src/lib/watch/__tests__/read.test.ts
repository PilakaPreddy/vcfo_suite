import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@/lib/ask/provider';

const fetchMock = vi.fn();
const pdfMock = vi.fn();

vi.mock('../fetch', () => ({ MAX_PDF_BYTES: 1000, WatchBlockedError: class extends Error {}, watchFetch: (...args: unknown[]) => fetchMock(...args) }));
vi.mock('@/lib/ask/ingest/pdf-text', () => ({ pdfText: (bytes: unknown) => pdfMock(bytes) }));
vi.mock('@/storage/s3', () => ({ getObjectBuffer: async () => Buffer.from('%PDF-file') }));

const { embeddedPdf, readUpdateText, SCAN_LABEL, WatchReadError } = await import('../read');

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

  it('finds the PDF behind an RBI notification page and no other link', () => {
    const rbi = `<a id='APDF_475' target="_blank" href="https://rbidocs.rbi.org.in/rdocs/notification/PDFs/475.PDF" aria-labelledby='APDF_475'><img alt='PDF'></a>`;
    expect(embeddedPdf(rbi, 'https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=1')).toBe('https://rbidocs.rbi.org.in/rdocs/notification/PDFs/475.PDF');
    expect(embeddedPdf('<a href="/other.pdf">Other</a>', 'https://www.rbi.org.in/a')).toBeNull();
  });

  it('reads an RBI notification from its own cell, without the menus or the PDF', async () => {
    const page = `<nav>Menu</nav><a id='APDF_1' href="https://rbidocs.rbi.org.in/a.PDF"></a><table><tr class="tablecontent2"><td><table><tr><td>${LONG}</td></tr></table><table><tr><td>Table 8</td></tr></table></td></tr></table><div>2026 All Months</div>`;
    fetchMock.mockResolvedValue(fetched(page, 'text/html'));
    const { text } = await readUpdateText({ url: 'https://www.rbi.org.in/n', s3Key: null, listingText: null }, null, 'm');
    expect(text).toContain('Notification text');
    expect(text).toContain('Table 8');
    expect(text).not.toMatch(/Menu|All Months/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls a web page in place of a PDF a refusal and never reads the bot check', async () => {
    const page = `<a id='APDF_1' href="https://rbidocs.rbi.org.in/a.PDF"></a><table><tr class="tablecontent2"><td></td></tr></table>`;
    fetchMock.mockResolvedValueOnce(fetched(page, 'text/html')).mockResolvedValueOnce(fetched('<script>challenge</script>', 'text/html'));
    await expect(readUpdateText({ url: 'https://www.rbi.org.in/n', s3Key: null, listingText: null }, null, 'm')).rejects.toThrow('bot_check');
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
