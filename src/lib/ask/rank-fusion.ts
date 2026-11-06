/** Reciprocal rank fusion's usual constant: it keeps one list's first place from outweighing agreement. */
const RRF_K = 60;

/**
 * Merges ranked lists into one, best first. A row found by several lists adds up its scores. Ties
 * keep list order, so the caller's first list wins a tie.
 */
export function fuseRanked<T extends { id: string }>(lists: ReadonlyArray<readonly T[]>, limit: number): T[] {
  const merged = new Map<string, { row: T; score: number }>();
  for (const list of lists) {
    list.forEach((row, rank) => {
      const seen = merged.get(row.id);
      merged.set(row.id, { row: seen?.row ?? row, score: (seen?.score ?? 0) + 1 / (RRF_K + rank + 1) });
    });
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((m) => m.row);
}
