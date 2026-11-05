import type { Engagement } from '@/data/engagements';
import type { ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import {
  parseDirectorCount,
  parsePre1BoardResolutionDate,
  PRE1_DIRECTOR_FIRST_NAME_IDS,
  PRE1_DIRECTOR_INDIA_RESIDENT_IDS,
  PRE1_DIRECTOR_LAST_NAME_IDS,
} from '@/lib/checklist/checklist-pre1-validation';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { PART_A_SECTION } from '@/lib/checklist/part-a-sections';
import { BoardResolutionSaveError } from '@/lib/projects/engagements-db';
import { resolveDirectorDisplayName, resolveSignatoryDisplayName } from '@/lib/person-name';

export const BOARD_RESOLUTION_ERROR_CODES = {
  STEP1_INCOMPLETE: 'step1_incomplete',
  MISSING_FIELDS: 'missing_fields',
  FINALIZED: 'finalized',
  TEMPLATE_MISSING: 'template_missing',
  TEMPLATE_RENDER_FAILED: 'template_render_failed',
  EXISTING_DOC_MISSING: 'existing_doc_missing',
  STORAGE_UPLOAD_FAILED: 'storage_upload_failed',
  SAVE_FAILED: 'save_failed',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  ENGAGEMENT_LOAD_FAILED: 'engagement_load_failed',
  GENERATE_FAILED: 'generate_failed',
} as const;

export type BoardResolutionErrorCode =
  (typeof BOARD_RESOLUTION_ERROR_CODES)[keyof typeof BOARD_RESOLUTION_ERROR_CODES];

/** Where a missing board-resolution input is answered — the editor links each one there. */
export interface BoardResolutionMissingFieldRef {
  stepId: string;
  fieldId: string;
  section?: string;
  label: string;
}

export interface BoardResolutionApiErrorBody {
  ok: false;
  error: string;
  code?: BoardResolutionErrorCode;
  missingFields?: string[];
  missingFieldRefs?: BoardResolutionMissingFieldRef[];
}

export class BoardResolutionError extends Error {
  readonly code: BoardResolutionErrorCode;
  readonly missingFields?: string[];
  readonly missingFieldRefs?: BoardResolutionMissingFieldRef[];
  readonly status: number;

  constructor(
    message: string,
    code: BoardResolutionErrorCode,
    options?: {
      missingFields?: string[];
      missingFieldRefs?: BoardResolutionMissingFieldRef[];
      status?: number;
    },
  ) {
    super(message);
    this.name = 'BoardResolutionError';
    this.code = code;
    this.missingFields = options?.missingFields;
    this.missingFieldRefs = options?.missingFieldRefs;
    this.status = options?.status ?? boardResolutionHttpStatus(code);
  }
}

function boardResolutionHttpStatus(code: BoardResolutionErrorCode): number {
  switch (code) {
    case BOARD_RESOLUTION_ERROR_CODES.UNAUTHORIZED:
      return 401;
    case BOARD_RESOLUTION_ERROR_CODES.FORBIDDEN:
      return 403;
    case BOARD_RESOLUTION_ERROR_CODES.NOT_FOUND:
      return 404;
    case BOARD_RESOLUTION_ERROR_CODES.FINALIZED:
      return 409;
    case BOARD_RESOLUTION_ERROR_CODES.STEP1_INCOMPLETE:
    case BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS:
      return 422;
    case BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_MISSING:
      return 503;
    case BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_RENDER_FAILED:
    case BOARD_RESOLUTION_ERROR_CODES.GENERATE_FAILED:
      return 422;
    default:
      return 500;
  }
}

export function boardResolutionErrorJson(err: BoardResolutionError): BoardResolutionApiErrorBody {
  return {
    ok: false,
    error: err.message,
    code: err.code,
    ...(err.missingFields?.length ? { missingFields: err.missingFields } : {}),
    ...(err.missingFieldRefs?.length ? { missingFieldRefs: err.missingFieldRefs } : {}),
  };
}

const PRE1_FIELD_LABELS: Record<string, string> = {
  parentEntityName: 'Parent entity name',
  proposedName1: 'Proposed company name (option 1)',
  boardResolutionDate: 'Board resolution date',
  signatoryName: 'Signatory name',
  signatoryFirstName: 'Signatory first name',
  signatoryLastName: 'Signatory last name',
  signatoryDesignation: 'Signatory designation',
  authorisedShareCapital: 'Authorised share capital',
  paidUpShareCapital: 'Paid-up share capital',
  directorCount: 'Director count',
  indiaResidentDirector: 'At least one India-resident director',
  nicCode: 'NIC code',
};

const PART_A = 'pre-1';

/** Where each Part A board-resolution input lives (step + field + section tab). */
const PRE1_FIELD_REFS: Record<string, { fieldId: string; section: string }> = {
  parentEntityName: { fieldId: 'parentEntityName', section: PART_A_SECTION.foreignEntity },
  proposedName1: { fieldId: 'proposedName1', section: PART_A_SECTION.proposedNames },
  signatoryName: { fieldId: 'signatoryFirstName', section: PART_A_SECTION.boardResolutionSignatory },
  signatoryDesignation: { fieldId: 'signatoryDesignation', section: PART_A_SECTION.boardResolutionSignatory },
  boardResolutionDate: { fieldId: 'boardResolutionDate', section: PART_A_SECTION.boardResolutionSignatory },
  authorisedShareCapital: { fieldId: 'authorisedShareCapital', section: PART_A_SECTION.shareCapital },
  paidUpShareCapital: { fieldId: 'paidUpShareCapital', section: PART_A_SECTION.shareCapital },
  nicCode: { fieldId: 'nicCode', section: PART_A_SECTION.nicCodes },
};

function pre1Ref(key: keyof typeof PRE1_FIELD_REFS): BoardResolutionMissingFieldRef {
  const ref = PRE1_FIELD_REFS[key]!;
  return { stepId: PART_A, fieldId: ref.fieldId, section: ref.section, label: PRE1_FIELD_LABELS[key]! };
}

/**
 * The board resolution names the proposed directors from Part A (2026-11-02).
 * Once `pre-15` has entries they overlay these slots, but Part A is still
 * where a missing name is answered before the resolution is drafted.
 */
function directorRef(label: string, fieldId = 'directorCount'): BoardResolutionMissingFieldRef {
  return { stepId: PART_A, fieldId, section: PART_A_SECTION.proposedDirectors, label };
}

function directorFieldLabel(index: number, kind: 'first' | 'last' | 'resident'): string {
  if (kind === 'first') return `Director ${index} first name`;
  if (kind === 'last') return `Director ${index} last name`;
  return `Director ${index} India residency`;
}

/** True when the client has submitted Step 1 (Name Application) or it was marked complete. */
export function isPre1SubmittedForBoardResolution(
  pre1State?: ChecklistItemStateSlice | null,
): boolean {
  if (!pre1State) return false;
  if (pre1State.clientSubmittedAt?.trim()) return true;
  if (pre1State.reviewStatus === 'accepted') return true;
  if (pre1State.status === 'completed') return true;
  return false;
}

function pickParentEntityName(
  pre1: ChecklistItemResponses,
  engagement?: Pick<Engagement, 'parentEntityName' | 'companyName'> | null,
): string {
  return (
    pre1.parentEntityName?.trim() ||
    engagement?.parentEntityName?.trim() ||
    engagement?.companyName?.trim() ||
    ''
  );
}

/**
 * Every input the board resolution needs that is still empty, with where it is
 * answered. The NIC code is checked here so a new document can never fall back
 * to the firm's default NIC list.
 */
export function collectBoardResolutionMissingFieldRefs(
  pre1: ChecklistItemResponses,
  engagement?: Pick<Engagement, 'parentEntityName' | 'companyName'> | null,
): BoardResolutionMissingFieldRef[] {
  const missing: BoardResolutionMissingFieldRef[] = [];

  if (!pickParentEntityName(pre1, engagement)) {
    missing.push(pre1Ref('parentEntityName'));
  }
  if (!pre1.proposedName1?.trim()) {
    missing.push(pre1Ref('proposedName1'));
  }
  if (!parsePre1BoardResolutionDate(pre1.boardResolutionDate)) {
    missing.push(pre1Ref('boardResolutionDate'));
  }
  if (!resolveSignatoryDisplayName(pre1)) {
    missing.push(pre1Ref('signatoryName'));
  }
  if (!pre1.signatoryDesignation?.trim()) {
    missing.push(pre1Ref('signatoryDesignation'));
  }
  if (!pre1.authorisedShareCapital?.trim()) {
    missing.push(pre1Ref('authorisedShareCapital'));
  }
  if (!pre1.paidUpShareCapital?.trim()) {
    missing.push(pre1Ref('paidUpShareCapital'));
  }
  if (!pre1.nicCode?.trim()) {
    missing.push(pre1Ref('nicCode'));
  }

  const directorCount = parseDirectorCount(pre1);
  let hasIndiaResident = false;

  for (let i = 0; i < directorCount; i += 1) {
    const index = i + 1;
    const firstNameId = PRE1_DIRECTOR_FIRST_NAME_IDS[i];
    const lastNameId = PRE1_DIRECTOR_LAST_NAME_IDS[i];
    const residentId = PRE1_DIRECTOR_INDIA_RESIDENT_IDS[i];

    if (!resolveDirectorDisplayName(pre1, index)) {
      if (!(pre1[firstNameId] ?? '').trim()) {
        missing.push(directorRef(directorFieldLabel(index, 'first'), firstNameId));
      }
      if (!(pre1[lastNameId] ?? '').trim()) {
        missing.push(directorRef(directorFieldLabel(index, 'last'), lastNameId));
      }
    }

    const resident = (pre1[residentId] ?? '').trim();
    if (!resident) {
      missing.push(directorRef(directorFieldLabel(index, 'resident'), residentId));
    } else if (resident === 'yes') {
      hasIndiaResident = true;
    }
  }

  if (directorCount >= 2 && !hasIndiaResident) {
    missing.push(directorRef(PRE1_FIELD_LABELS.indiaResidentDirector!));
  }

  return missing;
}

/** Collect human-readable labels for Pre-1 fields required to merge the board resolution. */
export function collectBoardResolutionMissingFields(
  pre1: ChecklistItemResponses,
  engagement?: Pick<Engagement, 'parentEntityName' | 'companyName'> | null,
): string[] {
  return collectBoardResolutionMissingFieldRefs(pre1, engagement).map((ref) => ref.label);
}

export interface ValidateBoardResolutionGenerationOptions {
  pre1: ChecklistItemResponses;
  pre1State?: ChecklistItemStateSlice | null;
  engagement?: Pick<Engagement, 'parentEntityName' | 'companyName'> | null;
  isPatchOnly?: boolean;
  isFinalized?: boolean;
  /** Rebuild storage for a finalized doc (corrupt .docx repair) — not inline editing. */
  allowFinalizedRepair?: boolean;
}

/** Validates prerequisites before generating or patching a board resolution document. */
export function validateBoardResolutionGeneration(
  options: ValidateBoardResolutionGenerationOptions,
): void {
  const { pre1, pre1State, engagement, isPatchOnly, isFinalized, allowFinalizedRepair } = options;

  if (isFinalized && !allowFinalizedRepair) {
    throw new BoardResolutionError(
      'This board resolution is finalized and can no longer be edited.',
      BOARD_RESOLUTION_ERROR_CODES.FINALIZED,
    );
  }

  if (isPatchOnly) return;

  if (!isPre1SubmittedForBoardResolution(pre1State)) {
    throw new BoardResolutionError(
      STEP1_INCOMPLETE_MESSAGE,
      BOARD_RESOLUTION_ERROR_CODES.STEP1_INCOMPLETE,
      { missingFieldRefs: [{ stepId: PART_A, fieldId: 'proposedName1', label: 'Client Details' }] },
    );
  }

  const missingFieldRefs = collectBoardResolutionMissingFieldRefs(pre1, engagement);
  if (missingFieldRefs.length > 0) {
    const missingFields = missingFieldRefs.map((ref) => ref.label);
    throw new BoardResolutionError(
      `This data is missing: ${missingFields.join(', ')}.`,
      BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS,
      { missingFields, missingFieldRefs },
    );
  }
}

const STEP1_INCOMPLETE_MESSAGE =
  'Submit Client Details first. The board resolution uses this data.';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Sign in to continue.',
  forbidden: 'You do not have permission to access this board resolution.',
  not_found: 'Project not found.',
  engagement_load_failed: 'Could not load project data. Try again in a moment.',
};

