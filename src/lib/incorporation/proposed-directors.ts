import { checklist, getItem } from '@/data/checklist';
import {
  extractItemResponses,
  getClientResponseFields,
  type ChecklistItemResponses,
} from '@/lib/checklist/checklist-responses';
import {
  addRepeatEntry,
  isRepeatField,
  repeatEntries,
  repeatFieldId,
  type RepeatEntry,
  type RepeatField,
} from '@/lib/checklist/checklist-repeat';
import { parseDirectorCount } from '@/lib/checklist/checklist-pre1-validation';
import { pre6NrFieldPrefix, pre6ResidentFieldPrefix } from '@/lib/checklist/checklist-pre6-validation';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { resolveRegisteredOfficeResponses } from '@/lib/checklist/registered-office-responses';
import { PRE15_INTEREST_PARTS, PRE15_MAX_OTHER_INTERESTS } from '@/lib/incorporation/other-company-interests';
import {
  audienceForDirectorFieldId,
  directorAudienceKey,
  directorFieldPrefix,
  MAX_DIRECTOR_SLOTS_PER_KIND,
  type IncorpDirectorAudience,
  type IncorpDirectorKind,
} from '@/lib/incorporation-docs/audiences';

/**
 * PROPOSED DIRECTORS — one read-side accessor for every consumer.
 *
 * Source of truth is `pre-15` (SPICe+ Part B, repeating entries). Engagements
 * from before 2026-09-16 hold the same facts in two legacy places — the fixed
 * `director{n}*` slots on Part A (`pre-1`) and the `nrDirector*` /
 * `residentDirector*` KYC slots on the deleted Director KYC step (`pre-6`).
 * When `pre-15` has no entries the accessor rebuilds the list from those, so
 * in-flight engagements keep rendering and generating. Nothing is migrated
 * or deleted.
 *
 * The docx generators still speak the legacy shapes (`directorField(pre6, …)`,
 * `resolveDirectors(pre1)`), so `directorResponsesFromState` hands them
 * synthesised `pre1` / `pre6` maps built from the entries — one repoint,
 * every generator unchanged.
 */
export const PROPOSED_DIRECTORS_STEP_ID = 'pre-15';
const REGISTERED_OFFICE_STEP_ID = 'pre-14';
export const PROPOSED_DIRECTORS_GROUP_ID = 'directors';

export type StepStateMap = Record<string, ChecklistItemStateSlice | undefined> | null | undefined;

export interface ProposedDirector {
  id: string;
  /** 1-based position. */
  index: number;
  /** Relative template values (`firstName`, `gender`, `dob`, `passportCopyUrl`, …). */
  values: Record<string, string>;
}

function proposedDirectorsGroup(): RepeatField | null {
  const item = getItem(PROPOSED_DIRECTORS_STEP_ID);
  const group = item ? getClientResponseFields(item).find((f) => f.id === PROPOSED_DIRECTORS_GROUP_ID) : undefined;
  return group && isRepeatField(group) ? group : null;
}

function responsesFor(state: StepStateMap, itemId: string): ChecklistItemResponses {
  const item = checklist.find((c) => c.id === itemId);
  return item ? extractItemResponses(item, state?.[itemId]) : {};
}

