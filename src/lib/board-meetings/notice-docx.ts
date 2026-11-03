import PizZip from 'pizzip';
import type { NoticeDoc } from './notice';

/**
 * The notice and agenda as a Word file (.docx), built without a template: page 1 is the notice,
 * page 2 the agenda, each with the company footer lines, Times New Roman 12 pt like the sample.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface P {
  text: string;
  bold?: boolean;
  center?: boolean;
  justify?: boolean;
  indent?: number;
  size?: number;
  after?: number;
  pageBreakBefore?: boolean;
}

function para(p: P): string {
  const ppr = [
    p.center ? '<w:jc w:val="center"/>' : p.justify ? '<w:jc w:val="both"/>' : '',
    p.indent ? `<w:ind w:left="${p.indent}"/>` : '',
    `<w:spacing w:after="${p.after ?? 160}"/>`,
    p.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
  ].join('');
  const rpr = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${p.bold ? '<w:b/>' : ''}<w:sz w:val="${p.size ?? 24}"/>`;
  return `<w:p><w:pPr>${ppr}</w:pPr><w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`;
}

export function noticeDocxParagraphs(doc: NoticeDoc): P[] {
  const out: P[] = [];
  out.push({ text: doc.title, bold: true, center: true, after: 320 });
  out.push({ text: doc.ref, after: 0 });
  out.push({ text: doc.dated, after: 240 });
  out.push({ text: doc.salutation });
  out.push({ text: doc.subject, bold: true, center: true });
  out.push({ text: '***', center: true });
  for (const b of doc.body) out.push({ text: b, justify: true });
  for (const c of doc.closing) out.push({ text: c, after: 60 });
  out.push({ text: '', after: 480 });
  doc.signatory.forEach((s, i) => out.push({ text: s, bold: i === 0, after: 40 }));
  out.push({ text: '', after: 200 });
  out.push({ text: doc.toHeading, after: 80 });
  doc.to.forEach((t, i) => out.push({ text: `${i + 1}. ${t}`, indent: 360, after: 60 }));
  out.push({ text: '', after: 360 });
  for (const f of doc.footer) out.push({ text: f, center: true, size: 18, after: 0, bold: f === doc.footer[0] });

  out.push({ text: doc.agendaTitle, bold: true, center: true, after: 320, pageBreakBefore: true });
  for (const [k, v] of doc.agendaMeta) out.push({ text: `${k}  ${v}`, after: 120 });
  out.push({ text: doc.agendaIntro, after: 160 });
  for (const a of doc.agenda) {
    out.push({ text: `${a.n}. ${a.text}`, indent: 360, justify: true, after: 100 });
    for (const s of a.subs) out.push({ text: `${s.n} ${s.text}`, indent: 900, after: 80 });
  }
  out.push({ text: '***', center: true, after: 360 });
  for (const f of doc.footer) out.push({ text: f, center: true, size: 18, after: 0, bold: f === doc.footer[0] });
  return out;
}

export function noticeDocx(doc: NoticeDoc): Buffer {
  return simpleDocx(noticeDocxParagraphs(doc));
}

/** A one-section A4 Word file from paragraphs (Times New Roman, no template). */
export function simpleDocx(paragraphs: P[]): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const body = paragraphs.map(para).join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