export function boardResolutionAuthErrorResponse(
  code: string,
  status: number,
): BoardResolutionApiErrorBody & { status?: never } {
  const mapped =
    AUTH_ERROR_MESSAGES[code] ??
    (status === 401 ? AUTH_ERROR_MESSAGES.unauthorized : AUTH_ERROR_MESSAGES.forbidden);
  const errorCode =
    code === 'unauthorized'
      ? BOARD_RESOLUTION_ERROR_CODES.UNAUTHORIZED
      : code === 'not_found'
        ? BOARD_RESOLUTION_ERROR_CODES.NOT_FOUND
        : code === 'engagement_load_failed'
          ? BOARD_RESOLUTION_ERROR_CODES.ENGAGEMENT_LOAD_FAILED
          : BOARD_RESOLUTION_ERROR_CODES.FORBIDDEN;

  return {
    ok: false,
    error: mapped,
    code: errorCode,
  };
}

function isTemplateMissingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('template missing') || lower.includes('board resolution template');
}

function isExistingDocMissingMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not load the existing board resolution') ||
    lower.includes('re-generate from pre-1')
  );
}

/** Map thrown values from generation/storage into structured API errors. */
export function toBoardResolutionError(err: unknown): BoardResolutionError {
  if (err instanceof BoardResolutionError) return err;

  if (err instanceof BoardResolutionSaveError) {
    const saveMessage = err.message.trim();
    const rpcMismatch =
      /could not find the function|schema cache/i.test(saveMessage) ||
      err.code === 'PGRST202';
    if (rpcMismatch) {
      return new BoardResolutionError(
        'The board resolution save function is out of date on the server. Apply pending database migrations, then try again.',
        BOARD_RESOLUTION_ERROR_CODES.SAVE_FAILED,
        { status: 503 },
      );
    }
    return new BoardResolutionError(
      saveMessage || 'Could not save the board resolution. Try again in a moment.',
      BOARD_RESOLUTION_ERROR_CODES.SAVE_FAILED,
    );
  }

  const message = err instanceof Error ? err.message.trim() : '';
  if (!message) {
    return new BoardResolutionError(
      'Could not generate the board resolution. Try again in a moment.',
      BOARD_RESOLUTION_ERROR_CODES.GENERATE_FAILED,
    );
  }

  if (isTemplateMissingMessage(message)) {
    return new BoardResolutionError(
      'The board resolution Word template is missing on the server. Ask your administrator to run prepare-board-resolution-docx.mjs.',
      BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_MISSING,
    );
  }

  if (isExistingDocMissingMessage(message)) {
    return new BoardResolutionError(
      'The saved Word file could not be loaded. Re-generate from Pre-1, then try saving again.',
      BOARD_RESOLUTION_ERROR_CODES.EXISTING_DOC_MISSING,
    );
  }

  if (message.includes('word/document.xml')) {
    return new BoardResolutionError(
      'The stored board resolution file is damaged. Re-generate from Pre-1 or apply the latest template.',
      BOARD_RESOLUTION_ERROR_CODES.EXISTING_DOC_MISSING,
    );
  }

  if (message.toLowerCase().includes('multi error') || message.toLowerCase().includes('docxtemplater')) {
    return new BoardResolutionError(
      'The Word template could not be merged with Pre-1 data. Apply the latest template or contact support.',
      BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_RENDER_FAILED,
    );
  }

  if (message.toLowerCase().includes('bucket') || message.toLowerCase().includes('storage')) {
    return new BoardResolutionError(
      'Could not upload the board resolution file. Try again in a moment.',
      BOARD_RESOLUTION_ERROR_CODES.STORAGE_UPLOAD_FAILED,
    );
  }

  return new BoardResolutionError(message, BOARD_RESOLUTION_ERROR_CODES.GENERATE_FAILED);
}

