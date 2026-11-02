import { directorAudienceKind } from '@/lib/incorporation-docs/audiences';
import { PART_A_SECTION } from '@/lib/checklist/part-a-sections';
import { resolveSignatoryDisplayName } from '@/lib/person-name';
import { resolveRegisteredOfficeResponses } from '@/lib/checklist/registered-office-responses';
import { PROPOSED_DIRECTORS_STEP_ID } from '@/lib/incorporation/proposed-directors';
import {
  resolveParentEntityAddress,
  resolveParentEntityName,
} from '@/lib/incorporation-docs/parent-entity';
import { resolveProposedCompanyName } from '@/lib/incorporation-docs/shared';
import { sectionSlug } from '@/lib/doc-pack/section-slug';
import type { DocPackContext, DocPackDirector, RequiredInput } from '@/lib/doc-pack/types';
import { parentCountryAnswer } from '@/lib/incorporation/parent-jurisdiction';
import { REGISTERED_OFFICE_STATE_FIELD_ID } from '@/lib/checklist/registered-office-responses';
import {
  planSubscription,
  SUBSCRIBER_DETAILS_STEP_ID,
  SUBSCRIPTION_WITNESS_FIELDS,
} from '@/lib/incorporation-docs/subscription-sheet';
import type { IncorpMergeInput } from '@/lib/incorporation-docs/shared';

/**
 * Required inputs mirror what the generators' missing-field collectors demand
 * (`collectIncorpDocsMissingFields` and friends), so "ready" here means the
 * generate route will not answer 422. Labels are short; the UI prefixes the
 * director from `directorIndex`.
 */

const filled = (value: string | undefined): boolean => Boolean(value?.trim());
const isPlaceholder = (value: string): boolean => !value || value.startsWith('[');

const NAME_APPROVAL_TAB = sectionSlug('Name Approval');
const REGISTERED_OFFICE_TAB = sectionSlug('Registered office');
const DIRECTORS_TAB = sectionSlug('Directors');
const DRAFT_DOCS_TAB = sectionSlug('Draft Incorporation Docs');
const SUBSCRIBERS_TAB = sectionSlug('Subscribers');

export const companyName: RequiredInput = {
  key: 'company.name',
  label: 'Approved company name',
  stepId: 'pre-5',
  tabId: NAME_APPROVAL_TAB,
  isPresent: (ctx) =>
    !isPlaceholder(
      resolveProposedCompanyName(ctx.responses.pre5, ctx.responses.pre1, ctx.engagement ?? null),
    ),
};

export const registeredOfficeAddress: RequiredInput = {
  key: 'company.registeredOffice',
  label: 'Registered office address',
  stepId: 'pre-14',
  tabId: REGISTERED_OFFICE_TAB,
  isPresent: (ctx) =>
    filled(
      resolveRegisteredOfficeResponses(
        ctx.responses.pre6,
        ctx.responses.pre8,
        ctx.responses.pre14,
      ).registeredOfficeCompleteAddress,
    ),
};

export const registeredOfficeState: RequiredInput = {
  key: 'company.registeredOfficeState',
  label: 'State of the registered office',
  stepId: 'pre-14',
  tabId: REGISTERED_OFFICE_TAB,
  isPresent: (ctx) =>
    filled(
      resolveRegisteredOfficeResponses(ctx.responses.pre6, ctx.responses.pre8, ctx.responses.pre14)[
        REGISTERED_OFFICE_STATE_FIELD_ID
      ],
    ),
};

function pre1Input(key: string, label: string, section: string, fieldId: string): RequiredInput {
  return {
    key,
    label,
    stepId: 'pre-1',
    tabId: sectionSlug(section),
    isPresent: (ctx) => filled(ctx.responses.pre1[fieldId]),
  };
}

export const authorisedShareCapital = pre1Input(
  'company.authorisedShareCapital',
  'Authorised share capital',
  PART_A_SECTION.shareCapital,
  'authorisedShareCapital',
);
export const paidUpShareCapital = pre1Input(
  'company.paidUpShareCapital',
  'Paid-up share capital',
  PART_A_SECTION.shareCapital,
  'paidUpShareCapital',
);
export const nominalValuePerShare = pre1Input(
  'company.nominalValuePerEquityShare',
  'Nominal value per equity share',
  PART_A_SECTION.shareCapital,
  'nominalValuePerEquityShare',
);

export const parentEntityName: RequiredInput = {
  key: 'parent.name',
  label: 'Parent entity name',
  stepId: 'pre-1',
  tabId: sectionSlug(PART_A_SECTION.foreignEntity),
  isPresent: (ctx) =>
    !isPlaceholder(resolveParentEntityName(ctx.responses.pre1, ctx.engagement ?? null)),
};

