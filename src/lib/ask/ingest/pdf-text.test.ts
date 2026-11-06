// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pdfText } from './pdf-text';

/** The smallest PDF with one line of text, written by hand and with offsets worked out here. */
function tinyPdf(line: string): Buffer {
  const stream = `BT /F1 12 Tf 20 100 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const at = body.length;
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return at;
  });
  const start = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

describe('pdfText', () => {
  it('reads the text and the page count locally', async () => {
    const result = await pdfText(tinyPdf('Due date extended to 31.03.2027'));
    expect(result.pages).toBe(1);
    expect(result.text).toContain('Due date extended to 31.03.2027');
  });

  it('throws on bytes that are not a PDF, for the caller to turn into a plain message', async () => {
    await expect(pdfText(Buffer.from('not a pdf at all'))).rejects.toBeTruthy();
  });
});
