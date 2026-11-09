/**
 * Bridges the words people ask with and the words the sources use. Full-text search matches stems,
 * so "der se bharne ka jurmana" or "what if I miss the deadline" would otherwise find nothing, and
 * full text is all there is on provider `none`. It only adds search words; nothing here reaches a
 * person or the model.
 */
const SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  // Hinglish.
  [/\b(jurmana|jurmaana|dand)\b/, 'penalty late fee interest'],
  [/\b(der|deri|vilamb|chhut|chut)\b/, 'late'],
  [/\b(kab|tarikh|tareekh|aakhri|akhri|antim)\b/, 'due date file by'],
  [/\b(bharna|bharni|bharne|bharein|jama|dakhil)\b/, 'file filing return'],
  [/\b(kaun|kisko|kise|kinko|kis)\b/, 'who must file applies'],
  [/\b(zaroori|jaruri|anivarya|lagu)\b/, 'must required applies'],
  [/\b(salana|saalana|varshik|sal ka|saal ka)\b/, 'annual yearly'],
  [/\b(mahina|mahine|masik)\b/, 'monthly month'],
  [/\b(nideshak|nirdeshak)\b/, 'director'],
  [/\b(kampani|kampni)\b/, 'company'],
  [/\b(panjikaran|registration karna|register karna)\b/, 'registration'],
  [/\b(kya hai|kya hota|matlab)\b/, 'what is about'],
  // Plain English that the sources word differently.
  [/\b(fine|fines|punishment|consequence|consequences|charged)\b/, 'penalty late fee interest'],
  [/\b(miss|missed|forget|forgot|delay|delayed|overdue|belated|after the deadline)\b/, 'late penalty fee'],
  [/\b(deadline|last date|cutoff|cut-off)\b/, 'due date'],
  [/\b(annual accounts|financial statements?|balance sheet|yearly accounts)\b/, 'AOC-4'],
  [/\b(annual return|shareholders and directors)\b/, 'MGT-7'],
  [/\b(director kyc|kyc of directors?|director identity check)\b/, 'DIR-3 KYC'],
  [/\b(sales return|outward supplies|sales invoices?)\b/, 'GSTR-1'],
  [/\b(monthly gst|gst summary|summary return)\b/, 'GSTR-3B'],
  [/\b(yearly gst|annual gst)\b/, 'GSTR-9'],
  [/\b(deposits? return|loans? and deposits?)\b/, 'DPT-3'],
  [/\b(small suppliers?|msme dues|dues to msme)\b/, 'MSME-1'],
  [/\b(foreign investment report|shares? to (?:a )?foreign|foreign investors?)\b/, 'FC-GPR FEMA'],
  [/\b(salary tds|tds on salar\w+)\b/, '24Q Form 16'],
  [/\b(auditor appointment|appoint(?:ing)? (?:an |the )?auditor)\b/, 'ADT-1'],
  [/\b(commencement of business|start(?:ing)? business)\b/, 'INC-20A'],
  [/\b(pf|provident fund)\b/, 'PF EPF'],
  [/\b(incorporate|incorporating|set up a company|new company)\b/, 'SPICe+ incorporation'],
  // "spice a", "spice+ part b", "spice plus a": people type the part letter without "Part".
  [/\bspice\s*(?:\+|plus)?\s*(?:part\s*)?a\b/, 'SPICe+ Part A'],
  [/\bspice\s*(?:\+|plus)?\s*(?:part\s*)?b\b/, 'SPICe+ Part B'],
];

export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const added = SYNONYMS.filter(([pattern]) => pattern.test(lower)).map(([, words]) => words);
  return added.length > 0 ? `${query} ${added.join(' ')}` : query;
}
