import type { ChecklistField } from '@/data/checklist';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import { showWhenMatches } from '@/lib/checklist/checklist-repeat';
import {
  ADDITIONAL_NIC_CODES_GROUP_ID,
  isNicCodeFormat,
  nicBusinessType,
} from '@/lib/incorporation/nic-2008';

/** Every proposed name ends with "Private Limited" (owner, 2026-11-05; "India" is not required). */
const PRIVATE_LIMITED_SUFFIX = /private\s+limited\s*$/i;

export const PRE1_GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

const PRE1_GENDER_VALUES = PRE1_GENDER_OPTIONS.map((o) => o.value);
export type Pre1Gender = (typeof PRE1_GENDER_OPTIONS)[number]['value'];

export function isValidPre1Gender(value: string | undefined | null): value is Pre1Gender {
  const g = (value ?? '').trim().toLowerCase();
  return PRE1_GENDER_VALUES.includes(g as Pre1Gender);
}

export function pre1GenderLabel(value: string | undefined | null): string | null {
  const g = (value ?? '').trim();
  if (!g) return null;
  return PRE1_GENDER_OPTIONS.find((o) => o.value === g)?.label ?? g;
}

export const PRE1_INDIA_RESIDENT_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

export const PRE1_DEFAULT_AUTHORISED_SHARE_CAPITAL = '1000000';
export const PRE1_DEFAULT_PAID_UP_SHARE_CAPITAL = '100000';
export const PRE1_DEFAULT_NOMINAL_VALUE_PER_EQUITY_SHARE = '10';

export const PRE1_DIRECTOR_FIRST_NAME_IDS = [
  'director1FirstName',
  'director2FirstName',
  'director3FirstName',
  'director4FirstName',
] as const;

export const PRE1_DIRECTOR_LAST_NAME_IDS = [
  'director1LastName',
  'director2LastName',
  'director3LastName',
  'director4LastName',
] as const;

export const PRE1_DIRECTOR_GENDER_IDS = [
  'director1Gender',
  'director2Gender',
  'director3Gender',
  'director4Gender',
] as const;

export const PRE1_DIRECTOR_INDIA_RESIDENT_IDS = [
  'director1IndiaResident',
  'director2IndiaResident',
  'director3IndiaResident',
  'director4IndiaResident',
] as const;

const PRE1_MIN_DIRECTORS = 2;
const PRE1_MAX_DIRECTORS = 4;
const PRE1_DEFAULT_DIRECTOR_COUNT = PRE1_MIN_DIRECTORS;

const PRE1_PARENT_HAS_TRADEMARK_ID = 'parentEntityHasTrademark' as const;
const PRE1_PARENT_TRADEMARK_URL_ID = 'parentEntityTrademarkUrl' as const;

/**
 * Part A answers that must be filled (owner's list, 2026-11-02; the board
 * resolution date came back 2026-11-05, filled by the client). Company mail,
 * mobile, registration number and signatory gender are no longer asked; old
 * values stay stored and are never required.
 */