export function displayName(values: Record<string, string>): string {
  return [values.firstName, values.middleName, values.lastName]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Legacy Part A slot + matching Director KYC slot → one entry. */
function legacyDirectors(pre1: ChecklistItemResponses, pre6: ChecklistItemResponses): ProposedDirector[] {
  const count = parseDirectorCount(pre1);
  const out: ProposedDirector[] = [];
  let nrSlot = 0;
  let residentSlot = 0;
  for (let i = 1; i <= count; i += 1) {
    const resident = (pre1[`director${i}IndiaResident`] ?? '').trim();
    if (!(pre1[`director${i}FirstName`] ?? '').trim() && !(pre1[`director${i}LastName`] ?? '').trim()) continue;
    let prefix: string | null = null;
    if (resident === 'yes') prefix = pre6ResidentFieldPrefix(++residentSlot);
    else if (resident === 'no') prefix = pre6NrFieldPrefix(++nrSlot);
    const kyc: Record<string, string> = {};
    if (prefix) {
      for (const [key, value] of Object.entries(pre6)) {
        if (!key.startsWith(prefix) || !value?.trim()) continue;
        const rest = key.slice(prefix.length);
        // `nrDirector` must not swallow `nrDirector2…`.
        if (/^\d/.test(rest)) continue;
        kyc[rest.charAt(0).toLowerCase() + rest.slice(1)] = value;
      }
    }
    out.push({
      id: `legacy-${i}`,
      index: out.length + 1,
      values: {
        ...kyc,
        firstName: pre1[`director${i}FirstName`] ?? kyc.firstName ?? '',
        middleName: pre1[`director${i}MiddleName`] ?? kyc.middleName ?? '',
        lastName: pre1[`director${i}LastName`] ?? kyc.lastName ?? '',
        gender: pre1[`director${i}Gender`] ?? kyc.gender ?? '',
        indiaResident: resident,
        din: pre1[`director${i}Din`] ?? '',
        hasDsc: pre1[`director${i}HasDsc`] ?? kyc.hasValidDsc ?? '',
        dscExpiryDate: pre1[`director${i}DscExpiryDate`] ?? kyc.dscExpiryDate ?? '',
      },
    });
  }
  return out;
}

/** The proposed directors, from `pre-15` when it has entries, else the legacy slots. */
export function readProposedDirectors(state: StepStateMap): ProposedDirector[] {
  const group = proposedDirectorsGroup();
  if (group) {
    const entries: RepeatEntry[] = repeatEntries(responsesFor(state, PROPOSED_DIRECTORS_STEP_ID), group);
    if (entries.length > 0) return entries;
  }
  return legacyDirectors(responsesFor(state, 'pre-1'), responsesFor(state, 'pre-6'));
}

/** What Part A captures about each director and `pre-15` starts from. */
const PART_A_DIRECTOR_KEYS = ['firstName', 'middleName', 'lastName', 'gender', 'indiaResident'] as const;

/**
 * The `pre-15` patch that starts its director list from the Part A directors
 * (name, gender, residency), so nobody types them twice. Null when `pre-15`
 * already has entries or Part A names nobody — a seed never overwrites.
 */
export function seedProposedDirectorsFromPartA(
  pre15: ChecklistItemResponses,
  pre1: ChecklistItemResponses,
): ChecklistItemResponses | null {
  const group = proposedDirectorsGroup();
  if (!group || repeatEntries(pre15, group).length > 0) return null;
  const directors = legacyDirectors(pre1, {});
  if (directors.length === 0) return null;
  let current: ChecklistItemResponses = { ...pre15 };
  const patch: ChecklistItemResponses = {};
  for (const director of directors) {
    const { entryId, patch: added } = addRepeatEntry(current, group);
    current = { ...current, ...added };
    Object.assign(patch, added);
    for (const key of PART_A_DIRECTOR_KEYS) {
      const value = (director.values[key] ?? '').trim();
      if (value) patch[repeatFieldId(group.id, entryId, key)] = value;
    }
  }
  return patch;
}

/** Template id → legacy Director KYC suffix (`residentDirector` + suffix). */
const PRE6_SUFFIX: Record<string, string> = {
  firstName: 'FirstName',
  middleName: 'MiddleName',
  lastName: 'LastName',
  gender: 'Gender',
  dob: 'Dob',
  fatherName: 'FatherName',
  highestEducationalQualification: 'HighestEducationalQualification',
  occupationType: 'OccupationType',
  aadhaarNumber: 'AadhaarNumber',
  aadhaarCopyUrl: 'AadhaarCopyUrl',
  panNumber: 'PanNumber',
  panCopyUrl: 'PanCopyUrl',
  passportNumber: 'PassportNumber',
  passportCopyUrl: 'PassportCopyUrl',
  drivingLicenceNumber: 'DrivingLicenceNumber',
  drivingLicenceCopyUrl: 'DrivingLicenceCopyUrl',
  utilityBillType: 'UtilityBillType',
  utilityBillNumber: 'UtilityBillNumber',
  utilityBillAddress: 'UtilityBillAddress',
  utilityBillCopyUrl: 'UtilityBillCopyUrl',
  mobileNumber: 'MobileNumber',
  personalMailId: 'PersonalMailId',
  officialMailId: 'OfficialMailId',
  recentPhotographUrl: 'RecentPhotographUrl',
  notaryApostilleMethod: 'NotaryApostilleMethod',
  hasDsc: 'HasValidDsc',
  dscExpiryDate: 'DscExpiryDate',
  dscAvailabilitySlots: 'DscAvailabilitySlots',
  hasOtherCompanyInterest: 'HasOtherCompanyInterest',
  din: 'Din',
  csMembershipOrCopNumber: 'CsMembershipOrCopNumber',
  // Answers the documents print instead of deriving (`shared.ts` reads them).
  nationality: 'Nationality',
  identityProofType: 'IdentityProofType',
  residenceProofType: 'ResidenceProofType',
  residenceProofOther: 'ResidenceProofOther',
  signingPlace: 'SigningPlace',
  ...Object.fromEntries(
    Array.from({ length: PRE15_MAX_OTHER_INTERESTS }, (_, n) =>
      Object.entries(PRE15_INTEREST_PARTS).map(([part, legacy]) => [
        `otherInterest${n + 1}${part}`,
        `OtherCompanyInterest${n + 1}${legacy}`,
      ]),
    ).flat(),
  ),
};

/** The directors in the legacy `pre-6` key shape the docx generators read. */
export function directorsAsPre6Responses(directors: ProposedDirector[]): ChecklistItemResponses {
  const out: ChecklistItemResponses = {};
  let nrSlot = 0;
  let residentSlot = 0;
  for (const director of directors) {
    const resident = (director.values.indiaResident ?? '').trim();
    if (resident !== 'yes' && resident !== 'no') continue;
    const prefix = resident === 'yes' ? pre6ResidentFieldPrefix(++residentSlot) : pre6NrFieldPrefix(++nrSlot);
    for (const [key, suffix] of Object.entries(PRE6_SUFFIX)) {
      const value = (director.values[key] ?? '').trim();
      if (value) out[`${prefix}${suffix}`] = value;
    }
  }
  return out;
}

/** The directors in the legacy Part A slot shape (`director{n}*`). */
function directorsAsPre1Responses(directors: ProposedDirector[]): ChecklistItemResponses {
  const out: ChecklistItemResponses = { directorCount: String(Math.min(Math.max(directors.length, 2), 4)) };
  directors.slice(0, 4).forEach((director, i) => {
    const n = i + 1;
    const v = director.values;
    const put = (key: string, value: string | undefined) => {
      if (value?.trim()) out[`director${n}${key}`] = value.trim();
    };
    put('FirstName', v.firstName);
    put('MiddleName', v.middleName);
    put('LastName', v.lastName);
    put('Gender', v.gender);
    put('IndiaResident', v.indiaResident);
    put('Din', v.din);
    put('HasDsc', v.hasDsc);
    put('DscExpiryDate', v.dscExpiryDate);
  });
  return out;
}

/**
 * What the generators read: Part A responses with the director slots
 * overlaid from `pre-15`, and a `pre-6`-shaped map — synthesised when
 * `pre-15` has entries, the stored legacy map otherwise.
 */
export function directorResponsesFromState(state: StepStateMap): {
  pre1: ChecklistItemResponses;
  pre6: ChecklistItemResponses;
} {
  const pre1 = responsesFor(state, 'pre-1');
  // The registered office moved to pre-14; the MOA reads it off the pre-6 map.
  const registeredOffice = resolveRegisteredOfficeResponses(
    responsesFor(state, 'pre-6'),
    responsesFor(state, 'pre-8'),
    responsesFor(state, REGISTERED_OFFICE_STEP_ID),
  );
  const pre6 = { ...responsesFor(state, 'pre-6'), ...registeredOffice };
  const group = proposedDirectorsGroup();
  const entries = group ? repeatEntries(responsesFor(state, PROPOSED_DIRECTORS_STEP_ID), group) : [];
  if (entries.length === 0) {
    // Legacy: the DIN lives on Part A, not on the KYC step — fill only what pre-6 lacks.
    const legacy = directorsAsPre6Responses(legacyDirectors(pre1, responsesFor(state, 'pre-6')));
    return { pre1, pre6: { ...legacy, ...pre6 } };
  }
  // Stale legacy KYC keys must not bleed into a director the entries define.
  const nonDirectorPre6 = Object.fromEntries(
    Object.entries(pre6).filter(([key]) => audienceForDirectorFieldId(key) === null),
  );
  return {
    pre1: { ...pre1, ...directorsAsPre1Responses(entries) },
    pre6: { ...nonDirectorPre6, ...directorsAsPre6Responses(entries) },
  };
}

/**
 * One director as the incorporation documents see them: the audience key the
 * drafts are stored under and the `pre-6`-shaped field prefix they read.
 * Slot numbering matches `directorsAsPre6Responses` exactly.
 */
export interface DirectorEntry {
  key: IncorpDirectorAudience;
  kind: IncorpDirectorKind;
  /** 1-based position within `kind`. */
  slot: number;
  fieldPrefix: string;
  displayName: string;
  director: ProposedDirector;
}

/** Directors with a residency set, keyed for document generation. Beyond the slot ceiling are dropped. */
export function directorEntriesFromDirectors(directors: ProposedDirector[]): DirectorEntry[] {
  const out: DirectorEntry[] = [];
  const slots: Record<IncorpDirectorKind, number> = { 'non-resident': 0, resident: 0 };
  for (const director of directors) {
    const resident = (director.values.indiaResident ?? '').trim();
    if (resident !== 'yes' && resident !== 'no') continue;
    const kind: IncorpDirectorKind = resident === 'yes' ? 'resident' : 'non-resident';
    const slot = ++slots[kind];
    if (slot > MAX_DIRECTOR_SLOTS_PER_KIND) continue;
    const key = directorAudienceKey(kind, slot);
    out.push({
      key,
      kind,
      slot,
      fieldPrefix: directorFieldPrefix(key),
      displayName: displayName(director.values) || `Director ${director.index}`,
      director,
    });
  }
  return out;
}

export function resolveDirectorEntries(state: StepStateMap): DirectorEntry[] {
  return directorEntriesFromDirectors(readProposedDirectors(state));
}

export function hasIndiaResidentDirector(directors: ProposedDirector[]): boolean {
  return directors.some((d) => (d.values.indiaResident ?? '').trim() === 'yes');
}
