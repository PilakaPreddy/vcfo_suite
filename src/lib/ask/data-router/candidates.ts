import { FIELD_CATALOG, writableUses } from '@/lib/ask/field-catalog';
import { normalizeLabel } from '@/lib/ask/field-catalog/rules';
import type { CatalogEntry } from '@/lib/ask/field-catalog/types';
import { formatOfValue } from './formats';
import type { ReadValue } from './types';

/**
 * Step 2: the places a value could go, out of the catalog only. A unique exact name is settled here
 * with no model; anything less clear becomes a short list for `chooseFields`, which can pick only
 * from that list.
 */

/** Virtual keys (a whole name) fill other keys, so they count as places to write. */
const WRITABLE = FIELD_CATALOG.filter((entry) => entry.expands?.length || (entry.format !== 'file' && writableUses(entry).length > 0));

let synonyms: Set<string> | null = null;
export function catalogSynonyms(): ReadonlySet<string> {
  return (synonyms ??= new Set(WRITABLE.flatMap((entry) => entry.synonyms)));
}

const PERSON_SUBJECTS: ReadonlySet<string> = new Set(['director', 'subscriber']);
const MAX_CANDIDATES = 6;
/** One shared word in three is the least that can mean the same fact; "type of registration" and "business type" do not. */
const MIN_OVERLAP = 1 / 3;

const tokensOf = (text: string) => new Set(normalizeLabel(text).split(' ').filter(Boolean));

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

export interface CandidateResult {
  /** Settled by code. */
  exact: CatalogEntry | null;
  candidates: CatalogEntry[];
}

/** `subject` narrows a person's value when the source or the request says which list it is for. */
export function candidatesFor(value: ReadValue, subject: 'director' | 'subscriber' | null): CandidateResult {
  const label = normalizeLabel(value.label);
  const shape = formatOfValue(value.value);
  // A value with a shape only one kind of field holds rules out every other kind.
  const pool = shape ? WRITABLE.filter((entry) => entry.format === shape) : WRITABLE;
  // A person's value goes to that person's list, and a value with nobody behind it to the company.
  const all = pool.filter((entry) => entry.synonyms.includes(label));
  const people = all.filter((entry) => PERSON_SUBJECTS.has(entry.subject) && (!subject || entry.subject === subject));
  const others = all.filter((entry) => !PERSON_SUBJECTS.has(entry.subject));
  const named = value.person ? (people.length > 0 ? people : others) : others.length > 0 ? others : all;
  if (named.length === 1) return { exact: named[0]!, candidates: named };
  if (named.length > 1) return { exact: null, candidates: named };

  const tokens = tokensOf(value.label);
  // Free-text fields take anything, so only their exact name reaches them.
  const scored = pool
    .filter((entry) => entry.format !== 'longtext' && !/notes?$/i.test(entry.key))
    .map((entry) => ({ entry, score: Math.max(...entry.synonyms.map((s) => overlap(tokens, tokensOf(s)))) }))
    .filter((s) => s.score >= MIN_OVERLAP)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.entry);
  // A value whose shape leaves one place to go needs no model either.
  if (shape && pool.length === 1) return { exact: pool[0]!, candidates: pool };
  return { exact: null, candidates: scored.length > 0 ? scored : shape ? pool.slice(0, MAX_CANDIDATES) : [] };
}
