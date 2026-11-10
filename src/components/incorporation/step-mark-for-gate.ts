import type { StepState, StepTone } from '@/components/ui/step-track';
import type { StatusCode } from '@/data/checklist';
import type { ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';

/**
 * ST5 marker (R-22) for a step gate. Done is the green tick, the open step is the live ring
 * (teal when it waits on someone else), and a locked step is the outlined upcoming square.
 */
export function stepMarkForGate(gate: Pick<ChecklistStepGate, 'kind'>): { state: StepState; tone: StepTone; label: string } {
  switch (gate.kind) {
    case 'done':
      return { state: 'done', tone: 'prog', label: 'Done' };
    case 'active':
      return { state: 'now', tone: 'prog', label: 'In progress' };
    case 'waiting':
      return { state: 'now', tone: 'teal', label: 'Waiting' };
    default:
      return { state: 'next', tone: 'prog', label: 'Upcoming' };
  }
}

/** ST5 marker for a step's display status, for staff lists that show the status chip too. */
export function stepMarkForStatus(status: StatusCode): { state: StepState; tone: StepTone; label: string } {
  switch (status) {
    case 'completed':
      return { state: 'done', tone: 'prog', label: 'Done' };
    case 'in-progress':
      return { state: 'now', tone: 'prog', label: 'In progress' };
    case 'awaiting-client':
      return { state: 'now', tone: 'teal', label: 'Waiting' };
    case 'overdue':
      return { state: 'now', tone: 'bad', label: 'Overdue' };
    default:
      return { state: 'next', tone: 'prog', label: status === 'not-applicable' ? 'Not applicable' : 'Not started' };
  }
}
