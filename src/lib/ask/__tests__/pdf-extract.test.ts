// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExtractError, extractSourceText } from '@/lib/ask/ingest/extract';
import type { LlmProvider } from '@/lib/ask/provider';

/** A real PDF: each page is either a line of text or one 1x1 image and no text, or empty. */
function buildPdf(pages: Array<{ text: string } | 'scan' | 'blank'>): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x80\nendstream');
  const kids = pages.map((page) => {
    const content =
      page === 'blank'
        ? ''
        : page === 'scan'
          ? 'q 600 0 0 800 0 0 cm /Im0 Do Q'
          : `BT /F1 12 Tf 40 700 Td (${page.text}) Tj ET`;
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${stream} 0 R /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 4 0 R >> >> >>`);
  });
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] >>`;
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function modelSaying(text: string, stopReason = 'end_turn') {
  const complete = vi.fn(async () => ({
    model: 'mock',
    stopReason,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    content: [{ type: 'text', text }],
  }));
  return { provider: { name: 'mock', complete } as unknown as LlmProvider, complete };
}

const extract = (bytes: Buffer, provider: LlmProvider | null) =>
  extractSourceText({ bytes, fileName: 'rules.pdf', contentType: 'application/pdf', provider, model: 'claude-haiku-5-5' });

const TEXT = 'The company must file this return within thirty days of the meeting.';

describe('PDF text extraction', () => {
  it('reads a text PDF locally and never calls the model', async () => {
    const { provider, complete } = modelSaying('nope');
    const text = await extract(buildPdf([{ text: TEXT }, { text: 'Second page holds the rest of the rule text here.' }]), provider);
    expect(text).toContain('thirty days');
    expect(text).toContain('Second page');
    expect(complete).not.toHaveBeenCalled();
  });

  it('reads a real document in the repository locally', async () => {
    const text = await extract(readFileSync('docs/overview/vcfo-suite-overview.pdf'), null);
    expect(text).toContain('Project lead');
  });

  it('ignores a blank page', async () => {
    const { provider, complete } = modelSaying('nope');
    await extract(buildPdf([{ text: TEXT }, 'blank']), provider);
    expect(complete).not.toHaveBeenCalled();
  });

  it('sends only the scanned pages to the model, and merges them in page order', async () => {
    const { provider, complete } = modelSaying('=== PAGE 2 ===\nScanned rule text.\n\n=== PAGE 4 ===\nAnother scanned page.');
    const text = await extract(buildPdf([{ text: TEXT }, 'scan', { text: 'Third page holds readable text for the index.' }, 'scan']), provider);
    expect(text.indexOf('thirty days')).toBeLessThan(text.indexOf('Scanned rule'));
    expect(text.indexOf('Scanned rule')).toBeLessThan(text.indexOf('Third page'));
    expect(text.indexOf('Third page')).toBeLessThan(text.indexOf('Another scanned'));
    expect(complete).toHaveBeenCalledTimes(1);
    const request = (complete.mock.calls[0] as unknown as [{ thinking: string; effort: string; messages: Array<{ content: Array<{ text?: string }> }> }])[0];
    expect(request).toMatchObject({ thinking: 'off', effort: 'low', model: 'claude-haiku-5-5' });
    expect(request.messages[0]!.content[1]!.text).toContain('only these pages exactly, in reading order: 2, 4');
  });

  it('an all-scanned PDF with no model fails with a clear reason', async () => {
    await expect(extract(buildPdf(['scan']), null)).rejects.toThrow(/scan/);
  });

  it('a partly scanned PDF with no model indexes what it can read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(extract(buildPdf([{ text: TEXT }, 'scan']), null)).resolves.toContain('thirty days');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a cut-off or refused transcription is an error, not partial text', async () => {
    await expect(extract(buildPdf(['scan']), modelSaying('x', 'max_tokens').provider)).rejects.toBeInstanceOf(ExtractError);
    await expect(extract(buildPdf(['scan']), modelSaying('x', 'refusal').provider)).rejects.toBeInstanceOf(ExtractError);
  });

  it('a file that is not a PDF is an error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(extract(Buffer.from('%PDF-1.4 not really'), null)).rejects.toThrow(/not a readable PDF/);
    warn.mockRestore();
  });
});
