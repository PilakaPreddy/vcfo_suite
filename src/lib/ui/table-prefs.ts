/**
 * Table preferences kept in the browser (VCFO Spectrum E-06, E-07, E-08): saved views, row
 * density and the last visit to a page. Everything sits in localStorage behind try/catch, so a
 * private window or a full quota only means the choice lasts for this page. Nothing here is a
 * record of work; the database never sees it.
 */

export type ViewFilters = Record<string, string>;

export interface SavedView {
  key: string;
  label: string;
  filters: ViewFilters;
}

export type Density = 'comfortable' | 'compact';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* No storage: the choice lasts for this page only. */
  }
}

/* ------------------------------------------------------------- saved views */

export const savedViewsKey = (storageKey: string) => `vcfo.views.${storageKey}`;

/** Two filter sets are the same when every key has the same value; a missing key equals "". */
export function sameFilters(a: ViewFilters, b: ViewFilters): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? '') === (b[k] ?? ''));
}

/** The key of the view that matches the filters, or "" when none matches. */
export function activeView(views: SavedView[], current: ViewFilters): string {
  return views.find((v) => sameFilters(v.filters, current))?.key ?? '';
}

/** The person's own views for one table. Bad or foreign data reads as no views. */
export function readSavedViews(storageKey: string): SavedView[] {
  const raw = readRaw(savedViewsKey(storageKey));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        !!v &&
        typeof v === 'object' &&
        typeof (v as SavedView).key === 'string' &&
        typeof (v as SavedView).label === 'string' &&
        !!(v as SavedView).filters &&
        typeof (v as SavedView).filters === 'object',
    );
  } catch {
    return [];
  }
}

export function writeSavedViews(storageKey: string, views: SavedView[]): void {
  writeRaw(savedViewsKey(storageKey), JSON.stringify(views));
}

/** True when a view with this label exists already (case and outer spaces ignored). */
export function viewLabelTaken(views: SavedView[], label: string): boolean {
  const l = label.trim().toLowerCase();
  return views.some((v) => v.label.trim().toLowerCase() === l);
}

/**
 * Adds a view for the current filters. Returns the new list, or null when the label is empty or
 * taken (among the default views too, passed as `others`).
 */
export function addSavedView(
  mine: SavedView[],
  label: string,
  filters: ViewFilters,
  { others = [], now = Date.now() }: { others?: SavedView[]; now?: number } = {},
): SavedView[] | null {
  const name = label.trim().slice(0, 32);
  if (!name || viewLabelTaken([...others, ...mine], name)) return null;
  return [...mine, { key: `c-${now}`, label: name, filters: { ...filters } }];
}

/* ------------------------------------------------------------------ density */

const densityKey = (scope: string) => `vcfo.density.${scope}`;

/** The person's own default density (Profile > Appearance). A table without its own choice uses it. */
const PERSON_DENSITY_KEY = 'vcfo.density';

export function readPersonDensity(): Density {
  return readRaw(PERSON_DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}

export function writePersonDensity(d: Density): void {
  writeRaw(PERSON_DENSITY_KEY, d);
}

export function readDensity(scope: string): Density {
  const v = readRaw(densityKey(scope));
  if (v === 'compact' || v === 'comfortable') return v;
  return readPersonDensity();
}

/* ---------------------------------------------------------------- text size */

export type TextSize = 'small' | 'default' | 'large';
const TEXT_SIZE_KEY = 'vcfo.text-size';

export function readTextSize(): TextSize {
  const v = readRaw(TEXT_SIZE_KEY);
  return v === 'small' || v === 'large' ? v : 'default';
}

export function writeTextSize(t: TextSize): void {
  writeRaw(TEXT_SIZE_KEY, t);
}

/**
 * Put the person's density and text size on <html> (`data-density`, `data-text-size`), which
 * app/globals.css reads. The default values remove the attribute.
 */
export function applyAppearanceAttributes(density: Density = readPersonDensity(), text: TextSize = readTextSize()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (density === 'compact') root.setAttribute('data-density', 'compact');
  else root.removeAttribute('data-density');
  if (text === 'default') root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', text);
}

export function writeDensity(scope: string, d: Density): void {
  writeRaw(densityKey(scope), d);
}

/* --------------------------------------------------------------- last visit */

export const visitKey = (pageKey: string) => `vcfo.visit.${pageKey}`;

/** The previous visit, read once per page load, so the squares stay while the person is on the page. */
const VISITS = new Map<string, number>();

/**
 * The time of the visit before this one, in milliseconds, and the current time is stored as the
 * new last visit. The first call per page load reads and writes storage; later calls return the
 * same value. With nothing stored, `seed` (or 0, meaning "everything is new") is used.
 */
export function takeLastVisit(pageKey: string, { now = Date.now(), seed }: { now?: number; seed?: number } = {}): number {
  const k = visitKey(pageKey);
  const known = VISITS.get(k);
  if (known !== undefined) return known;
  const stored = Number(readRaw(k));
  const prev = readRaw(k) !== null && Number.isFinite(stored) ? stored : (seed ?? 0);
  writeRaw(k, String(now));
  VISITS.set(k, prev);
  return prev;
}

/** Test helper: forget the visits read during this page load. */
export function resetVisitCache(): void {
  VISITS.clear();
}

/** True when the row changed after the last visit. Rows without a time are never new. */
export function isNewSince(changedAt: Date | string | null | undefined, since: number | null): boolean {
  if (since === null || !changedAt) return false;
  const t = changedAt instanceof Date ? changedAt.getTime() : new Date(changedAt).getTime();
  return Number.isFinite(t) && t > since;
}
