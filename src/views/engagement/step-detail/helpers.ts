import type { ChecklistItem } from '@/data/checklist';
import type { OwnershipType } from '@/data/engagements';
import { formatWindow, windowForStep, type EngagementSchedule } from '@/lib/projects/schedule-windows';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { getStepAttachmentRequirements } from '@/lib/checklist/checklist-step-attachments';
import type { JourneyRailItem } from '@/components/incorporation/ChecklistJourneyRail';
import { deriveChecklistDisplayStatus } from '@/lib/checklist/checklist-display-status';
import { gateDisplayStatus, getStepGate, type ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import type { BoardResolutionProgressSnapshot } from '@/lib/client/client-progress-board';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { directFlowRoleLabel } from '@/lib/incorporation/pre-inc-direct-flow';

/** "Last edited by Kiran Rao (Client), 12 Oct 2026, 4:05 pm" — IST, like every other time in the app. */
export function lastEditedLine(slice: ChecklistItemStateSlice | undefined): string | null {
  const at = slice?.lastEditedAt?.trim();
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const when = date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const who = slice?.lastEditedByName?.trim() || 'Someone';
  return `Last edited by ${who} (${directFlowRoleLabel(slice?.lastEditedByRole)}), ${when}`;
}

export function journeyRailItems(
  steps: readonly ChecklistItem[],
  gates: Record<string, ChecklistStepGate>,
  checklistState: Record<string, ChecklistItemStateSlice | undefined>,
  brSnapshot: BoardResolutionProgressSnapshot | null | undefined,
  ownershipType: OwnershipType | undefined,
  schedule: EngagementSchedule | undefined,
): JourneyRailItem[] {
  return steps.map((step, index) => {
    const gate = getStepGate(gates, step.id);
    const slice = checklistState[step.id];
    const window = windowForStep(schedule, step.id);
    return {
      ...(window ? { windowLabel: formatWindow(window) } : {}),
      item: step,
      gate,
      status: gateDisplayStatus(
        deriveChecklistDisplayStatus(step.id, step, slice, brSnapshot ?? undefined),
        gate,
      ),
      stepNumber: index + 1,
      attachments: getStepAttachmentRequirements(
        step,
        extractItemResponses(step, slice),
        ownershipType,
      ),
    };
  });
}
