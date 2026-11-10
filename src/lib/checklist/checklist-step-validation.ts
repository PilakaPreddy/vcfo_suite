import { checklist } from '@/data/checklist';
import type { OwnershipType } from '@/data/engagements';
import {
  fieldsForOwnership,
  getClientResponseFields,
  validateInternDelivery,
  type ChecklistItemResponses,
} from '@/lib/checklist/checklist-responses';
import {
  applyPre1EngagementDefaults,
  validatePre1Responses,
  type Pre1ValidationOptions,
} from '@/lib/checklist/checklist-pre1-validation';
import {
  validatePre13Responses,
  validatePre14Responses,
  validatePre15Responses,
  validatePre16Responses,
} from '@/lib/checklist/checklist-part-b-validation';
import { validatePre6Responses } from '@/lib/checklist/checklist-pre6-validation';
import { validatePre7Responses } from '@/lib/checklist/checklist-pre7-validation';
import { validatePre8Responses } from '@/lib/checklist/checklist-pre8-validation';
import { validatePre9Responses } from '@/lib/checklist/checklist-pre9-validation';
import { validatePre10Responses } from '@/lib/checklist/checklist-pre10-validation';
import { validatePre11Responses } from '@/lib/checklist/checklist-pre11-validation';
import { validatePre12Responses } from '@/lib/checklist/checklist-pre12-validation';
import {
  applyShowWhen,
  isRepeatField,
  missingRequiredEntryFields,
  validateRepeatEntries,
} from '@/lib/checklist/checklist-repeat';
import type { DirectorSlotContext } from '@/lib/incorporation/incorp-director-slots';
import { directorAudiencesFromPre6 } from '@/lib/incorporation-docs/audiences';
import { isIncorpSlotSetFrozen } from '@/lib/incorporation-docs/share';
import { directorResponsesFromState, type StepStateMap } from '@/lib/incorporation/proposed-directors';
import { isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';
import { GST_REG_STEP_ID, gstRegFormatChecks } from '@/lib/checklist/gst-registration-fields';

/**
 * One step validator for the form and the server.
 *
 * The form runs it live and on Submit; `POST …/checklist/submit` runs the same
 * function on the merged answers, so a hand-rolled request cannot complete a
 * step the form would have refused.
 */

export interface StepValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
}

export interface StepValidationInput {
  itemId: string;
  /** The answers to check. For `pre-1`, with the engagement defaults applied. */
  responses: ChecklistItemResponses;
  /** Company type — decides which Part A sections (and so which fields) exist. */
  ownershipType?: OwnershipType;
  /** Part A: only these fields are required. Defaults to the company's Part A list. */
  pre1Validation?: Pre1ValidationOptions;
  /** Legacy `pre-6` only: the Part A answers its director slots come from. */
  pre1Responses?: ChecklistItemResponses;
  /** Legacy `pre-6` only: Part A must be submitted first. */
  pre1Submitted?: boolean;
  /** `pre-7` / `pre-8`: the directors on file. */
  directorSlots?: DirectorSlotContext;
}

const OK: StepValidationResult = { ok: true, errors: {}, warnings: {} };

function stepFields(itemId: string, ownershipType: OwnershipType | undefined) {
  const item = checklist.find((c) => c.id === itemId);
  if (!item) return [];
  return fieldsForOwnership(itemId, getClientResponseFields(item), ownershipType);
}

function result(errors: Record<string, string>, warnings: Record<string, string> = {}): StepValidationResult {
  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

/**
 * The generic rule for a step with no bespoke validator: every visible field
 * marked `required` has a value. Hidden fields (`showWhen`, the company type's
 * Part A sections) never block; repeat groups check their entry count and each
 * entry's own required fields.
 */
export function requiredFieldErrors(
  itemId: string,
  responses: ChecklistItemResponses,
  ownershipType?: OwnershipType,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of applyShowWhen(stepFields(itemId, ownershipType), responses)) {
    if (isRepeatField(field)) {
      Object.assign(
        errors,
        validateRepeatEntries(responses, field, (entry) => missingRequiredEntryFields(field, entry)),
      );
      continue;
    }
    if (!field.required) continue;
    if (!(responses[field.id] ?? '').trim()) {
      errors[field.id] = field.type === 'file' ? 'Please upload a document.' : 'This field is required.';
    }
  }
  return errors;
}

