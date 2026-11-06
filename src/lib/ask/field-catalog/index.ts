import { getItem } from '@/data/checklist';
import generated from './catalog.generated.json';
import { NOT_WRITABLE } from './rules';
import type { CatalogEntry, FieldUse } from './types';

/** The written catalog (`npm run ask:catalog`). Reading it costs nothing per request. */
export const FIELD_CATALOG = generated as CatalogEntry[];

const BY_KEY = new Map(FIELD_CATALOG.map((entry) => [entry.key, entry]));

export function catalogEntry(key: string): CatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** A checklist use the data router may fill: an incorporation step, and no workflow stamp or numbered slot. */
export function isWritableUse(use: FieldUse): boolean {
  if (use.source !== 'checklist' || use.field.includes('#') || NOT_WRITABLE.test(use.field)) return false;
  const bucket = getItem(use.ref)?.bucket;
  return bucket === 'pre-inc' || bucket === 'post-inc';
}

/** A list with no person behind it (extra NIC codes) has no way to say which entry a value is for. */
const REPEATS_WITH_A_PERSON = new Set(['directors', 'subscribers']);

export function writableUses(entry: CatalogEntry): FieldUse[] {
  return entry.uses.filter((use) => isWritableUse(use) && (!use.repeat || REPEATS_WITH_A_PERSON.has(use.repeat)));
}

export function entryForField(stepId: string, fieldId: string, repeat?: string): CatalogEntry | undefined {
  const slotless = fieldId.replace(/\d+(?=[A-Z])/, '#');
  return FIELD_CATALOG.find((entry) =>
    entry.uses.some((use) => use.source === 'checklist' && use.ref === stepId && (use.field === fieldId || use.field === slotless) && use.repeat === repeat),
  );
}
