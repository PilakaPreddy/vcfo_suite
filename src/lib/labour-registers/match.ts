/**
 * LABOUR REGISTERS — matching a client's columns to the canonical dataset.
 *
 * The screen this feeds shows what the register needs beside what the client's file has, and
 * lets a project lead fix a row by choosing from a list. Nothing is ever typed.
 *
 * Three decisions here came out of the November 2026 research into dedicated import tools
 * (Flatfile, OneSchema, Dromo, CSVbox and the importers of Stripe, HubSpot, Salesforce and
 * Airtable). All three are design conventions rather than measured findings — no vendor
 * publishes its distance function and no head-to-head accuracy benchmark exists — so they are
 * recorded as reasoning, not as fact:
 *
 *  1. **No percentage reaches the screen.** Every shipped product hides the number: OneSchema
 *     marks an automatic match with a star, Flatfile expresses low confidence by leaving the
 *     destination blank. A score of "71%" implies a precision this matcher cannot honestly
 *     claim, so the result carries a `bucket` and the score stays internal, for ordering and
 *     for tests. VCFO Spectrum's rule that there are six status words and no others points the
 *     same way: a match state is not a work status and must not wear a status chip.
 *  2. **Three candidates, not one.** Flatfile's Portal 3.0 offers the top three fuzzy
 *     candidates where 2.0 offered one. For a selection-only screen that is the difference
 *     between hunting through a dropdown of seventy headings and picking from a short list.
 *  3. **A source column is used at most once.** Two register columns drawing silently from one
 *     payroll column is a wrong register, not a convenience.
 *
 * The matcher is deterministic and offline. No model call, no network: a statutory document
 * should not depend on a third party's availability, and OneSchema's own AI tier ships off by
 * default for the same sort of reason.
 */
import { fieldByKey, type FieldSpec } from '@/data/labour-registers/fields';
import { dice, jaccard, normaliseHeader, tokenSet, trigrams } from './normalise';

/**
 * How sure the matcher is, in the three states the screen draws.
 *
 *  - `auto`      — taken without asking. An exact heading, a known alias, or a mapping
 *                  remembered from this client's last filing.
 *  - `suggested` — a best guess that a person confirms before it is used.
 *  - `none`      — nothing resembles it. The row needs a choice or an explicit decision.
 */
export type MatchBucket = 'auto' | 'suggested' | 'none';

/** Why a match landed where it did. Shown as a short phrase beside the row. */
export type MatchReason =
  | 'exact heading'
  | 'known alias'
  | 'remembered from last filing'
  | 'similar heading'
  | 'no candidate';

export interface Candidate {
  /** The heading as it appears in the client's file, unchanged. */
  header: string;
  /** Its position in the uploaded sheet, so two identical headings stay distinguishable. */
  index: number;
  /** Internal, for ordering and tests. Never rendered. */
  score: number;
  reason: MatchReason;
}

export interface FieldMatch {
  /** The canonical dataset field being filled. */
  field: string;
  bucket: MatchBucket;
  /** The chosen column, when the bucket is `auto` or a suggestion is on offer. */
  chosen?: Candidate;
  /** Up to three ranked options, best first, including the chosen one. */
  candidates: Candidate[];
  reason: MatchReason;
}

export interface MatchInput {
  /** The canonical fields this upload has to fill, in the order the screen should list them. */
  fields: string[];
  /** The headings of the uploaded sheet, in sheet order. */
  headers: string[];
  /**
   * A mapping remembered for this client, as canonical field to normalised heading. Stored
   * normalised so a change of case or punctuation between months still matches.
   */
  remembered?: Record<string, string>;
  /** Headings to leave out of matching: the per-day attendance block, already mapped as a group. */
  exclude?: number[];
}

/* The thresholds. They are tuned against the headings in the filed workbooks in this
   repository's tests, and they are the only numbers in the matcher that a change would make
   visible to a user, so they are named rather than inlined. */
const AUTO_AT = 0.9;
const SUGGEST_AT = 0.45;
/** Flatfile's Automap plugin treats above ninety per cent as a strong match; this matches it. */
const MAX_CANDIDATES = 3;

/** Every alias of a field, plus its own label and key, as comparable normalised strings. */
function aliasesOf(spec: FieldSpec): string[] {
  return [spec.label, spec.key, ...spec.aliases].map(normaliseHeader);
}

/**
 * How well one heading fills one field, between 0 and 1. The parts are combined by taking the
 * strongest signal rather than averaging, because a heading that matches an alias exactly
 * should not be dragged down by sharing no trigrams with the field's label.
 */
