import PizZip from 'pizzip';
import type { NoticeDoc } from './notice';

/**
 * The notice and agenda as a Word file (.docx), built without a template, in the layout of the
 * signed NIPL sample the owner shared: page 1 the notice, page 2 the agenda, Times New Roman
 * 12 pt, a letterhead line in the page header and the company name, address and CIN in the
 * page footer on both pages. Bold, underline, the two-column agenda block and the numbered
 * agenda with a hanging indent follow the sample.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One run of text inside a paragraph. */
export interface Run {
  text: string;
  bold?: boolean;
  underline?: boolean;
  size?: number;
  /** Put a tab before the text (used for numbered items). */
  tabBefore?: boolean;
}

export interface P {
  text?: string;
  /** Mixed formatting; when set, `text` is ignored. */
  runs?: Run[];
  bold?: boolean;
  underline?: boolean;
  center?: boolean;
  justify?: boolean;
  /** Left indent in twips (1 cm = 567). */
  indent?: number;
  /** Hanging indent in twips: the first line starts this much left of `indent`. */
  hanging?: number;
  size?: number;
  after?: number;
  pageBreakBefore?: boolean;
  /** A thin rule under the paragraph (letterhead line). */
  ruleBelow?: boolean;
  /** A thin rule over the paragraph (footer line). */
  ruleAbove?: boolean;
}

/** A borderless two-column block (label | value), like the agenda's MEETING NO / DATE / VENUE lines. */
export interface Table2 {
  table: Array<[string, string]>;
  /** Width of the label column in twips. */
  labelWidth: number;
  /** Total width in twips. */
  width: number;
  indent?: number;
}

export type Block = P | Table2;

const isTable = (b: Block): b is Table2 => 'table' in b;

