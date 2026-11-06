import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveCatalogItems } from '@/data/checklist';
import { documentMatches } from '@/lib/ask/data-router/lock';
import { placeValues } from '@/lib/ask/data-router/place';
import { planRows } from '@/lib/ask/data-router/plan';
import { instructionOf, readFile, readPaste } from '@/lib/ask/data-router/read';
import type { ReadResult } from '@/lib/ask/data-router/types';
import type { LlmProvider } from '@/lib/ask/provider';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { FillCase } from './cases';

/** One golden case through the same read, place and plan code as the chat, with no database. */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export const COMPANY = 'Solstice Energy Private Limited';

function stateOpenAtDirectors(): Record<string, ChecklistItemStateSlice> {
  const state: Record<string, ChecklistItemStateSlice> = {};
  for (const item of getActiveCatalogItems()) {
    if (item.id === 'pre-15') break;
    state[item.id] = { status: 'completed', reviewStatus: 'accepted', responses: {} } as ChecklistItemStateSlice;
  }
  return state;
}

export interface CaseOutcome {
  id: string;
  usedModel: boolean;
  proposed: Array<{ field: string; value: string; correct: boolean }>;
  missed: string[];
  wrongClient: boolean;
  questions: string[];
  refused: string | null;
  rawLeak: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function runFillCase(fill: FillCase, provider: LlmProvider, model: string): Promise<CaseOutcome> {
  const deps = { provider: async () => provider, model, idDocReading: true };
  const fileName = fill.file ?? null;
  const result: ReadResult = fileName ? await readFile({ fileName, data: readFileSync(path.join(FIXTURES, fileName)) }, deps) : await readPaste(fill.paste!, deps);
  const outcome: CaseOutcome = { id: fill.id, usedModel: result.usedModel, proposed: [], missed: [], wrongClient: false, questions: [], refused: null, rawLeak: false };
  if (result.company && !documentMatches(result.company, [COMPANY])) {
    // The chat asks at this point and proposes nothing, so a document for another client ends here.
    outcome.questions.push(`This document names ${result.company}.`);
    return outcome;
  }
  if (fill.otherClient) outcome.wrongClient = true;
  const instruction = fill.instruction ?? (fill.paste ? instructionOf(fill.paste) : '');
  const attachment = fileName ? { id: '00000000-0000-4000-8000-000000000001', kind: 'file', fileName } : null;
  const { placed, questions, files } = await placeValues([{ result, attachment }], { instruction, provider: deps.provider, model });
  const plan = planRows({ role: 'intern', engagementId: 'eng-solstice', companyName: COMPANY, engagement: { ownershipType: 'indian' }, state: stateOpenAtDirectors(), placed, files, instruction });
  outcome.questions = [...questions, ...plan.questions];
  const left = [...fill.expected];
  for (const row of plan.draft.rows) {
    // A value that failed its format check is a question on the card, not a value on offer.
    if (row.action !== 'checklist.setResponse' || row.newValue === '' || row.checks.some((c) => c.rule === 'format' && !c.ok)) continue;
    const target = row.target as { stepId: string; fieldId: string };
    const field = `${target.stepId}/${target.fieldId}`;
    const value = String(row.newValue);
    const index = left.findIndex(([f, v]) => f === field && same(v, value));
    if (index >= 0) left.splice(index, 1);
    outcome.proposed.push({ field, value, correct: index >= 0 });
    if (row.sensitive && (row.displayNew === value || JSON.stringify(row.source ?? {}).includes(value))) outcome.rawLeak = true;
  }
  outcome.missed = left.map(([f, v]) => `${f}=${v}`);
  return outcome;
}

export function summarise(outcomes: readonly CaseOutcome[]) {
  const proposed = outcomes.flatMap((o) => o.proposed);
  const correct = proposed.filter((p) => p.correct).length;
  const expected = correct + outcomes.reduce((sum, o) => sum + o.missed.length, 0);
  return {
    proposed: proposed.length,
    correct,
    correctFieldRate: proposed.length ? correct / proposed.length : 1,
    found: expected ? correct / expected : 1,
    wrongClientWrites: outcomes.filter((o) => o.wrongClient).length,
    rawLeaks: outcomes.filter((o) => o.rawLeak).length,
  };
}