export interface BoardResolutionErrorDisplay {
  title: string;
  description: string;
  missingFields?: string[];
  missingFieldRefs?: BoardResolutionMissingFieldRef[];
}

/** Format structured API errors for toast / inline UI. */
export function formatBoardResolutionErrorDisplay(
  body: Partial<BoardResolutionApiErrorBody> & { error?: string },
  fallbackTitle = 'Something went wrong',
): BoardResolutionErrorDisplay {
  const code = body.code;
  const missingFields = body.missingFields;
  const missingFieldRefs = body.missingFieldRefs;
  const errorText = body.error?.trim();

  switch (code) {
    case BOARD_RESOLUTION_ERROR_CODES.STEP1_INCOMPLETE:
      return {
        title: 'Client Details not submitted',
        description: errorText ?? STEP1_INCOMPLETE_MESSAGE,
        missingFieldRefs,
      };
    case BOARD_RESOLUTION_ERROR_CODES.MISSING_FIELDS:
      return {
        title: 'Missing information',
        description:
          errorText ??
          (missingFields?.length
            ? `This data is missing: ${missingFields.join(', ')}.`
            : 'Complete the required Step 1 fields, then try again.'),
        missingFields,
        missingFieldRefs,
      };
    case BOARD_RESOLUTION_ERROR_CODES.FINALIZED:
      return {
        title: 'Document finalized',
        description: errorText ?? 'This board resolution can no longer be edited.',
      };
    case BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_MISSING:
      return {
        title: 'Template not found',
        description:
          errorText ??
          'The board resolution Word template is missing. Contact your administrator.',
      };
    case BOARD_RESOLUTION_ERROR_CODES.TEMPLATE_RENDER_FAILED:
      return {
        title: 'Template merge failed',
        description:
          errorText ??
          'The Word template could not be filled with Step 1 data. Try applying the latest template.',
      };
    case BOARD_RESOLUTION_ERROR_CODES.EXISTING_DOC_MISSING:
      return {
        title: 'Saved file unavailable',
        description:
          errorText ?? 'Re-generate from Pre-1, then try saving again.',
      };
    case BOARD_RESOLUTION_ERROR_CODES.STORAGE_UPLOAD_FAILED:
      return {
        title: 'Upload failed',
        description: errorText ?? 'Could not store the Word file. Try again.',
      };
    case BOARD_RESOLUTION_ERROR_CODES.UNAUTHORIZED:
      return {
        title: 'Sign in required',
        description: errorText ?? AUTH_ERROR_MESSAGES.unauthorized,
      };
    case BOARD_RESOLUTION_ERROR_CODES.FORBIDDEN:
      return {
        title: 'Access denied',
        description: errorText ?? AUTH_ERROR_MESSAGES.forbidden,
      };
    case BOARD_RESOLUTION_ERROR_CODES.NOT_FOUND:
      return {
        title: 'Not found',
        description: errorText ?? AUTH_ERROR_MESSAGES.not_found,
      };
    default:
      return {
        title: fallbackTitle,
        description: errorText ?? 'Try again in a moment.',
        missingFields,
      };
  }
}
