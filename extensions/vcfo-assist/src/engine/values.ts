/**
 * Profile values for recipe fields. A key path such as `company.proposedNames.0` is read from the
 * profile and passed through the field's transform. An absent value is reported as missing and
 * never replaced by a default or a guess.
 */
import type { RecipeField, RecipeTransform } from '../shared/types';

/** Reads `company.proposedNames[0]` (Suite's form) or `company.proposedNames.0`. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function applyTransform(raw: unknown, transform: RecipeTransform = 'none'): string | undefined {
  if (raw == null || raw === '') return undefined;
  switch (transform) {
    case 'upper':
      return String(raw).toUpperCase();
    case 'date': {
      const s = String(raw).trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
      return /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s : undefined;
    }
    case 'amount': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s₹]/g, ''));
      return Number.isFinite(n) ? String(n) : undefined;
    }
    case 'yesNo':
      if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
      if (/^(yes|y|true)$/i.test(String(raw))) return 'Yes';
      if (/^(no|n|false)$/i.test(String(raw))) return 'No';
      return undefined;
    case 'nicDivision': {
      const m = /^(\d{2})/.exec(String(raw).trim());
      return m ? m[1] : undefined;
    }
    default:
      return typeof raw === 'object' ? undefined : String(raw);
  }
}

export function valueFor(profile: Record<string, unknown> | undefined, field: RecipeField): string | undefined {
  return applyTransform(getPath(profile, field.key), field.transform);
}
