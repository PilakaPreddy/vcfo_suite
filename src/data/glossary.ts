// TP2 glossary (VCFO Spectrum B-12): one short line for each form code that shows as a title in
// lists, ported from the prototype's src/data/glossary.ts. This is reference text about the forms,
// not sample data. Keys are the codes as the lists print them. The `Term` component reads it.

export interface GlossaryTerm {
  /** The code as it shows: "GSTR-3B". */
  term: string;
  /** One or two short sentences. */
  text: string;
  /** Regulator, for the small line under the text. */
  by: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: "GSTR-3B", text: "Monthly summary return. File by the 20th with the tax paid.", by: "GST · GSTN" },
  { term: "GSTR-1", text: "Monthly return of sales invoices. File by the 11th.", by: "GST · GSTN" },
  { term: "GSTR-9", text: "Yearly GST return. File by 31 Dec after the year.", by: "GST · GSTN" },
  { term: "DIR-3 KYC", text: "Yearly KYC of each director. File by 30 Sep, or the DIN is deactivated.", by: "MCA" },
  { term: "ADT-1", text: "Tells MCA who the auditor is. File within 15 days of the board meeting.", by: "MCA" },
  { term: "INC-20A", text: "Declares that the shareholders paid for their shares. File within 180 days of incorporation.", by: "MCA" },
  { term: "MGT-7", text: "Yearly return with shareholders and directors. File within 60 days of the AGM.", by: "MCA" },
  { term: "AOC-4", text: "Yearly financial statements. File within 30 days of the AGM.", by: "MCA" },
  { term: "MGT-14", text: "Files board resolutions. File within 30 days of the resolution.", by: "MCA" },
  { term: "DPT-3", text: "Yearly return of loans and deposits. File by 30 Jun.", by: "MCA" },
  { term: "MSME-1", text: "Half-yearly return of dues to small suppliers. File by 30 Apr and 31 Oct.", by: "MCA" },
  { term: "PT", text: "Professional tax on salaries, paid to the state each month.", by: "Labour · State" },
  { term: "TDS", text: "Tax deducted at source. Pay by the 7th; file the quarterly return after each quarter.", by: "Income tax" },
  { term: "PF ECR", text: "Monthly provident fund return and challan. File and pay by the 15th.", by: "Payroll · EPFO" },
  { term: "EPF ECR", text: "Monthly provident fund return and challan. File and pay by the 15th.", by: "Payroll · EPFO" },
];

const BY_TERM = new Map(GLOSSARY.map((g) => [g.term.toLowerCase(), g]));
// Longest first, so "DIR-3 KYC" wins over a shorter code.
const ORDER = [...GLOSSARY].sort((a, b) => b.term.length - a.term.length);

/** The glossary entry for an exact code, or undefined. */
export function glossaryFor(code: string): GlossaryTerm | undefined {
  return BY_TERM.get(code.trim().toLowerCase());
}

/** The entry whose code starts a title ("GSTR-3B · September", "TDS return 26Q"), and where it ends. */
export function leadingTerm(text: string): { entry: GlossaryTerm; end: number } | undefined {
  const t = text.toLowerCase();
  for (const g of ORDER) {
    const k = g.term.toLowerCase();
    if (t.startsWith(k) && (t.length === k.length || /[\s·,:(]/.test(t[k.length]))) return { entry: g, end: k.length };
  }
  return undefined;
}
