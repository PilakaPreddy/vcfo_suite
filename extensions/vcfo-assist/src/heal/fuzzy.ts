/**
 * T1 of the heal ladder: deterministic matching on name, aria label and label text. No AI, no
 * network, 0 tokens. A match must be clearly better than the runner-up, so two similar labels
 * ("Proposed name 1" and "Proposed name 2") never get swapped.
 */
import { words } from '../guards';
import type { RecipeField, ScannedField } from '../shared/types';

const STOP = new Set(['the', 'of', 'a', 'an', 'in', 'for', 'to', 'and', 'or', 'is', 'option', 'please', 'enter', 'select']);

export function tokens(s: string): string[] {
  return words(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t));
}

/** Dice coefficient over tokens, with a bonus when every recipe token is present. */
export function labelScore(recipeLabel: string, candidate: string): number {
  const a = tokens(recipeLabel);
  const b = tokens(candidate);
  if (!a.length || !b.length) return 0;
  if (a.join(' ') === b.join(' ')) return 1;
  const setB = new Set(b);
  const common = a.filter((t) => setB.has(t)).length;
  const dice = (2 * common) / (a.length + b.length);
  const containsAll = common === a.length ? 0.15 : 0;
  // Digits carry meaning ("name 1" vs "name 2"): a digit the recipe has and the candidate lacks is fatal.
  const digitsA = a.filter((t) => /^\d+$/.test(t));
  const digitMiss = digitsA.some((d) => !setB.has(d));
  if (digitMiss) return Math.min(dice, 0.4);
  return Math.min(0.99, dice + containsAll);
}

const controlMatches = (field: RecipeField, c: ScannedField): boolean => {
  if (!field.control) return true;
  if (field.control === 'text') return c.tag === 'input';
  return c.tag === field.control;
};

export interface T1Match {
  candidate: ScannedField;
  score: number;
  by: 'name' | 'aria' | 'label';
}

export const T1_MIN_SCORE = 0.75;
export const T1_MIN_MARGIN = 0.12;

/** Best T1 match among `candidates`, or null when nothing is clearly right. */
export function matchT1(field: RecipeField, candidates: ScannedField[]): T1Match | null {
  const usable = candidates.filter((c) => !c.refused && controlMatches(field, c));
  if (field.name) {
    const byName = usable.filter((c) => c.name.toLowerCase() === field.name!.toLowerCase());
    if (byName.length === 1) return { candidate: byName[0]!, score: 1, by: 'name' };
  }
  const exactAria = usable.filter((c) => c.aria && words(c.aria) === words(field.label));
  if (exactAria.length === 1) return { candidate: exactAria[0]!, score: 1, by: 'aria' };

  const scored = usable
    .map((c) => ({ c, s: Math.max(labelScore(field.label, c.label), labelScore(field.label, c.aria) * 0.95) }))
    .sort((x, y) => y.s - x.s);
  const best = scored[0];
  if (!best || best.s < T1_MIN_SCORE) return null;
  const second = scored[1]?.s ?? 0;
  if (best.s < 1 && best.s - second < T1_MIN_MARGIN) return null;
  return { candidate: best.c, score: best.s, by: 'label' };
}
