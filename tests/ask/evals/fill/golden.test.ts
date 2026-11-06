// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '@/lib/ask/provider';
import { FILL_CASES, type FillCase } from './cases';
import { runFillCase, summarise, type CaseOutcome } from './run';

/**
 * The golden set with the model replaced: code paths run for real, and the model's replies are the
 * ones written in `cases.ts`. It proves the plumbing, not the model. `npm run eval:fill:live`
 * measures the correct-field rate against the real model.
 */
function mockFor(fill: FillCase): LlmProvider {
  return {
    name: 'mock',
    complete: async (req: LlmRequest) => {
      const prompt = JSON.stringify(req.messages);
      const text = JSON.stringify(req.system).includes('You match')
        ? {
            picks: (JSON.parse((req.messages[0]!.content as Array<{ text: string }>)[0]!.text) as Array<{ index: number; label: string }>).map((line) => ({
              index: line.index,
              key: fill.picks?.[line.label] ?? 'none',
            })),
          }
        : (fill.model ?? { docType: 'other', company: null, values: [] });
      // A placeholder the mock names must be one the code really handed out.
      expect(prompt).not.toMatch(/[A-Z]{5}\d{4}[A-Z]\b(?!.*IDTOKEN)/);
      return { model: req.model, content: [{ type: 'text', text: JSON.stringify(text) }], stopReason: 'end_turn', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } } as never;
    },
  };
}

describe('fill golden set, code paths with a mock model', () => {
  const outcomes: CaseOutcome[] = [];
  beforeAll(async () => {
    for (const fill of FILL_CASES) outcomes.push(await runFillCase(fill, mockFor(fill), 'mock'));
  });

  const byId = (id: string) => outcomes.find((o) => o.id === id)!;

  it('reads forms, tables and labelled pastes with no model', () => {
    for (const id of ['director-form-pdf', 'directors-csv', 'capital-xlsx', 'subscriber-docx', 'paste-labelled']) {
      expect(byId(id).usedModel, id).toBe(false);
    }
  });

  it.each(FILL_CASES.map((fill) => fill.id))('%s proposes only what is expected', (id) => {
    const outcome = byId(id);
    expect(outcome.proposed.filter((p) => !p.correct)).toEqual([]);
  });

  it('finds every expected field where code reads the source', () => {
    for (const id of ['director-form-pdf', 'directors-csv', 'subscriber-docx', 'paste-labelled']) {
      expect(byId(id).missed, id).toEqual([]);
    }
  });

  it('proposes nothing for a document that names another client', () => {
    expect(byId('wrong-company').proposed).toEqual([]);
    expect(summarise(outcomes).wrongClientWrites).toBe(0);
  });

  it('never shows a raw identity value in what the card displays', () => {
    expect(summarise(outcomes).rawLeaks).toBe(0);
  });
});
