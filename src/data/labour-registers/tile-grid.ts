/**
 * LABOUR REGISTERS — the state tile grid.
 *
 * One equal-size tile per state and union territory, laid out on a grid in roughly India's
 * shape. It is a schematic, not a map: no boundary is drawn, nothing is to scale, and no line
 * in it represents a border.
 *
 * That is the point, and it is deliberate on three counts.
 *
 *  1. **Boundaries.** Survey of India remains the arbiter of maps depicting state and national
 *     boundaries, and apps have been removed from stores over how they drew India. A tile grid
 *     depicts no boundary at all, so there is nothing to get wrong. Every freely licensed
 *     outline checked was either stale — the one first used here still showed Jammu and Kashmir
 *     with no Ladakh — barred from commercial use, or drawn to a view of India's borders that
 *     its maintainers decline to change.
 *  2. **Reach.** On a geographic outline, Delhi, Chandigarh, Goa, Sikkim, Puducherry,
 *     Lakshadweep and the Andamans are a few pixels across, and several of them are
 *     high-volume compliance jurisdictions — the most-used targets would be the hardest to
 *     hit. Equal tiles meet the WCAG 2.2 target size at form scale.
 *  3. **Weight.** Thirty-six rectangles against a few hundred kilobytes of path data.
 *
 * Positions are `row` and `col` on a 1-indexed grid, north-west to south-east. They are
 * arranged to read as India at a glance; they are not coordinates and must not be used as any.
 */

export interface StateTile {
  /** ISO 3166-2:IN subdivision code without the `IN-` prefix. */
  code: string;
  name: string;
  /** What the tile prints: two letters, because a tile is small. */
  short: string;
  row: number;
  col: number;
}

/** Grid extent, so the component does not have to compute it on every render. */
export const TILE_ROWS = 8;
export const TILE_COLS = 10;

export const STATE_TILES: StateTile[] = [
  /* The north. */
  { code: 'LA', name: 'Ladakh', short: 'LA', row: 1, col: 4 },
  { code: 'JK', name: 'Jammu and Kashmir', short: 'JK', row: 2, col: 3 },
  { code: 'HP', name: 'Himachal Pradesh', short: 'HP', row: 2, col: 4 },
  { code: 'UK', name: 'Uttarakhand', short: 'UK', row: 2, col: 5 },
  { code: 'PB', name: 'Punjab', short: 'PB', row: 3, col: 3 },
  { code: 'CH', name: 'Chandigarh', short: 'CH', row: 3, col: 4 },
  { code: 'SK', name: 'Sikkim', short: 'SK', row: 3, col: 8 },
  { code: 'AR', name: 'Arunachal Pradesh', short: 'AR', row: 3, col: 10 },
  { code: 'HR', name: 'Haryana', short: 'HR', row: 4, col: 3 },
  { code: 'DL', name: 'Delhi', short: 'DL', row: 4, col: 4 },
  { code: 'RJ', name: 'Rajasthan', short: 'RJ', row: 4, col: 2 },
  { code: 'UP', name: 'Uttar Pradesh', short: 'UP', row: 4, col: 5 },
  { code: 'BR', name: 'Bihar', short: 'BR', row: 4, col: 7 },
  { code: 'AS', name: 'Assam', short: 'AS', row: 4, col: 9 },
  { code: 'NL', name: 'Nagaland', short: 'NL', row: 4, col: 10 },

  /* The middle. */
  { code: 'GJ', name: 'Gujarat', short: 'GJ', row: 5, col: 1 },
  { code: 'MP', name: 'Madhya Pradesh', short: 'MP', row: 5, col: 4 },
  { code: 'CG', name: 'Chhattisgarh', short: 'CG', row: 5, col: 6 },
  { code: 'JH', name: 'Jharkhand', short: 'JH', row: 5, col: 7 },
  { code: 'WB', name: 'West Bengal', short: 'WB', row: 5, col: 8 },
  { code: 'ML', name: 'Meghalaya', short: 'ML', row: 5, col: 9 },
  { code: 'MN', name: 'Manipur', short: 'MN', row: 5, col: 10 },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', short: 'DD', row: 6, col: 1 },
  { code: 'MH', name: 'Maharashtra', short: 'MH', row: 6, col: 3 },
  { code: 'TG', name: 'Telangana', short: 'TG', row: 6, col: 5 },
  { code: 'OD', name: 'Odisha', short: 'OD', row: 6, col: 7 },
  { code: 'TR', name: 'Tripura', short: 'TR', row: 6, col: 9 },
  { code: 'MZ', name: 'Mizoram', short: 'MZ', row: 6, col: 10 },

  /* The south and the islands. */
  { code: 'GA', name: 'Goa', short: 'GA', row: 7, col: 2 },
  { code: 'KA', name: 'Karnataka', short: 'KA', row: 7, col: 4 },
  { code: 'AP', name: 'Andhra Pradesh', short: 'AP', row: 7, col: 6 },
  { code: 'LD', name: 'Lakshadweep', short: 'LD', row: 8, col: 1 },
  { code: 'KL', name: 'Kerala', short: 'KL', row: 8, col: 3 },
  { code: 'TN', name: 'Tamil Nadu', short: 'TN', row: 8, col: 5 },
  { code: 'PY', name: 'Puducherry', short: 'PY', row: 8, col: 6 },
  { code: 'AN', name: 'Andaman and Nicobar Islands', short: 'AN', row: 8, col: 8 },
];

const BY_CODE = new Map(STATE_TILES.map((t) => [t.code, t]));

/** One tile by its state code. */
export function tileFor(code: string): StateTile | undefined {
  return BY_CODE.get(code);
}
