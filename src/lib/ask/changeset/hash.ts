import { createHash } from 'node:crypto';
import type { JsonValue } from './types';

function canonical(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 of what a card proposes: an approval only ever matches this exact content. */
export function changesetHash(rows: ReadonlyArray<{ action: string; target: JsonValue; newValue: JsonValue }>): string {
  const content = rows.map((row) => canonical({ action: row.action, target: row.target, newValue: row.newValue }));
  return createHash('sha256').update(`[${content.join(',')}]`).digest('hex');
}