export const parentEntityAddress: RequiredInput = {
  key: 'parent.address',
  label: 'Parent entity address',
  stepId: 'pre-1',
  tabId: sectionSlug(PART_A_SECTION.foreignEntity),
  isPresent: (ctx) =>
    !isPlaceholder(resolveParentEntityAddress(ctx.responses.pre1, ctx.engagement ?? null)),
};

/**
 * The parent's country of incorporation. The state / province is optional
 * (not every country has one), so it is never a missing input.
 */
export const parentEntityCountry: RequiredInput = {
  key: 'parent.country',
  label: 'Parent entity country of incorporation',
  stepId: 'pre-1',
  tabId: sectionSlug(PART_A_SECTION.foreignEntity),
  isPresent: (ctx) => filled(parentCountryAnswer(ctx.responses.pre1)),
};

function witnessInput(key: keyof typeof SUBSCRIPTION_WITNESS_FIELDS, label: string): RequiredInput {
  return {
    key: `witness.${key}`,
    label,
    stepId: 'pre-7',
    tabId: DRAFT_DOCS_TAB,
    isPresent: (ctx) => filled(ctx.responses.pre7[SUBSCRIPTION_WITNESS_FIELDS[key]]),
  };
}

/** The subscription sheets' "Signed before me" witness (membership number is optional). */
export const subscriptionWitnessInputs: RequiredInput[] = [
  witnessInput('name', 'Witness to the subscribers — name'),
  witnessInput('address', 'Witness to the subscribers — address'),
  witnessInput('occupation', 'Witness to the subscribers — occupation'),
];

export const signatoryName: RequiredInput = {
  key: 'signatory.name',
  label: 'Authorised signatory name',
  stepId: 'pre-1',
  tabId: sectionSlug(PART_A_SECTION.boardResolutionSignatory),
  isPresent: (ctx) => filled(resolveSignatoryDisplayName(ctx.responses.pre1)),
};

export const signatoryDesignation = pre1Input(
  'signatory.designation',
  'Authorised signatory designation',
  PART_A_SECTION.boardResolutionSignatory,
  'signatoryDesignation',
);

/** The AOA lists directors; it needs at least one name. */
export const anyDirectorName: RequiredInput = {
  key: 'directors.any',
  label: 'At least one director name',
  stepId: PROPOSED_DIRECTORS_STEP_ID,
  tabId: DIRECTORS_TAB,
  isPresent: (ctx) => ctx.directors.some((d) => filled(d.displayName)),
};

/**
 * The letters and subscription sheets are written for the first non-resident
 * director. When there is none, the missing input points at the directors step.
 */
export const nonResidentDirectorExists: RequiredInput = {
  key: 'directors.nonResident',
  label: 'A non-resident director',
  stepId: PROPOSED_DIRECTORS_STEP_ID,
  tabId: DIRECTORS_TAB,
  isPresent: (ctx) => ctx.directors.some((d) => directorAudienceKind(d.audience) === 'non-resident'),
};

type DirectorFieldSpec = {
  key: string;
  label: string;
  /** Present when any listed `values` key is filled. */
  values: string[];
};

const DIRECTOR_FIELDS = {
  fullName: { key: 'fullName', label: 'Full name', values: ['firstName', 'lastName'] },
  fatherName: { key: 'fatherName', label: "Father's name", values: ['fatherName'] },
  dob: { key: 'dob', label: 'Date of birth', values: ['dob'] },
  address: { key: 'address', label: 'Address as per utility bill', values: ['utilityBillAddress'] },
  email: { key: 'email', label: 'Email', values: ['personalMailId', 'officialMailId'] },
  mobile: { key: 'mobile', label: 'Mobile number', values: ['mobileNumber'] },
  pan: { key: 'pan', label: 'PAN', values: ['panNumber'] },
  utilityBillType: { key: 'utilityBillType', label: 'Utility bill type', values: ['utilityBillType'] },
  passport: { key: 'passport', label: 'Passport number', values: ['passportNumber'] },
  nationality: { key: 'nationality', label: 'Nationality', values: ['nationality'] },
  signingPlace: { key: 'signingPlace', label: 'Place of signing', values: ['signingPlace'] },
  residenceProofType: { key: 'residenceProofType', label: 'Proof of residence', values: ['residenceProofType'] },
} satisfies Record<string, DirectorFieldSpec>;

export type DirectorFieldKey = keyof typeof DIRECTOR_FIELDS;

function directorInput(
  director: DocPackDirector,
  spec: DirectorFieldSpec,
  present?: (ctx: DocPackContext) => boolean,
): RequiredInput {
  const index = director.director.index;
  return {
    key: `director.${index}.${spec.key}`,
    label: spec.label,
    stepId: director.stepId,
    // Legacy pre-6 tabs are generated per slot; link to the step only.
    tabId: director.stepId === PROPOSED_DIRECTORS_STEP_ID ? DIRECTORS_TAB : undefined,
    directorIndex: index,
    isPresent:
      present ?? (() => spec.values.some((v) => filled(director.director.values[v]))),
  };
}

