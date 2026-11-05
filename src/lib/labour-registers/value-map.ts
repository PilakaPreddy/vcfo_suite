/**
 * LABOUR REGISTERS — mapping values, not just columns.
 *
 * Getting the right column is half the job. The other half is that the client writes `M` where
 * the register needs `Male`, and `PR`, `Present` or `1` where the muster roll needs `P`. The
 * research found this is a first-class step in every mature importer — Flatfile calls it enum
 * mapping, nuvo calls it option mapping — and that it runs the same exact-then-alias-then-fuzzy
 * cascade over values that the column matcher runs over headings.
 *
 * It fits the "nothing is typed" rule exactly: enumerate the distinct values a column actually
 * contains, and give each one a list of our allowed values to choose from.
 */
import { ATTENDANCE_CODES, fieldByKey } from '@/data/labour-registers/fields';
import { normaliseHeader } from './normalise';

/** One distinct source value and what it should become. */
export interface ValueMatch {
  /** The value as it appears in the sheet. */
  source: string;
  /** How many rows carry it, so the screen can order by weight. */
  count: number;
  /** The canonical value chosen, when one was. */
  target?: string;
  /** Automatic when an alias settled it, suggested when it is a guess, none when it is unknown. */
  bucket: 'auto' | 'suggested' | 'none';
  /** The allowed values, best guess first. */
  candidates: string[];
}

/**
 * Aliases for the values the registers use. Taken from real exports: the attendance grid of
 * one client uses `P`, `A`, `WO`, `WOP`, `H`, `M`, `PVL` and `SCL`, and `PVL` is that client's
 * name for privilege leave, which is paid leave.
 */
const VALUE_ALIASES: Record<string, Record<string, string[]>> = {
  sex: {
    Male: ['m', 'male', 'man', 'men', 'he', '1'],
    Female: ['f', 'female', 'woman', 'women', 'she', '2'],
    Transgender: ['t', 'tg', 'transgender', 'other', 'o', '3'],
  },
  attendanceGrid: {
    P: ['p', 'pr', 'present', 'present day', '1', 'y', 'yes', 'full day', 'fd'],
    A: ['a', 'ab', 'absent', '0', 'n', 'no', 'lop day'],
    WO: ['wo', 'w', 'weekoff', 'week off', 'wk off', 'off', 'holiday weekly', 'sunday'],
    WOP: ['wop', 'wo p', 'week off present', 'week off worked', 'weekoff working', 'owo'],
    H: ['h', 'ho', 'holiday', 'nfh', 'festival holiday', 'national holiday', 'ph'],
    HP: ['hp', 'holiday present', 'holiday worked', 'oh'],
    PL: ['pl', 'pvl', 'privilege leave', 'paid leave', 'el', 'earned leave', 'al', 'annual leave'],
    SCL: ['scl', 'sl', 'cl', 'sick leave', 'casual leave', 'sick or casual leave'],
    M: ['m', 'ml', 'maternity', 'maternity leave', 'mat'],
    LOP: ['lop', 'lwp', 'loss of pay', 'leave without pay', 'unpaid leave'],
  },
};

/** The canonical values a field allows, or null when it is not an enumerated field. */
function allowedValues(field: string): string[] | null {
  if (field === 'attendanceGrid') return Object.keys(ATTENDANCE_CODES);
  const spec = fieldByKey(field);
  return spec?.values ?? null;
}

/**
 * Score one source value against one canonical value. Exact and alias hits are taken; a prefix
 * or containment match is offered as a suggestion; anything else is left alone.
 *
 * `M` is the reason this is not simply a lookup: in a sex column it means Male, and in an
 * attendance grid it means maternity leave. The alias tables are therefore per field, never
 * global, and a value is only ever resolved against the field it was found in.
 */
function scoreValue(field: string, source: string, target: string): number {
  const s = normaliseHeader(source);
  const t = normaliseHeader(target);
  if (!s) return 0;
  if (s === t) return 1;
  const aliases = VALUE_ALIASES[field]?.[target] ?? [];
  if (aliases.includes(s)) return 1;
  if (aliases.some((a) => a.startsWith(s) && s.length >= 2)) return 0.7;
  if (aliases.some((a) => s.startsWith(a) && a.length >= 2)) return 0.6;
  if (t.startsWith(s) && s.length >= 2) return 0.55;
  return 0;
}

/**
 * Map the distinct values of one column onto the field's allowed values.
 *
 * Values are returned in descending frequency, so the chooser starts with what matters: in a
 * month of attendance, `P` and `WO` are thousands of cells and an odd `SCL` is four.
 */
export function matchValues(field: string, values: Iterable<string>): ValueMatch[] {
  const allowed = allowedValues(field);
  if (!allowed) return [];

  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const out: ValueMatch[] = [];
  for (const [source, count] of counts) {
    const ranked = allowed
      .map((target) => ({ target, score: scoreValue(field, source, target) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    out.push({
      source,
      count,
      target: best?.target,
      bucket: !best ? 'none' : best.score >= 1 ? 'auto' : 'suggested',
      candidates: ranked.slice(0, 4).map((r) => r.target),
    });
  }
  return out.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

/** The lookup to apply when rendering, from the choices a person accepted. */
export function valueLookup(matches: ValueMatch[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of matches) if (m.bucket === 'auto' && m.target) out[m.source] = m.target;
  return out;
}

/**
 * The source values nobody has resolved. A muster roll with an unresolved code in it is not
 * fit to file, so the batch is blocked on this rather than printing the client's own code and
 * hoping an inspector reads it the same way.
 */
export function unresolvedValues(matches: ValueMatch[]): ValueMatch[] {
  return matches.filter((m) => m.bucket !== 'auto');
}
