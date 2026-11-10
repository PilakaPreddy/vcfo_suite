/**
 * HEAL LADDER (PLAN.md section 3). Finds the control for one recipe field, cheapest tier first:
 *
 *   T0  the recipe's SOM path or CSS selector (the scanner probes both)        0 tokens
 *   T1  deterministic name / aria / fuzzy label match (`./fuzzy.ts`)           0 tokens
 *   T2  on-device model — not built yet; skipped
 *   T3  Suite's resolver picks an index from labels only (`./payload.ts`)      about 1–2k tokens
 *   T4  teach mode: the user clicks the field once (the engine waits for it)   0 tokens
 *
 * Pure: the resolver is passed in, so tests can stub it and inspect what it was sent.
 */
import { matchT1 } from './fuzzy';
import { buildResolvePayload, validChoice } from './payload';
import type { GuardRefusal, HealTier, RecipeField, ResolvePayload, ResolveResponse, ScanResult, ScannedField } from '../shared/types';

export type Resolver = (payload: ResolvePayload) => Promise<ResolveResponse>;

export type LadderResult =
  | { found: true; tier: Exclude<HealTier, 'T4'>; candidate: ScannedField; tokens: number; aiCalls: number }
  | { found: false; refused: GuardRefusal; candidate: ScannedField; tokens: 0; aiCalls: 0 }
  | { found: false; tier: 'T4'; reason: string; tokens: number; aiCalls: number };

export interface LadderDeps {
  /** uids already taken by other fields in this page's plan. */
  claimed: Set<string>;
  resolve?: Resolver;
  /** Profile leaf values, for redaction of label text only. */
  redactValues?: string[];
  /** Turn T3 off (for example when Suite has no resolver or the budget is spent). */
  allowAi?: boolean;
}

export async function resolveField(field: RecipeField, scan: ScanResult, deps: LadderDeps): Promise<LadderResult> {
  const free = scan.fields.filter((f) => !deps.claimed.has(f.uid));

  // T0: the recipe's own SOM or CSS still finds the control.
  const probed = scan.probes[field.key];
  const t0 = probed ? scan.fields.find((f) => f.uid === probed) : undefined;
  if (t0) {
    if (t0.refused) return { found: false, refused: t0.refused, candidate: t0, tokens: 0, aiCalls: 0 };
    if (!deps.claimed.has(t0.uid)) return { found: true, tier: 'T0', candidate: t0, tokens: 0, aiCalls: 0 };
  }

  // T1: deterministic rules.
  const t1 = matchT1(field, free.filter((f) => f.visible));
  if (t1) return { found: true, tier: 'T1', candidate: t1.candidate, tokens: 0, aiCalls: 0 };

  // T3: Suite resolver, labels only.
  if (deps.allowAi !== false && deps.resolve) {
    const { payload, pool } = buildResolvePayload(field, free, deps.redactValues ?? []);
    if (pool.length) {
      try {
        const answer = await deps.resolve(payload);
        const tokens = Number.isFinite(answer?.tokens) ? Number(answer.tokens) : 0;
        // Suite may answer with its own rules (no model call); it says so in `aiCalls`.
        const aiCalls = typeof answer?.aiCalls === 'number' ? answer.aiCalls : 1;
        const choice = validChoice(answer?.choice, pool.length);
        if (typeof choice === 'number') {
          return { found: true, tier: 'T3', candidate: pool[choice]!, tokens, aiCalls };
        }
        return {
          found: false,
          tier: 'T4',
          reason: choice === 'invalid' ? 'resolver answer discarded (not an index from the list)' : 'resolver found no match',
          tokens,
          aiCalls,
        };
      } catch (err) {
        return { found: false, tier: 'T4', reason: `resolver unavailable: ${(err as Error).message}`, tokens: 0, aiCalls: 0 };
      }
    }
  }
  return { found: false, tier: 'T4', reason: 'no rule match', tokens: 0, aiCalls: 0 };
}
