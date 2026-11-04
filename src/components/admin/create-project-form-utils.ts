import {
  coerceParentIndianRelationship,
  requiresParentIndianRelationship,
  type CompanyType,
  type EntityLegalForm,
  type OwnershipType,
  type ParentIndianRelationship,
} from '@/data/engagements';
import type { QuestionnaireAnswers } from '@/data/compliance-questionnaire';
import { ENTITY_LEGAL_FORM_LABEL } from '@/lib/compliance/types';
import type { Stage } from '@/lib/projects/stage';

export const PHASE_ORDER: Stage[] = [
  'Pre-Incorporation',
  'Post-Incorporation',
  'Operational Readiness',
];

/** Registration / Compliance start needs India subsidiary legal details — for a dependent company. */
export function stageRequiresSubsidiary(stage: Stage, ownershipType: OwnershipType = 'subsidiary'): boolean {
  if (ownershipType === 'independent') return false;
  return stage === 'Post-Incorporation' || stage === 'Operational Readiness';
}

/**
 * A subsidiary always names its parent at creation, whatever the starting
 * phase: the NOC, board resolutions and client overview need it from day one,
 * and SPICe+ Part A prefills from it rather than asking again. Stage is kept in
 * the signature so callers read the same as stageRequiresSubsidiary.
 */
export function stageRequiresParentEntity(_stage: Stage, ownershipType: OwnershipType = 'subsidiary'): boolean {
  return ownershipType !== 'independent';
}

/**
 * Asked first: does a parent entity stand behind this company? Standalone
 * skips every parent / subsidiary question here and the parent-entity
 * sections of the incorporation checklist.
 */
export const OWNERSHIP_TYPES: Array<{ value: OwnershipType; label: string; hint: string }> = [
  {
    value: 'subsidiary',
    label: 'Subsidiary',
    hint: 'Backed by a parent company, foreign or Indian',
  },
  {
    value: 'independent',
    label: 'Standalone',
    hint: 'Promoted by individuals — no parent company',
  },
];

/**
 * Where the parent is incorporated (Subsidiary only). Labelled by the
 * parent, not the new company — a Standalone row is also stored `domestic`.
 */
export const COMPANY_TYPES: Array<{ value: CompanyType; label: string; hint: string }> = [
  { value: 'foreign', label: 'Foreign subsidiary', hint: 'Parent incorporated outside India · FEMA track' },
  { value: 'domestic', label: 'Indian subsidiary', hint: 'Parent incorporated in India' },
];

/** What an Indian parent does for the new company (Indian subsidiary only). */
export const PARENT_INDIAN_RELATIONSHIPS: Array<{
  value: ParentIndianRelationship;
  label: string;
  hint: string;
}> = [
  { value: 'name_only', label: 'Name use only', hint: 'Lends its name; does not invest' },
  { value: 'investing', label: 'Investing', hint: 'Subscribes to shares of the new company' },
];

/** Field error shown when the Indian parent's role is required but not chosen. */
export const PARENT_INDIAN_RELATIONSHIP_REQUIRED_MESSAGE =
  'Choose whether the Indian parent lends its name or invests.';

/** True when the form cannot submit because the Indian parent's role is unchosen. */
export function parentIndianRelationshipMissing(
  state: Pick<CreateProjectState, 'ownershipType' | 'companyType' | 'parentIndianRelationship'>,
): boolean {
  return requiresParentIndianRelationship(state) && state.parentIndianRelationship === null;
}

/** Value to send on POST / PATCH: null unless Indian subsidiary. */
export function parentIndianRelationshipForSubmit(
  state: Pick<CreateProjectState, 'ownershipType' | 'companyType' | 'parentIndianRelationship'>,
): ParentIndianRelationship | null {
  return requiresParentIndianRelationship(state) ? state.parentIndianRelationship : null;
}

export const ENTITY_LEGAL_FORMS: Array<{ value: EntityLegalForm; label: string; hint: string }> = [
  { value: 'company', label: ENTITY_LEGAL_FORM_LABEL.company, hint: 'Private / public limited company' },
  { value: 'llp', label: ENTITY_LEGAL_FORM_LABEL.llp, hint: 'Limited Liability Partnership' },
  { value: 'partnership', label: ENTITY_LEGAL_FORM_LABEL.partnership, hint: 'Registered partnership firm' },
  { value: 'proprietorship', label: ENTITY_LEGAL_FORM_LABEL.proprietorship, hint: 'Sole proprietorship' },
];

