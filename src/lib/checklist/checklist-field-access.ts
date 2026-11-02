import type { ChecklistField, ChecklistItem, ChecklistResponsibleRole } from '@/data/checklist';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isDirectFlowStep, isLeadOnlyField } from '@/lib/incorporation/pre-inc-direct-flow';

export const RESPONSIBLE_ROLE_LABEL: Record<ChecklistResponsibleRole, string> = {
  client: 'Client',
  intern: 'Project Lead',
};


/**
 * Fields visible for the current portal variant. On a pre-incorporation
 * direct-flow step the client sees every field — lead-only ones as read-only
 * rows — because both parties fill the same form.
 */
export function filterFieldsByViewer(
  fields: ChecklistField[],
  variant: 'admin' | 'client',
  itemId?: string,
): ChecklistField[] {
  if (variant === 'admin') return fields;
  // Direct-flow steps: the client sees every field except the project lead's
  // own (the Part A NIC codes) — those are not shown to the client at all.
  if (itemId && isDirectFlowStep(itemId)) return fields.filter((field) => !isLeadOnlyField(itemId, field.id));
  return fields.filter((field) => field.filledBy !== 'intern');
}

function getVisibleResponseFields(
  item: ChecklistItem,
  variant: 'admin' | 'client',
): ChecklistField[] {
  return filterFieldsByViewer(getClientResponseFields(item), variant, item.id);
}

export function hasResponseFormFields(
  item: ChecklistItem,
  variant: 'admin' | 'client',
): boolean {
  return getVisibleResponseFields(item, variant).length > 0;
}

/**
 * MilestoneResponseForm read-only: explicit readOnly prop, or client viewing a delivered intern step.
 * Intern/manager keep edit access after deliver so they can correct and re-publish to the portal.
 */
/**
 * The client edits only pre-incorporation direct-flow steps.
 *
 * Everywhere else a client reads their file and asks the firm to change it
 * (the change-request action on the step). On a direct-flow step the client
 * and the project lead fill the same form; the gate's `canEdit` (passed in as
 * `readOnly`) decides when it is open — the current step, not submitted.
 *
 * `readOnly` still forces read-only for staff (a locked or done step).
 */
export function isMilestoneFormReadOnly(params: {
  readOnly?: boolean;
  variant: 'admin' | 'client';
  itemId: string;
  itemState?: ChecklistItemStateSlice | null;
}): boolean {
  const { readOnly, variant, itemId } = params;
  if (readOnly) return true;
  return variant === 'client' && !isDirectFlowStep(itemId);
}
