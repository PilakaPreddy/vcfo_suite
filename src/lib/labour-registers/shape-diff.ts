/**
 * LABOUR REGISTERS — what changed since last month.
 *
 * The research found a real gap: no import product documents a changed-shape view. Every one
 * of them remembers a mapping and silently re-applies it, and Airtable's own community threads
 * are evidence that this goes wrong quietly. For a filing that recurs every month, the single
 * most useful sentence the reconciliation screen can offer is "three columns are new and two
 * have gone since September" — because a column that disappeared is a statutory column that
 * will print empty, and nobody will notice until an inspection.
 *
 * So this is deliberately small and deliberately prominent in the interface.
 */
import { normaliseHeader } from './normalise';

export interface ShapeDiff {
  /** True when the headings are identical to last time, ignoring case and punctuation. */
  unchanged: boolean;
  /** Headings present now and not before. */
  added: string[];
  /** Headings present before and not now. */
  removed: string[];
  /** Headings whose position moved, which matters only for the per-day block. */
  moved: Array<{ header: string; was: number; now: number }>;
  /**
   * Removed headings that a previous mapping relied on. These are the dangerous ones: the
   * mapping will silently fall back to a guess or to nothing.
   */
  brokenMappings: Array<{ field: string; wasHeader: string }>;
}

/**
 * Compare this upload's headings with the last one's.
 *
 * `previousMapping` is the saved canonical-field-to-normalised-heading map, so the comparison
 * can say not just that a column went but which register column it was filling.
 */
export function diffShape(
  previousHeaders: string[],
  currentHeaders: string[],
  previousMapping: Record<string, string> = {},
): ShapeDiff {
  const prevNorm = previousHeaders.map(normaliseHeader).filter(Boolean);
  const currNorm = currentHeaders.map(normaliseHeader).filter(Boolean);
  const prevSet = new Set(prevNorm);
  const currSet = new Set(currNorm);

  const added = currentHeaders.filter((h) => {
    const n = normaliseHeader(h);
    return n && !prevSet.has(n);
  });
  const removed = previousHeaders.filter((h) => {
    const n = normaliseHeader(h);
    return n && !currSet.has(n);
  });

  const moved: ShapeDiff['moved'] = [];
  for (const [i, h] of currentHeaders.entries()) {
    const n = normaliseHeader(h);
    if (!n) continue;
    const was = prevNorm.indexOf(n);
    if (was >= 0 && was !== i) moved.push({ header: h, was, now: i });
  }

  const brokenMappings: ShapeDiff['brokenMappings'] = [];
  for (const [field, header] of Object.entries(previousMapping)) {
    if (header && !currSet.has(header)) brokenMappings.push({ field, wasHeader: header });
  }

  return {
    unchanged: added.length === 0 && removed.length === 0,
    added,
    removed,
    moved,
    brokenMappings,
  };
}

/**
 * The sentence the screen leads with. One line, counts first, because a preparer reading it
 * has twelve clients to get through.
 */
export function describeShapeDiff(diff: ShapeDiff): string {
  if (diff.unchanged) return 'Same columns as last month.';
  const parts: string[] = [];
  if (diff.added.length > 0) parts.push(`${diff.added.length} new`);
  if (diff.removed.length > 0) parts.push(`${diff.removed.length} gone`);
  const head = parts.join(', ');
  if (diff.brokenMappings.length === 0) return `${head} since last month.`;
  return `${head} since last month — ${diff.brokenMappings.length} mapped column(s) no longer in the file.`;
}