const PRE1_BASE_REQUIRED_TEXT_IDS = [
  'businessDescription',
  'proposedName1',
  'proposedName2',
  'parentEntityName',
  'parentEntityAddress',
  'parentEntityCountry',
  'directorCount',
  'authorisedShareCapital',
  'paidUpShareCapital',
  'nominalValuePerEquityShare',
  'signatoryFirstName',
  'signatoryLastName',
  'signatoryDesignation',
  'boardResolutionDate',
  'nicCode',
] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidPre1Date(value: string | undefined | null): boolean {
  const v = (value ?? '').trim();
  if (!ISO_DATE_RE.test(v)) return false;
  const [year, month, day] = v.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function parsePre1BoardResolutionDate(value: string | undefined | null): Date | null {
  if (!isValidPre1Date(value)) return null;
  return new Date(`${(value ?? '').trim()}T00:00:00`);
}

export function formatPre1DateDisplay(value: string | undefined | null): string | null {
  const parsed = parsePre1BoardResolutionDate(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const PRE1_REQUIRED_FILE_IDS = ['certificateOfIncorporationUrl', 'passportUrl'] as const;

/**
 * Part A proposed directors (`directorCount` + the `director{n}*` slots). They
 * were moved to `pre-15` on 2026-09-16 and came back to Part A on 2026-11-02 so
 * the board resolution can name them; `pre-15` still holds the full KYC and,
 * once it has entries, wins (see `src/lib/incorporation/proposed-directors.ts`).
 */
export function parseDirectorCount(responses: ChecklistItemResponses): number {
  const raw = (responses.directorCount ?? String(PRE1_DEFAULT_DIRECTOR_COUNT)).trim();
  const n = Number.parseInt(raw, 10);
  if (n >= PRE1_MIN_DIRECTORS && n <= PRE1_MAX_DIRECTORS) return n;
  return PRE1_DEFAULT_DIRECTOR_COUNT;
}

export function getPre1VisibleFields(
  fields: ChecklistField[],
  responses: ChecklistItemResponses,
): ChecklistField[] {
  return fields.filter((field) => {
    if (field.id === PRE1_PARENT_TRADEMARK_URL_ID) {
      return (responses[PRE1_PARENT_HAS_TRADEMARK_ID] ?? '').trim() === 'yes';
    }

    if (field.showWhen) {
      return showWhenMatches(field.showWhen, responses[field.showWhen.field]);
    }

    return true;
  });
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export interface Pre1ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export interface Pre1ValidationOptions {
  /**
   * Ids of the fields this company's Part A actually shows (from
   * `partAFieldsFor`). Required-field checks run only on these, so a section
   * that is not rendered can never block the step. Omit to validate every field.
   */
  visibleFieldIds?: ReadonlySet<string>;
}

export function validatePre1Responses(
  responses: ChecklistItemResponses,
  options?: Pre1ValidationOptions,
): Pre1ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const visible = options?.visibleFieldIds;
  const applies = (id: string) => !visible || visible.has(id);

  for (const id of PRE1_BASE_REQUIRED_TEXT_IDS) {
    if (applies(id) && !(responses[id] ?? '').trim()) {
      errors[id] = 'This field is required.';
    }
  }

  if (applies('directorCount')) {
    Object.assign(errors, validatePre1Directors(responses));
  }

  for (const id of PRE1_REQUIRED_FILE_IDS) {
    if (applies(id) && !(responses[id] ?? '').trim()) {
      errors[id] = 'Please upload a document.';
    }
  }

  const words = countWords(responses.businessDescription ?? '');
  if (words > 100) {
    errors.businessDescription = `Description must be 100 words or fewer (${words} entered).`;
  }

  const nicCode = (responses.nicCode ?? '').trim();
  if (nicCode && !isNicCodeFormat(nicCode)) {
    errors.nicCode = 'Enter the 5-digit NIC-2008 code (digits only).';
  } else if (nicCode && !nicBusinessType(nicCode)) {
    warnings.nicCode = 'No NIC-2008 sub-class has this code — check it against the SPICe+ list.';
  }

  if (applies(ADDITIONAL_NIC_CODES_GROUP_ID)) {
    const extra = validateAdditionalNicCodes(responses);
    Object.assign(errors, extra.errors);
    Object.assign(warnings, extra.warnings);
  }

  for (const id of ['proposedName1', 'proposedName2'] as const) {
    const value = (responses[id] ?? '').trim();
    if (value && !PRIVATE_LIMITED_SUFFIX.test(value)) {
      errors[id] = 'Name must end with "Private Limited".';
    }
  }

  const boardResolutionDate = (responses.boardResolutionDate ?? '').trim();
  if (boardResolutionDate && !isValidPre1Date(boardResolutionDate)) {
    errors.boardResolutionDate = 'Enter a valid date.';
  }

  const nominalRaw = (responses.nominalValuePerEquityShare ?? '').trim();
  if (nominalRaw && !isValidPre1NominalValuePerEquityShare(nominalRaw)) {
    errors.nominalValuePerEquityShare =
      'Enter a valid nominal value per share (positive number, e.g. 10).';
  }

  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

/**
 * The proposed directors on Part A: each slot up to the chosen count needs a
 * first and last name, a gender and a residency answer, and at least one of
 * them must be resident in India.
 */
function validatePre1Directors(responses: ChecklistItemResponses): Record<string, string> {
  const errors: Record<string, string> = {};
  const count = parseDirectorCount(responses);
  let hasResident = false;
  for (let i = 0; i < count; i += 1) {
    for (const id of [PRE1_DIRECTOR_FIRST_NAME_IDS[i]!, PRE1_DIRECTOR_LAST_NAME_IDS[i]!]) {
      if (!(responses[id] ?? '').trim()) errors[id] = 'This field is required.';
    }
    const genderId = PRE1_DIRECTOR_GENDER_IDS[i]!;
    const gender = (responses[genderId] ?? '').trim();
    if (!gender) errors[genderId] = 'This field is required.';
    else if (!isValidPre1Gender(gender)) errors[genderId] = 'Select a valid gender.';
    const residentId = PRE1_DIRECTOR_INDIA_RESIDENT_IDS[i]!;
    const resident = (responses[residentId] ?? '').trim();
    if (!resident) errors[residentId] = 'This field is required.';
    if (resident === 'yes') hasResident = true;
  }
  if (!hasResident && !Object.keys(errors).some((id) => id.endsWith('IndiaResident'))) {
    errors[PRE1_DIRECTOR_INDIA_RESIDENT_IDS[0]] = 'At least one proposed director must be resident in India.';
  }
  return errors;
}

const ADDITIONAL_NIC_CODES_MAX = 9;
export const DUPLICATE_NIC_CODE_MESSAGE = 'This NIC code is already in the list.';

/**
 * The extra NIC codes on Part A. Each code: required and 5 digits (error), in
 * NIC-2008 (warning), and not equal to the main code or an earlier entry
 * (error). Errors are keyed by the concrete id (`additionalNicCodes.<entry>.code`).
 */
function validateAdditionalNicCodes(responses: ChecklistItemResponses): {
  errors: Record<string, string>;
  warnings: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const warnings: Record<string, string> = {};
  const entryIds = (responses[ADDITIONAL_NIC_CODES_GROUP_ID] ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (entryIds.length > ADDITIONAL_NIC_CODES_MAX) {
    errors[ADDITIONAL_NIC_CODES_GROUP_ID] = `At most ${ADDITIONAL_NIC_CODES_MAX} NIC codes allowed.`;
  }
  const seen = new Set<string>();
  const main = (responses.nicCode ?? '').trim();
  if (main) seen.add(main);
  for (const entryId of entryIds) {
    const key = `${ADDITIONAL_NIC_CODES_GROUP_ID}.${entryId}.code`;
    const code = (responses[key] ?? '').trim();
    if (!code) {
      errors[key] = 'This field is required.';
    } else if (!isNicCodeFormat(code)) {
      errors[key] = 'Enter the 5-digit NIC-2008 code (digits only).';
    } else if (seen.has(code)) {
      errors[key] = DUPLICATE_NIC_CODE_MESSAGE;
    } else if (!nicBusinessType(code)) {
      warnings[key] = 'No NIC-2008 sub-class has this code — check it against the SPICe+ list.';
    }
    if (code) seen.add(code);
  }
  return { errors, warnings };
}

/** Positive numeric nominal value per equity share (commas allowed). */
export function isValidPre1NominalValuePerEquityShare(value: string): boolean {
  const normalized = value.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return false;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0;
}

/** Apply engagement defaults and share-capital placeholders for empty pre-1 drafts. */
export function applyPre1EngagementDefaults(
  draft: ChecklistItemResponses,
  engagement?: {
    parentEntityName?: string | null;
    parentEntityAddress?: string | null;
    parentEntityRegistrationNumber?: string | null;
  } | null,
): ChecklistItemResponses {
  const next = { ...draft };
  if (!next.parentEntityName?.trim() && engagement?.parentEntityName?.trim()) {
    next.parentEntityName = engagement.parentEntityName.trim();
  }
  if (!next.parentEntityAddress?.trim() && engagement?.parentEntityAddress?.trim()) {
    next.parentEntityAddress = engagement.parentEntityAddress.trim();
  }
  if (
    !next.parentEntityRegistrationNumber?.trim() &&
    engagement?.parentEntityRegistrationNumber?.trim()
  ) {
    next.parentEntityRegistrationNumber =
      engagement.parentEntityRegistrationNumber.trim();
  }
  if (!next.authorisedShareCapital?.trim()) {
    next.authorisedShareCapital = PRE1_DEFAULT_AUTHORISED_SHARE_CAPITAL;
  }
  if (!next.paidUpShareCapital?.trim()) {
    next.paidUpShareCapital = PRE1_DEFAULT_PAID_UP_SHARE_CAPITAL;
  }
  if (!next.nominalValuePerEquityShare?.trim()) {
    next.nominalValuePerEquityShare = PRE1_DEFAULT_NOMINAL_VALUE_PER_EQUITY_SHARE;
  }
  if (!next.directorCount?.trim()) {
    next.directorCount = String(PRE1_DEFAULT_DIRECTOR_COUNT);
  }
  return next;
}

