/**
 * The T3 resolver payload (SAFETY.md G9 and G10).
 *
 * `buildResolvePayload` takes no profile and no values: its inputs are the recipe field (key
 * name and recorded label) and scanned controls, whose type carries no value at all. As a second
 * net, any label text that happens to contain a known profile value is redacted, because a portal
 * can echo client data into a label. Option texts are never sent.
 */
import type { RecipeField, ResolveCandidate, ResolvePayload, ScannedField } from '../shared/types';

export const MAX_CANDIDATES = 40;
const MAX_TEXT = 120;

const cut = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s) continue;
    const re = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '[redacted]');
  }
  return out;
}

/** Strings worth redacting: every leaf string or number of length 3 or more in the profile. */
export function profileLeafValues(profile: unknown, out: string[] = []): string[] {
  if (profile == null) return out;
  if (typeof profile === 'string') {
    if (profile.trim().length >= 3) out.push(profile.trim());
  } else if (typeof profile === 'number') {
    if (String(profile).length >= 3) out.push(String(profile));
  } else if (Array.isArray(profile)) {
    for (const v of profile) profileLeafValues(v, out);
  } else if (typeof profile === 'object') {
    for (const v of Object.values(profile as Record<string, unknown>)) profileLeafValues(v, out);
  }
  // Longest first, so a long value is redacted before a short value inside it.
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Candidate list and payload for one unresolved field. `candidates[i].i` indexes `pool`, which the
 * engine keeps locally to map the AI's choice back to a control. Refused (secret) controls are
 * never candidates.
 */
export function buildResolvePayload(
  field: Pick<RecipeField, 'key' | 'label'>,
  scanned: ScannedField[],
  redactValues: string[] = [],
): { payload: ResolvePayload; pool: ScannedField[] } {
  const pool = scanned.filter((c) => !c.refused && c.visible).slice(0, MAX_CANDIDATES);
  const candidates: ResolveCandidate[] = pool.map((c, i) => {
    const entry: ResolveCandidate = { i, label: redact(cut(c.label || c.placeholder || ''), redactValues) };
    if (c.name) entry.name = redact(cut(c.name), redactValues);
    if (c.aria) entry.aria = redact(cut(c.aria), redactValues);
    return entry;
  });
  return {
    payload: { fieldKey: field.key, fieldLabel: cut(field.label), candidates },
    pool,
  };
}

/** G10: the only acceptable answer is an integer index into the list, or null. */
export function validChoice(choice: unknown, poolSize: number): number | null | 'invalid' {
  if (choice === null) return null;
  if (typeof choice !== 'number' || !Number.isInteger(choice)) return 'invalid';
  if (choice < 0 || choice >= poolSize) return 'invalid';
  return choice;
}