function bespokeValidation(input: StepValidationInput): StepValidationResult | null {
  const { itemId, responses, directorSlots } = input;
  switch (itemId) {
    case 'pre-1': {
      const options = input.pre1Validation ?? {
        visibleFieldIds: new Set(stepFields('pre-1', input.ownershipType).map((field) => field.id)),
      };
      return validatePre1Responses(responses, options);
    }
    case 'pre-6':
      if (!input.pre1Submitted) {
        return result({
          _pre1Gate:
            'Complete and submit Phase 1 Step 1 (proposed directors) before filling director KYC.',
        });
      }
      return validatePre6Responses(responses, input.pre1Responses ?? {});
    case 'pre-7':
      return validatePre7Responses(responses, directorSlots);
    case 'pre-8':
      return validatePre8Responses(responses, directorSlots);
    case 'pre-9':
      return validatePre9Responses(responses);
    case 'pre-10':
      return validatePre10Responses(responses);
    case 'pre-11':
      return validatePre11Responses(responses);
    case 'pre-12':
      return validatePre12Responses(responses);
    case 'pre-13':
      return validatePre13Responses(responses);
    case 'pre-14':
      return validatePre14Responses(responses);
    case 'pre-15':
      return validatePre15Responses(responses);
    case 'pre-16':
      return validatePre16Responses(responses);
    default:
      return null;
  }
}

/**
 * Validate one step's answers.
 *
 * - A step with its own validator uses it (results unchanged from before).
 * - `pre-4` / `pre-5` add the delivery uploads (`validateInternDelivery`).
 * - Any other direct-flow step gets the generic required check. Steps outside
 *   the direct flow (post-incorporation, registration) keep passing, as they
 *   always did — their rules are not this change's to tighten.
 */
export function runStepValidation(input: StepValidationInput): StepValidationResult {
  const bespoke = bespokeValidation(input);
  if (bespoke) return bespoke;
  if (!isDirectFlowStep(input.itemId)) return OK;

  const errors = requiredFieldErrors(input.itemId, input.responses, input.ownershipType);
  const delivery = validateInternDelivery(input.itemId, input.responses);
  if (input.itemId === GST_REG_STEP_ID) {
    const gst = gstRegFormatChecks(input.responses);
    return result({ ...errors, ...gst.errors, ...delivery.errors }, gst.warnings);
  }
  return result({ ...errors, ...delivery.errors });
}

/**
 * Server entry: rebuild what the form derives (Part A defaults, director slots)
 * from the persisted state, then validate. `state` must be the full, unredacted
 * checklist state.
 */
export function validateStepAgainstState(input: {
  itemId: string;
  responses: ChecklistItemResponses;
  state: StepStateMap;
  engagement?: {
    ownershipType?: OwnershipType;
    parentEntityName?: string | null;
    parentEntityAddress?: string | null;
    parentEntityRegistrationNumber?: string | null;
  } | null;
}): StepValidationResult {
  const { itemId, state, engagement } = input;
  const responses =
    itemId === 'pre-1' ? applyPre1EngagementDefaults(input.responses, engagement) : input.responses;
  const directorSlots: DirectorSlotContext | undefined =
    itemId === 'pre-7' || itemId === 'pre-8'
      ? {
          directors: directorAudiencesFromPre6(directorResponsesFromState(state).pre6),
          frozen:
            itemId === 'pre-7'
              ? isIncorpSlotSetFrozen(state?.[itemId])
              : state?.[itemId]?.reviewStatus === 'accepted',
        }
      : undefined;
  return runStepValidation({
    itemId,
    responses,
    ownershipType: engagement?.ownershipType,
    directorSlots,
  });
}
