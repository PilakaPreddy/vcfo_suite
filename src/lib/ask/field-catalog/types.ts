/**
 * One place a value can go. The sources stay where they are (`CLIENT_RESPONSE_FIELDS`, the compliance
 * inputs and questionnaire, the registration rules); `npm run ask:catalog` writes this list from
 * them, and a test fails when the written list no longer matches.
 */
export const FIELD_FORMATS = [
  'pan',
  'din',
  'cin',
  'gstin',
  'ifsc',
  'pin',
  'tan',
  'llpin',
  'aadhaar',
  'passport',
  'date',
  'email',
  'mobile',
  'amount',
  'choice',
  'file',
  'text',
  'longtext',
] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

/** `identity` values are masked in chat, logs and stored prompts. */
export type FieldSensitivity = 'identity' | 'normal';

/** Whose fact it is. A person or a subscriber has one entry per person on a repeating list. */
export type FieldSubject = 'director' | 'subscriber' | 'company' | 'office' | 'parent' | 'signatory' | 'general';

export interface FieldUse {
  source: 'checklist' | 'compliance' | 'questionnaire' | 'registration';
  /** Step id, obligation id, or question group. */
  ref: string;
  /** Field id, with `#` for a numbered slot (`director#FirstName`) and relative to the entry on a repeat. */
  field: string;
  /** The repeating list the field sits in. */
  repeat?: string;
}

export interface CatalogEntry {
  /** Canonical key such as `director.pan`, or `<step>.<field>` for a fact only one step holds. */
  key: string;
  label: string;
  synonyms: string[];
  format: FieldFormat;
  sensitivity: FieldSensitivity;
  subject: FieldSubject;
  options?: Array<{ value: string; label: string }>;
  /** Other keys this one fills: a whole name fills first, middle and last name. */
  expands?: string[];
  uses: FieldUse[];
}