export function directorInputs(
  director: DocPackDirector,
  fields: DirectorFieldKey[],
): RequiredInput[] {
  return fields.map((f) => directorInput(director, DIRECTOR_FIELDS[f]));
}

/**
 * Answers `pre-15` asks a non-resident that the documents print instead of
 * a default. Legacy `pre-6` directors never had the questions, so their
 * documents keep the historical wording rather than block on a field that
 * does not exist on their step.
 */
function askedOnPre15(director: DocPackDirector): boolean {
  return director.stepId === PROPOSED_DIRECTORS_STEP_ID && directorAudienceKind(director.audience) === 'non-resident';
}

/** Place of signing — every director draft prints it. */
export function directorSigningInputs(director: DocPackDirector): RequiredInput[] {
  return askedOnPre15(director) ? directorInputs(director, ['signingPlace']) : [];
}

/** Nationality — DIR-2 and the PAN undertaking print it. */
export function directorNationalityInputs(director: DocPackDirector): RequiredInput[] {
  return askedOnPre15(director) ? directorInputs(director, ['nationality']) : [];
}

/** DIR-2's proof of residence; "other" also needs the document's name. */
export function directorResidenceProofInputs(director: DocPackDirector): RequiredInput[] {
  if (!askedOnPre15(director)) return [];
  const v = director.director.values;
  return [
    directorInput(director, DIRECTOR_FIELDS.residenceProofType, () =>
      filled(v.residenceProofType) && (v.residenceProofType !== 'other' || filled(v.residenceProofOther)),
    ),
  ];
}

/** DIR-2 / DIR-8 / INC-9 need the same KYC set; residents also need PAN and bill type. */
export function directorFormInputs(director: DocPackDirector): RequiredInput[] {
  const base = directorInputs(director, ['fullName', 'fatherName', 'dob', 'address', 'email', 'mobile']);
  const kyc =
    directorAudienceKind(director.audience) === 'resident'
      ? [...base, ...directorInputs(director, ['pan', 'utilityBillType'])]
      : base;
  return [...kyc, ...directorSigningInputs(director)];
}

/** The authorisation letter accepts the NR passport or the parent's registration number. */
export function passportOrParentRegistration(director: DocPackDirector): RequiredInput {
  return directorInput(director, DIRECTOR_FIELDS.passport, (ctx) =>
    filled(director.director.values.passportNumber) ||
    filled(ctx.responses.pre1.parentEntityRegistrationNumber) ||
    filled(ctx.engagement?.parentEntityRegistrationNumber ?? undefined),
  );
}

export function firstNonResident(ctx: DocPackContext): DocPackDirector | undefined {
  return ctx.directors.find((d) => d.audience === 'non-resident');
}

function mergeInputFor(ctx: DocPackContext): IncorpMergeInput {
  return {
    engagement: (ctx.engagement ?? null) as IncorpMergeInput['engagement'],
    pre1: ctx.responses.pre1,
    pre5: ctx.responses.pre5,
    pre6: ctx.responses.pre6,
    pre7: ctx.responses.pre7,
    pre13: ctx.responses.pre13,
    pre16: ctx.responses.pre16,
    director: 'company',
  };
}

/** The pack's view of who subscribes (same decision the sheet renders with). */
export function subscriptionPlan(ctx: DocPackContext) {
  return planSubscription(mergeInputFor(ctx));
}

export const subscribersListed: RequiredInput = {
  key: 'subscribers.any',
  label: 'Subscribers to the memorandum and the shares each takes',
  stepId: SUBSCRIBER_DETAILS_STEP_ID,
  tabId: SUBSCRIBERS_TAB,
  isPresent: (ctx) => subscriptionPlan(ctx).individuals.length > 0,
};

/** One `pre-16` entry: it must name a proposed director and take a whole number of shares. */
export function subscriberEntryInputs(
  entryIndex: number,
  name: string,
  isDirector: boolean,
  shares: number,
): RequiredInput[] {
  const who = name ? `Subscriber ${entryIndex} (${name})` : `Subscriber ${entryIndex}`;
  return [
    {
      key: `subscriber.${entryIndex}.director`,
      label: `${who} — a proposed director (their KYC fills the sheet)`,
      stepId: SUBSCRIBER_DETAILS_STEP_ID,
      tabId: SUBSCRIBERS_TAB,
      isPresent: () => isDirector,
    },
    {
      key: `subscriber.${entryIndex}.shares`,
      label: `${who} — number of shares`,
      stepId: SUBSCRIBER_DETAILS_STEP_ID,
      tabId: SUBSCRIBERS_TAB,
      isPresent: () => shares > 0,
    },
  ];
}