export function passwordStrength(pw: string): 'weak' | 'fair' | 'strong' | null {
  if (!pw) return null;
  if (pw.length < 8) return 'weak';
  const hasNum = /\d/.test(pw);
  const hasSym = /[^A-Za-z0-9]/.test(pw);
  const hasMixed = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  if (pw.length >= 12 && hasNum && (hasSym || hasMixed)) return 'strong';
  if (pw.length >= 8 && (hasNum || hasSym)) return 'fair';
  return 'weak';
}

export type CreateProjectState = {
  companyName: string;
  ownershipType: OwnershipType;
  companyType: CompanyType;
  /** Indian subsidiary only; null = not applicable or not yet chosen. */
  parentIndianRelationship: ParentIndianRelationship | null;
  entityLegalForm: EntityLegalForm;
  subsidiaryLegalName: string;
  subsidiaryRegisteredAddress: string;
  /** Parent entity, asked only when the starting phase skips SPICe+ Part A. */
  parentEntityName: string;
  parentEntityAddress: string;
  clientContact: string;
  /** Client mobile for WhatsApp nudges. Raw input; normalised to E.164 on submit. */
  clientPhone: string;
  /** Explicit WhatsApp consent. Never pre-ticked. */
  clientWhatsappConsent: boolean;
  clientEmail: string;
  clientPassword: string;
  /** Project leads; first is primary. */
  internIds: string[];
  /** Project managers; first is primary. */
  managerIds: string[];
  stage: Stage;
  health: 'on-track' | 'at-risk' | 'overdue';
  questionnaire: QuestionnaireAnswers;
  submitting: boolean;
  showValidation: boolean;
  showPassword: boolean;
};

export type CreateProjectAction =
  | { type: 'patch'; patch: Partial<CreateProjectState> }
  | { type: 'toggle_show_password' }
  | { type: 'reset'; internIds: string[]; managerIds?: string[] };

export const DEFAULT_CLIENT_TEMP_PASSWORD = 'SBC@2026';

export function createProjectReducer(state: CreateProjectState, action: CreateProjectAction): CreateProjectState {
  switch (action.type) {
    case 'toggle_show_password':
      return { ...state, showPassword: !state.showPassword };
    case 'reset':
      return {
        companyName: '',
        ownershipType: 'subsidiary',
        companyType: 'domestic',
        parentIndianRelationship: null,
        entityLegalForm: 'company',
        subsidiaryLegalName: '',
        subsidiaryRegisteredAddress: '',
        parentEntityName: '',
        parentEntityAddress: '',
        clientContact: '',
        clientPhone: '',
        clientWhatsappConsent: false,
        clientEmail: '',
        clientPassword: DEFAULT_CLIENT_TEMP_PASSWORD,
        internIds: action.internIds,
        managerIds: action.managerIds ?? state.managerIds,
        stage: 'Pre-Incorporation',
        health: 'on-track',
        questionnaire: {},
        submitting: false,
        showValidation: false,
        showPassword: false,
      };
    case 'patch': {
      const next = { ...state, ...action.patch };
      // Standalone or a Foreign parent: the Indian parent's role no longer applies.
      if (next.parentIndianRelationship !== null && !requiresParentIndianRelationship(next)) {
        return { ...next, parentIndianRelationship: null };
      }
      return next;
    }
    default:
      return state;
  }
}

const DRAFT_STORAGE_KEY = 'vcfo.create-project.draft.v3';

export type CreateProjectDraftPayload = Omit<
  CreateProjectState,
  'submitting' | 'showValidation' | 'showPassword'
>;

function asIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function saveCreateProjectDraft(state: CreateProjectState): void {
  if (typeof window === 'undefined') return;
  const payload: CreateProjectDraftPayload = {
    companyName: state.companyName,
    ownershipType: state.ownershipType,
    companyType: state.companyType,
    parentIndianRelationship: state.parentIndianRelationship,
    entityLegalForm: state.entityLegalForm,
    subsidiaryLegalName: state.subsidiaryLegalName,
    subsidiaryRegisteredAddress: state.subsidiaryRegisteredAddress,
    parentEntityName: state.parentEntityName,
    parentEntityAddress: state.parentEntityAddress,
    clientContact: state.clientContact,
    clientPhone: state.clientPhone,
    // Consent is deliberately NOT persisted: a resumed draft must never come
    // back with the box already ticked. The admin re-affirms it each time.
    clientWhatsappConsent: false,
    clientEmail: state.clientEmail,
    clientPassword: state.clientPassword,
    internIds: state.internIds,
    managerIds: state.managerIds,
    stage: state.stage,
    health: state.health,
    questionnaire: state.questionnaire,
  };
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

export function loadCreateProjectDraft(): CreateProjectDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(DRAFT_STORAGE_KEY) ??
      window.localStorage.getItem('vcfo.create-project.draft.v2') ??
      window.localStorage.getItem('vcfo.create-project.draft.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CreateProjectDraftPayload> & {
      internId?: string;
      managerId?: string;
    };
    if (!parsed || typeof parsed !== 'object') return null;
    const internIds = asIdList(parsed.internIds ?? parsed.internId);
    const managerIds = asIdList(parsed.managerIds ?? parsed.managerId);
    return {
      companyName: typeof parsed.companyName === 'string' ? parsed.companyName : '',
      ownershipType: parsed.ownershipType === 'independent' ? 'independent' : 'subsidiary',
      companyType: parsed.companyType === 'foreign' ? 'foreign' : 'domestic',
      // Drafts saved before this field existed simply have none → null.
      parentIndianRelationship: coerceParentIndianRelationship(parsed.parentIndianRelationship),
      entityLegalForm:
        parsed.entityLegalForm === 'llp' ||
        parsed.entityLegalForm === 'partnership' ||
        parsed.entityLegalForm === 'proprietorship'
          ? parsed.entityLegalForm
          : 'company',
      subsidiaryLegalName:
        typeof parsed.subsidiaryLegalName === 'string' ? parsed.subsidiaryLegalName : '',
      subsidiaryRegisteredAddress:
        typeof parsed.subsidiaryRegisteredAddress === 'string'
          ? parsed.subsidiaryRegisteredAddress
          : '',
      parentEntityName: typeof parsed.parentEntityName === 'string' ? parsed.parentEntityName : '',
      parentEntityAddress:
        typeof parsed.parentEntityAddress === 'string' ? parsed.parentEntityAddress : '',
      clientContact: typeof parsed.clientContact === 'string' ? parsed.clientContact : '',
      clientPhone: typeof parsed.clientPhone === 'string' ? parsed.clientPhone : '',
      // Always restored un-ticked — see saveCreateProjectDraft.
      clientWhatsappConsent: false,
      clientEmail: typeof parsed.clientEmail === 'string' ? parsed.clientEmail : '',
      clientPassword:
        typeof parsed.clientPassword === 'string' && parsed.clientPassword
          ? parsed.clientPassword
          : DEFAULT_CLIENT_TEMP_PASSWORD,
      internIds,
      managerIds,
      questionnaire:
        parsed.questionnaire && typeof parsed.questionnaire === 'object' && !Array.isArray(parsed.questionnaire)
          ? (parsed.questionnaire as QuestionnaireAnswers)
          : {},
      stage:
        parsed.stage === 'Post-Incorporation' || parsed.stage === 'Operational Readiness'
          ? parsed.stage
          : 'Pre-Incorporation',
      health:
        parsed.health === 'at-risk' || parsed.health === 'overdue' ? parsed.health : 'on-track',
    };
  } catch {
    return null;
  }
}

export function clearCreateProjectDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  window.localStorage.removeItem('vcfo.create-project.draft.v2');
  window.localStorage.removeItem('vcfo.create-project.draft.v1');
}

export function uniqueNonEmptyIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

/** Legacy mock roster ids from `src/data` — never send these to POST /api/engagements. */
export function isPlaceholderTeamId(id: string): boolean {
  return /^tm\d+$/i.test(id.trim());
}

export function sameIdList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Drop unknown / mock ids so Radix Select is never given a value with no item.
 * If nothing valid remains, default to the first available option.
 */
export function reconcileSelectedIds(current: string[], available: string[]): string[] {
  if (available.length === 0) {
    return uniqueNonEmptyIds(current).filter((id) => !isPlaceholderTeamId(id));
  }
  const known = uniqueNonEmptyIds(current).filter((id) => available.includes(id));
  const hasEmptySlot = current.some((id) => !id.trim());
  if (known.length === 0) return [available[0]];
  return hasEmptySlot ? [...known, ''] : known;
}

