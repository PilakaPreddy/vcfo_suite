/**
 * Questions worded unlike the sources, each with a word the right source must hold. They run on full
 * text alone (provider `none`), so they hold on a machine with no AWS. `knowledge-db.test.ts` runs
 * them against the loaded content; `run-knowledge-live.ts` runs them through the real pipeline.
 */
export interface KnowledgeCase {
  id: string;
  question: string;
  /** Any retrieved document chunk holds this text, in any case. */
  chunkHas: string;
}

export const PARAPHRASE_CASES: readonly KnowledgeCase[] = [
  { id: 'accounts-late', question: 'What happens if we send the yearly accounts to the registrar after the deadline?', chunkHas: 'AOC-4' },
  { id: 'director-kyc-miss', question: 'What is the punishment for missing the director identity check?', chunkHas: 'DIR-3' },
  { id: 'advance-tax-who', question: 'Which companies have to pay tax in advance during the year?', chunkHas: 'advance tax' },
  { id: 'sales-return', question: 'What is the monthly return of sales invoices called?', chunkHas: 'GSTR-1' },
  { id: 'gst-summary', question: 'Tell me about the monthly gst summary return', chunkHas: 'GSTR-3B' },
  { id: 'auditor', question: 'Which form tells the ministry who the auditor is?', chunkHas: 'ADT-1' },
  { id: 'commencement', question: 'What must we declare before starting business after incorporation?', chunkHas: 'INC-20A' },
  { id: 'loans', question: 'Is there a yearly return for loans and deposits?', chunkHas: 'DPT-3' },
  { id: 'small-suppliers', question: 'Do we report money owed to small suppliers?', chunkHas: 'MSME-1' },
  { id: 'who-owns-filing', question: 'Who is responsible for the filings, the client or the project lead?', chunkHas: 'project lead' },
];

export const HINGLISH_CASES: readonly KnowledgeCase[] = [
  { id: 'hi-aoc-penalty', question: 'AOC-4 der se bharne par kya jurmana lagta hai?', chunkHas: 'AOC-4' },
  { id: 'hi-kyc-date', question: 'Director ka KYC kab tak bharna hai?', chunkHas: 'DIR-3' },
  { id: 'hi-gstr3b-date', question: 'GSTR-3B ki aakhri tarikh kya hai?', chunkHas: 'GSTR-3B' },
  { id: 'hi-advance-tax', question: 'Advance tax kaun bharega?', chunkHas: 'advance tax' },
  { id: 'hi-pf', question: 'PF ka paisa kab jama karna hai?', chunkHas: 'PF' },
  { id: 'hi-inc20a', question: 'INC-20A kya hota hai?', chunkHas: 'INC-20A' },
  { id: 'hi-annual-return', question: 'Kampani ka salana return kaun sa form hai?', chunkHas: 'MGT-7' },
  { id: 'hi-tds', question: 'TDS ka challan har mahine kab jama karna hota hai?', chunkHas: 'TDS' },
];
