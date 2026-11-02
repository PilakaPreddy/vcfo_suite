import type { ChecklistField } from '@/data/checklist';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';

/**
 * Repeating lists inside a checklist step — proposed directors, subscribers.
 *
 * Storage stays inside the step's flat `responses` map so autosave, the
 * server merge, redaction and the vault need no new plumbing:
 *
 *   responses[group.id]                      = "e1a2b3c4,e5f6a7b8"   (entry order)
 *   responses[`${group.id}.${entryId}.${f}`] = value                 (one per template field)
 *
 * Entry ids are generated once and never reused, so an edit to row 2 cannot
 * land on row 1 after a remove or reorder. Concrete field ids are dotted;
 * the milestone-document upload route already allows dots in a field id.
 */
const REPEAT_SEP = '.';

export type RepeatField = ChecklistField & { type: 'repeat'; entryFields: ChecklistField[] };

export function isRepeatField(field: ChecklistField): field is RepeatField {
  return field.type === 'repeat' && Array.isArray(field.entryFields);
}

function repeatEntryIds(responses: ChecklistItemResponses, groupId: string): string[] {
  return (responses[groupId] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function newRepeatEntryId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `e${random}`;
}

export function repeatFieldId(groupId: string, entryId: string, fieldId: string): string {
  return `${groupId}${REPEAT_SEP}${entryId}${REPEAT_SEP}${fieldId}`;
}

/** `"directors.e1.firstName"` → `{ groupId, entryId, fieldId }`, or null for a plain id. */
export function parseRepeatFieldId(
  id: string,
): { groupId: string; entryId: string; fieldId: string } | null {
  const parts = id.split(REPEAT_SEP);
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  return { groupId: parts[0]!, entryId: parts[1]!, fieldId: parts[2]! };
}

/** The template rendered for one entry: concrete ids, section inherited, `showWhen` re-pointed at the sibling. */
export function expandRepeatEntry(group: RepeatField, entryId: string): ChecklistField[] {
  return group.entryFields.map((field) => ({
    ...field,
    id: repeatFieldId(group.id, entryId, field.id),
    section: field.section ?? group.section,
    ...(field.showWhen
      ? { showWhen: { ...field.showWhen, field: repeatFieldId(group.id, entryId, field.showWhen.field) } }
      : {}),
    ...(field.labelWhen
      ? {
          labelWhen: field.labelWhen.map((rule) => ({
            ...rule,
            field: repeatFieldId(group.id, entryId, rule.field),
          })),
        }
      : {}),
  }));
}

/** Apply `labelWhen` — the field's label for the current sibling values. */
export function resolveFieldLabels(fields: ChecklistField[], responses: ChecklistItemResponses): ChecklistField[] {
  return fields.map((field) => {
    if (!field.labelWhen) return field;
    const hit = field.labelWhen.find((rule) => (responses[rule.field] ?? '').trim() === rule.value);
    return hit ? { ...field, label: hit.label } : field;
  });
}

/** Every concrete field for the entries present in `responses` (the group field itself stays). */
export function expandRepeatFields(
  fields: ChecklistField[],
  responses: ChecklistItemResponses,
): ChecklistField[] {
  const out: ChecklistField[] = [];
  for (const field of fields) {
    out.push(field);
    if (!isRepeatField(field)) continue;
    for (const entryId of repeatEntryIds(responses, field.id)) {
      out.push(...expandRepeatEntry(field, entryId));
    }
  }
  return out;
}

/**
 * Expansion over the union of entry ids in two response maps — what a diff
 * needs, so a removed entry's keys still show up as cleared.
 */
export function expandRepeatFieldsForDiff(
  fields: ChecklistField[],
  a: ChecklistItemResponses,
  b: ChecklistItemResponses,
): ChecklistField[] {
  const out: ChecklistField[] = [];
  for (const field of fields) {
    out.push(field);
    if (!isRepeatField(field)) continue;
    const ids = new Set([...repeatEntryIds(a, field.id), ...repeatEntryIds(b, field.id)]);
    for (const entryId of ids) out.push(...expandRepeatEntry(field, entryId));
  }
  return out;
}

export interface RepeatEntry {
  id: string;
  /** 1-based position in the list. */
  index: number;
  /** Values keyed by the template (relative) field id. */
  values: Record<string, string>;
}

export function repeatEntries(responses: ChecklistItemResponses, group: RepeatField): RepeatEntry[] {
  return repeatEntryIds(responses, group.id).map((id, i) => ({
    id,
    index: i + 1,
    values: Object.fromEntries(
      group.entryFields.map((field) => [field.id, responses[repeatFieldId(group.id, id, field.id)] ?? '']),
    ),
  }));
}

/** Partial patch that appends one empty entry. */
export function addRepeatEntry(
  responses: ChecklistItemResponses,
  group: RepeatField,
  entryId = newRepeatEntryId(),
): { entryId: string; patch: ChecklistItemResponses } {
  const ids = repeatEntryIds(responses, group.id);
  return { entryId, patch: { [group.id]: [...ids, entryId].join(',') } };
}

/** Partial patch that drops one entry and clears every key it owned. */
export function removeRepeatEntry(
  responses: ChecklistItemResponses,
  group: RepeatField,
  entryId: string,
): ChecklistItemResponses {
  const patch: ChecklistItemResponses = {
    [group.id]: repeatEntryIds(responses, group.id)
      .filter((id) => id !== entryId)
      .join(','),
  };
  for (const field of group.entryFields) patch[repeatFieldId(group.id, entryId, field.id)] = '';
  return patch;
}

/**
 * Generic `showWhen` for steps that do not have a bespoke visibility rule
 * (pre-1 / pre-6 keep theirs). Concrete repeat fields carry re-pointed
 * `showWhen`, so the same test works inside an entry.
 */
export function applyShowWhen(fields: ChecklistField[], responses: ChecklistItemResponses): ChecklistField[] {
  return fields.filter((field) => !field.showWhen || showWhenMatches(field.showWhen, responses[field.showWhen.field]));
}

/** True when a stored value satisfies a `showWhen` rule (`value`, or any of `anyOf`). */
export function showWhenMatches(
  showWhen: NonNullable<ChecklistField['showWhen']>,
  raw: string | undefined,
): boolean {
  const value = (raw ?? '').trim();
  return value === showWhen.value || (showWhen.anyOf?.includes(value) ?? false);
}

/** Concrete label for a dotted field id — "Passport copy · Director 2" — or null for a plain id. */
export function repeatFieldLabel(fields: ChecklistField[], responses: ChecklistItemResponses, id: string): string | null {
  const parsed = parseRepeatFieldId(id);
  if (!parsed) return null;
  const group = fields.find((f) => f.id === parsed.groupId);
  if (!group || !isRepeatField(group)) return null;
  const template = group.entryFields.find((f) => f.id === parsed.fieldId);
  const index = repeatEntryIds(responses, group.id).indexOf(parsed.entryId);
  const noun = group.entryLabel ?? 'Entry';
  return `${template?.label ?? parsed.fieldId} · ${noun} ${index >= 0 ? index + 1 : '?'}`;
}

/**
 * Run a per-entry rule and key its errors by the concrete field id. The rule
 * gets the entry's relative values and returns relative error ids.
 */
export function validateRepeatEntries(
  responses: ChecklistItemResponses,
  group: RepeatField,
  rule: (entry: RepeatEntry) => Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const entries = repeatEntries(responses, group);
  const min = group.minEntries ?? 0;
  const max = group.maxEntries ?? Number.POSITIVE_INFINITY;
  const noun = (group.entryLabel ?? 'entry').toLowerCase();
  if (entries.length < min) {
    errors[group.id] = `Add at least ${min} ${noun}${min === 1 ? '' : 's'}.`;
  } else if (entries.length > max) {
    errors[group.id] = `At most ${max} ${noun}${max === 1 ? '' : 's'} allowed.`;
  }
  for (const entry of entries) {
    for (const [fieldId, message] of Object.entries(rule(entry))) {
      errors[repeatFieldId(group.id, entry.id, fieldId)] = message;
    }
  }
  return errors;
}

/** Required template fields that are empty (honouring per-entry `showWhen`). */
export function missingRequiredEntryFields(group: RepeatField, entry: RepeatEntry): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of group.entryFields) {
    if (!field.required) continue;
    if (field.showWhen && !showWhenMatches(field.showWhen, entry.values[field.showWhen.field])) continue;
    if (!(entry.values[field.id] ?? '').trim()) {
      errors[field.id] = field.type === 'file' ? 'Please upload a document.' : 'This field is required.';
    }
  }
  return errors;
}