export function scoreHeader(spec: FieldSpec, header: string): { score: number; reason: MatchReason } {
  const norm = normaliseHeader(header);
  if (!norm) return { score: 0, reason: 'no candidate' };

  const aliases = aliasesOf(spec);
  if (aliases.includes(norm)) {
    /* An exact hit on the field's own label or key is an exact heading; an exact hit on a
       recorded alias is a known alias. Both are taken without asking, but they are reported
       differently because a preparer reads the reason. */
    const isOwn = norm === normaliseHeader(spec.label) || norm === normaliseHeader(spec.key);
    return { score: 1, reason: isOwn ? 'exact heading' : 'known alias' };
  }

  const headerTokenSet = tokenSet(header);
  const headerTris = trigrams(header);

  let best = 0;
  for (const alias of aliases) {
    const aTokens = tokenSet(alias);
    const tokenScore = Math.max(dice(aTokens, headerTokenSet), jaccard(aTokens, headerTokenSet));
    /* Trigrams are discounted: they catch typos and run-together headings, but on their own
       they also make unrelated money columns look alike. */
    const triScore = dice(trigrams(alias), headerTris) * 0.85;
    /* A heading that contains every token of an alias is a strong signal even when it carries
       extra words, which is how `Total attendance/ Units of work done` reaches `daysWorked`. */
    const covered = [...aTokens].every((t) => headerTokenSet.has(t)) && aTokens.size > 0 ? 0.92 : 0;
    best = Math.max(best, tokenScore, triScore, covered);
  }
  return { score: best, reason: best >= AUTO_AT ? 'known alias' : 'similar heading' };
}

/**
 * Match every requested field against the uploaded headings.
 *
 * A remembered mapping wins outright when its heading is still present, which is what makes
 * the second month's filing a confirmation rather than a mapping exercise. Otherwise each
 * field takes the best unclaimed heading, strongest field first, so a confident match is not
 * robbed of its column by a weaker field that happened to be listed earlier.
 */
export function matchColumns(input: MatchInput): FieldMatch[] {
  const excluded = new Set(input.exclude ?? []);
  const headers = input.headers.map((header, index) => ({ header, index })).filter((h) => !excluded.has(h.index) && normaliseHeader(h.header) !== '');

  const specs = input.fields
    .map((key) => fieldByKey(key))
    .filter((s): s is FieldSpec => Boolean(s));

  /* Score every field against every heading once. */
  const scored = new Map<string, Candidate[]>();
  for (const spec of specs) {
    const list: Candidate[] = [];
    for (const { header, index } of headers) {
      const { score, reason } = scoreHeader(spec, header);
      if (score > 0) list.push({ header, index, score, reason });
    }
    list.sort((a, b) => b.score - a.score || a.index - b.index);
    scored.set(spec.key, list);
  }

  const claimed = new Set<number>();
  const result = new Map<string, FieldMatch>();

  /* A remembered heading is claimed first, before any scoring is allowed to take it. */
  const remembered = input.remembered ?? {};
  for (const spec of specs) {
    const want = remembered[spec.key];
    if (!want) continue;
    const hit = headers.find((h) => normaliseHeader(h.header) === want && !claimed.has(h.index));
    if (!hit) continue;
    claimed.add(hit.index);
    const chosen: Candidate = { header: hit.header, index: hit.index, score: 1, reason: 'remembered from last filing' };
    result.set(spec.key, {
      field: spec.key,
      bucket: 'auto',
      chosen,
      candidates: [chosen, ...(scored.get(spec.key) ?? []).filter((c) => c.index !== hit.index).slice(0, MAX_CANDIDATES - 1)],
      reason: 'remembered from last filing',
    });
  }

  /* Then the strongest remaining pairing, repeatedly, so the best match claims its column. */
  const pending = specs.filter((s) => !result.has(s.key));
  pending.sort((a, b) => (scored.get(b.key)?.[0]?.score ?? 0) - (scored.get(a.key)?.[0]?.score ?? 0));

  for (const spec of pending) {
    const open = (scored.get(spec.key) ?? []).filter((c) => !claimed.has(c.index));
    const top = open.slice(0, MAX_CANDIDATES);
    const best = top[0];
    if (!best || best.score < SUGGEST_AT) {
      result.set(spec.key, { field: spec.key, bucket: 'none', candidates: top, reason: 'no candidate' });
      continue;
    }
    const bucket: MatchBucket = best.score >= AUTO_AT ? 'auto' : 'suggested';
    if (bucket === 'auto') claimed.add(best.index);
    result.set(spec.key, { field: spec.key, bucket, chosen: best, candidates: top, reason: best.reason });
  }

  /* Return in the order the caller asked for, so the screen controls its own ordering. */
  return input.fields
    .map((key) => result.get(key))
    .filter((m): m is FieldMatch => Boolean(m));
}

/** The headings of an upload that no field took, which the screen reports as ignored. */
export function unusedHeaders(input: MatchInput, matches: FieldMatch[]): Array<{ header: string; index: number }> {
  const used = new Set(matches.filter((m) => m.bucket === 'auto' && m.chosen).map((m) => m.chosen!.index));
  const excluded = new Set(input.exclude ?? []);
  return input.headers
    .map((header, index) => ({ header, index }))
    .filter((h) => !used.has(h.index) && !excluded.has(h.index) && normaliseHeader(h.header) !== '');
}

/** A one-line count for the screen's summary band. */
export function matchSummary(matches: FieldMatch[]): { auto: number; suggested: number; none: number } {
  return {
    auto: matches.filter((m) => m.bucket === 'auto').length,
    suggested: matches.filter((m) => m.bucket === 'suggested').length,
    none: matches.filter((m) => m.bucket === 'none').length,
  };
}

/**
 * The mapping to remember for next month: canonical field to normalised heading, for the
 * columns a person accepted. Only `auto` rows are remembered — a suggestion nobody confirmed
 * is not knowledge about this client.
 */
export function rememberable(matches: FieldMatch[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of matches) {
    if (m.bucket === 'auto' && m.chosen) out[m.field] = normaliseHeader(m.chosen.header);
  }
  return out;
}

