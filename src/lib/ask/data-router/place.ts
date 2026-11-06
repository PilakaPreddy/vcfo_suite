import 'server-only';

import type { LlmProvider } from '@/lib/ask/provider';
import { normalizeLabel } from '@/lib/ask/field-catalog/rules';
import { candidatesFor } from './candidates';
import { chooseFields, type ChoiceInput } from './choose';
import { ReadRefused } from './read';
import type { AttachedFile, PlacedValue } from './plan';
import type { ReadResult } from './types';

/**
 * Finds the place for every value that was read: code first, then one small-model call for the rest.
 * A value that is not clearly readable, or that fits nowhere, comes back as a question.
 */
export interface SourceRead {
  result: ReadResult;
  /** The file it came from; null for a paste, and a stored paste counts as one. */
  attachment: { id: string; kind: string; fileName: string } | null;
}

const MIN_CONFIDENCE = 0.6;
const LABEL_MAX_WORDS = 6;

export async function placeValues(
  reads: readonly SourceRead[],
  deps: { instruction: string; provider: () => Promise<LlmProvider>; model: string },
): Promise<{ placed: PlacedValue[]; questions: string[]; files: AttachedFile[]; chooseCalls: number }> {
  const { instruction } = deps;
  const subjectHint = /subscriber|shareholder/i.test(instruction) ? 'subscriber' : /director|promoter/i.test(instruction) ? 'director' : null;
  const asked = /\b(?:director|subscriber|shareholder|promoter)\s*(?:no\.?\s*)?\d+\b/i.exec(instruction)?.[0] ?? subjectHint;
  const questions: string[] = [];
  const placed: PlacedValue[] = [];
  const toChoose: Array<ChoiceInput & { source: PlacedValue['source'] }> = [];
  for (const { result, attachment } of reads) {
    const source: PlacedValue['source'] = attachment?.kind === 'file' ? { kind: 'attachment', attachmentId: attachment.id, fileName: attachment.fileName } : { kind: 'paste' };
    // A certificate of incorporation states the name of record. Anywhere else a company's name only
    // tells which client this is for, so it fills no field.
    const named = result.docType === 'incorporation_certificate' && result.company ? [{ label: 'Company name', value: result.company, page: null, person: null, confidence: 1 }] : [];
    for (const raw of [...result.values, ...named]) {
      const value = { ...raw, person: raw.person ?? asked };
      const here = { ...source, ...(value.page ? { page: value.page } : {}) };
      if (value.confidence < MIN_CONFIDENCE) {
        questions.push(`I could not read "${value.label}" clearly. Please type it in.`);
        continue;
      }
      const subject = /subscriber|shareholder/i.test(value.person ?? '') ? 'subscriber' : /director|promoter/i.test(value.person ?? '') ? 'director' : subjectHint;
      const { exact, candidates } = candidatesFor(value, subject);
      if ((exact ?? candidates[0])?.key === 'company.name' && named.length === 0) continue;
      if (exact) placed.push({ value, entry: exact, source: here });
      else if (candidates.length > 0) toChoose.push({ value, candidates, source: here });
      // A long "label" is a sentence that happened to hold a colon, not a value left behind.
      else if (result.usedModel || normalizeLabel(value.label).split(' ').length < LABEL_MAX_WORDS) questions.push(`I do not know where "${value.label}" goes, so I left it out.`);
    }
  }
  if (toChoose.length > 0) {
    try {
      const chosen = await chooseFields(await deps.provider(), deps.model, toChoose);
      toChoose.forEach((item, index) => {
        const entry = chosen.get(index);
        if (entry?.key === 'company.name') return;
        if (entry) placed.push({ value: item.value, entry, source: item.source });
        else questions.push(`I do not know where "${item.value.label}" goes, so I left it out.`);
      });
    } catch (error) {
      if (!(error instanceof ReadRefused)) console.error('[ask-vcfo] field choice failed', error);
      questions.push(`I could not place ${toChoose.map((t) => t.value.label).slice(0, 5).join(', ')}.`);
    }
  }
  const files: AttachedFile[] = reads.flatMap(({ result, attachment }) =>
    attachment?.kind === 'file' ? [{ attachmentId: attachment.id, fileName: attachment.fileName, docType: result.docType, person: result.values.find((v) => v.person)?.person ?? asked }] : [],
  );
  return { placed, questions, files, chooseCalls: toChoose.length };
}
