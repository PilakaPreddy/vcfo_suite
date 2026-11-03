import { longDate } from './dates';
import { simpleDocx, type P } from './notice-docx';
import { resolvedText } from './rules';

export { resolvedText };

/**
 * A resolution added after the meeting, in the layout of a resolution passed by circulation
 * (Sec 175; the "Resolution by circulation" section of the board meeting agendas page): the
 * company heading, the title, the RESOLVED THAT text and a table of directors with DIN, assent
 * and signature. Word file for the directors to sign; the signed copy is uploaded back.
 */

export interface ResolutionDocInput {
  companyName: string;
  cin: string | null;
  address: string | null;
  title: string;
  description: string;
  resolutionDate: string;
  meetingNo: string;
  meetingDate: string;
  changesItem: string | null;
  signers: Array<{ name: string; din: string | null }>;
}


export function resolutionParagraphs(input: ResolutionDocInput): P[] {
  const out: P[] = [
    { text: input.companyName.toUpperCase(), bold: true, center: true, after: 0 },
    ...(input.cin ? [{ text: `CIN: ${input.cin}`, center: true, size: 18, after: 0 }] : []),
    ...(input.address ? [{ text: input.address, center: true, size: 18, after: 240 }] : [{ text: '', after: 240 }]),
    { text: 'RESOLUTION PASSED BY CIRCULATION', bold: true, center: true, after: 60 },
    { text: `by the Board of Directors under Section 175 of the Companies Act, 2013 · ${longDate(input.resolutionDate)}`, center: true, size: 20, after: 240 },
    { text: input.title.toUpperCase(), bold: true },
    { text: resolvedText(input.description), justify: true },
    {
      text: 'RESOLVED FURTHER THAT any Director of the Company be and is hereby authorised to sign the documents and to do all acts, deeds and things as may be necessary to give effect to this resolution.',
      justify: true,
    },
  ];
  if (input.changesItem) {
    out.push({ text: `This resolution changes the decision on ${input.changesItem} of the Board Meeting ${input.meetingNo} held on ${longDate(input.meetingDate)}.`, size: 20, justify: true });
  }
  out.push({ text: '', after: 120 });
  out.push({ text: 'Director  ·  DIN  ·  Assent  ·  Signature', bold: true, after: 120 });
  for (const s of input.signers) out.push({ text: `${s.name}  ·  ${s.din ?? '—'}  ·  For / Against  ·  ____________________`, after: 200 });
  out.push({ text: '', after: 240 });
  out.push({ text: `Certified true copy · For ${input.companyName}`, size: 20 });
  return out;
}

export function resolutionDocx(input: ResolutionDocInput): Buffer {
  return simpleDocx(resolutionParagraphs(input));
}