function runXml(r: Run, size: number): string {
  const rpr = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${r.bold ? '<w:b/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${r.size ?? size}"/>`;
  return `<w:r><w:rPr>${rpr}</w:rPr>${r.tabBefore ? '<w:tab/>' : ''}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
}

const RULE = 'w:val="single" w:sz="12" w:space="4" w:color="1F2A44"';

function para(p: P): string {
  // Word wants the paragraph properties in schema order: break, borders, tabs, spacing, indent, alignment.
  const ppr = [
    p.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    p.ruleAbove || p.ruleBelow ? `<w:pBdr>${p.ruleAbove ? `<w:top ${RULE}/>` : ''}${p.ruleBelow ? `<w:bottom ${RULE}/>` : ''}</w:pBdr>` : '',
    p.hanging ? `<w:tabs><w:tab w:val="left" w:pos="${p.indent ?? 0}"/></w:tabs>` : '',
    `<w:spacing w:after="${p.after ?? 160}"/>`,
    p.indent || p.hanging ? `<w:ind w:left="${p.indent ?? 0}"${p.hanging ? ` w:hanging="${p.hanging}"` : ''}/>` : '',
    p.center ? '<w:jc w:val="center"/>' : p.justify ? '<w:jc w:val="both"/>' : '',
  ].join('');
  const size = p.size ?? 24;
  const runs = p.runs ?? [{ text: p.text ?? '', bold: p.bold, underline: p.underline }];
  return `<w:p><w:pPr>${ppr}</w:pPr>${runs.map((r) => runXml(r, size)).join('')}</w:p>`;
}

function cell(text: string, width: number): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${para({ text, after: 120 })}</w:tc>`;
}

function table(t: Table2): string {
  const valueWidth = t.width - t.labelWidth;
  const none = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="nil"/>`).join('');
  const rows = t.table.map(([k, v]) => `<w:tr>${cell(k, t.labelWidth)}${cell(v, valueWidth)}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${t.width}" w:type="dxa"/>${t.indent ? `<w:tblInd w:w="${t.indent}" w:type="dxa"/>` : ''}<w:tblBorders>${none}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${t.labelWidth}"/><w:gridCol w:w="${valueWidth}"/></w:tblGrid>${rows}</w:tbl>`;
}

const block = (b: Block) => (isTable(b) ? table(b) : para(b));

/** A4 with 2.5 cm side margins (the sample's text column). */
const PAGE = { width: 11906, height: 16838, top: 1418, bottom: 1418, side: 1418 };
const TEXT_WIDTH = PAGE.width - 2 * PAGE.side;

/** Bold "Notice" at the start and "Meeting No. …" inside the first body paragraph, as in the sample. */
function firstBodyRuns(text: string, meetingNo: string): Run[] {
  const runs: Run[] = [];
  let rest = text;
  if (rest.startsWith('Notice ')) {
    runs.push({ text: 'Notice', bold: true });
    rest = rest.slice('Notice'.length);
  }
  const mark = `Meeting No. ${meetingNo}`;
  const at = rest.indexOf(mark);
  if (at >= 0) {
    runs.push({ text: rest.slice(0, at) }, { text: mark, bold: true }, { text: rest.slice(at + mark.length) });
  } else runs.push({ text: rest });
  return runs.filter((r) => r.text);
}

export function noticeDocxParagraphs(doc: NoticeDoc): Block[] {
  const out: Block[] = [];
  // Page 1: the notice.
  out.push({ text: doc.title, bold: true, center: true, after: 360 });
  out.push({ text: doc.ref, bold: true, after: 80 });
  out.push({ text: doc.dated, bold: true, after: 240 });
  out.push({ text: doc.salutation, bold: true, after: 200 });
  out.push({ text: doc.subject, bold: true, center: true, after: 120 });
  out.push({ text: '* * *', center: true, after: 200 });
  doc.body.forEach((b, i) => out.push(i === 0 ? { runs: firstBodyRuns(b, doc.ref), justify: true } : { text: b, justify: true }));
  const [thanks, ...signOff] = doc.closing;
  if (thanks) out.push({ text: thanks, after: 240 });
  signOff.forEach((c) => out.push({ text: c, bold: true, after: 40 }));
  out.push({ text: '', after: 480 });
  doc.signatory.forEach((s) => out.push({ text: s, bold: true, after: 40 }));
  out.push({ text: '', after: 240 });
  out.push({ text: doc.toHeading, bold: true, after: 120 });
  doc.to.forEach((t, i) => out.push({ runs: [{ text: `${i + 1}.`, bold: true }, { text: t, bold: true, tabBefore: true }], indent: 720, hanging: 360, after: 80 }));

  // Page 2: the agenda.
  out.push({ text: doc.agendaTitle, bold: true, underline: true, center: true, after: 360, pageBreakBefore: true });
  out.push({ table: doc.agendaMeta, labelWidth: 2268, width: TEXT_WIDTH - 567, indent: 567 });
  out.push({ text: '', after: 120 });
  out.push({ text: doc.agendaIntro, bold: true, indent: 567, after: 160 });
  for (const a of doc.agenda) {
    out.push({ runs: [{ text: `${a.n}.` }, { text: a.text, tabBefore: true }], indent: 1134, hanging: 425, justify: true, after: 100 });
    for (const s of a.subs) out.push({ runs: [{ text: s.n }, { text: s.text, tabBefore: true }], indent: 1814, hanging: 680, justify: true, after: 80 });
  }
  out.push({ text: '***', center: true, after: 240 });
  return out;
}

export interface DocxFrame {
  /** Page header paragraphs (every page). */
  header?: P[];
  /** Page footer paragraphs (every page). */
  footer?: P[];
}

/** The letterhead line and the company footer the notice carries on both pages. */
export function noticeFrame(doc: NoticeDoc): DocxFrame {
  const [name, ...rest] = doc.footer;
  return {
    header: [{ text: name ?? '', bold: true, size: 28, ruleBelow: true, after: 0 }],
    footer: [
      { text: name ?? '', bold: true, center: true, size: 18, ruleAbove: true, after: 0 },
      ...rest.map((f) => ({ text: f, center: true, size: 18, after: 0 })),
    ],
  };
}

export function noticeDocx(doc: NoticeDoc): Buffer {
  return simpleDocx(noticeDocxParagraphs(doc), noticeFrame(doc));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A one-section A4 Word file from blocks, with an optional page header and footer (Times New Roman, no template). */
export function simpleDocx(blocks: Block[], frame: DocxFrame = {}): Buffer {
  const zip = new PizZip();
  const hasHeader = Boolean(frame.header?.length);
  const hasFooter = Boolean(frame.footer?.length);
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const rels: string[] = [];
  if (hasHeader) {
    rels.push('<Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>');
    zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${W}>${frame.header!.map(para).join('')}</w:hdr>`);
  }
  if (hasFooter) {
    rels.push('<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>');
    zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}>${frame.footer!.map(para).join('')}</w:ftr>`);
  }
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
  );
  const body = blocks.map(block).join('');
  const refs = `${hasHeader ? '<w:headerReference w:type="default" r:id="rIdHeader1"/>' : ''}${hasFooter ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''}`;
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr>${refs}<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.top}" w:right="${PAGE.side}" w:bottom="${PAGE.bottom}" w:left="${PAGE.side}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}
