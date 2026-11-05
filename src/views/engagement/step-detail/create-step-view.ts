import type { ChecklistItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import { isIncorporationWindowStep, type ScheduleTarget, windowForStep } from '@/lib/projects/schedule-windows';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { filterFieldsByViewer, hasResponseFormFields } from '@/lib/checklist/checklist-field-access';
import { isStepReleasedToClient, isStepReleasedToFirm } from '@/lib/checklist/checklist-visibility';
import { internRegistrationHeadingGroups } from '@/lib/intern/intern-overview-progress';
import { stepApprovalLabel } from '@/lib/checklist/checklist-step-approval';
import { docPackPagePath } from '@/lib/doc-pack/paths';
import { gateDisplayStatus } from '@/lib/checklist/checklist-step-gate';
import { stepMarkForStatus } from '@/components/incorporation/step-mark-for-gate';
import {
  isDirectFlowStep,
  isDirectFlowStepComplete,
  isWaitingOnLead,
} from '@/lib/incorporation/pre-inc-direct-flow';
import { journeyRailItems, lastEditedLine } from '@/views/engagement/step-detail/helpers';
import type { useEngagementStepDetail } from '@/views/engagement/step-detail/use-engagement-step-detail';

type StepDetailState = ReturnType<typeof useEngagementStepDetail>;

/**
 * Everything the step page derives once the engagement and the step are known:
 * the rails, the reader's flags and notices, the window target and the two
 * handlers. Plain values only; the JSX stays in `EngagementStepDetail`.
 */
export function createStepView(state: StepDetailState, eng: Engagement, item: ChecklistItem) {
  const {
    router,
    updateTask,
    engagementsLoading,
    checklistRefreshing,
    isClientRoute,
    isIntern,
    readOnlyView,
    stepPath,
    eTasks,
    catalog,
    internPhase,
    docPackVisible,
    docPackShell,
    bucketSteps,
    checklistState,
    responses,
    brSnapshot,
    gates,
    stepGate,
  } = state;

  const checklistLoading = engagementsLoading || checklistRefreshing;
  // Nobody is bounced off a locked step: readers may open any step in any
  // order — the gate governs actions, not access.

  const handleCompleted = (completedId: string) => {
    const completed = eTasks.find((t) => t.id === completedId);
    if (!completed) return;
    const meta = catalog.find((c) => c.id === completed.checklistKey);
    if (!meta) return;
    const idx = catalog.findIndex((c) => c.id === meta.id);
    const taskByChecklistKey = new Map(eTasks.map((t) => [t.checklistKey, t]));
    for (let i = idx + 1; i < catalog.length; i++) {
      const next = taskByChecklistKey.get(catalog[i].id);
      if (next && next.status === 'not-started') {
        updateTask(next.id, { status: 'in-progress' });
        break;
      }
    }
  };

  const clientVisibleFields = isClientRoute
    ? filterFieldsByViewer(getClientResponseFields(item), 'client', item.id)
    : [];
  const clientHasContent = clientVisibleFields.some((field) =>
    String(responses?.[field.id] ?? '').trim().length > 0,
  );
  /**
   * The step is not this reader's yet → the calm "what this step captures"
   * card, not a form of dashes. For the client that is until the manager
   * accepts it (the API already strips the answers); for a manager or admin,
   * until the lead asks for their approval. A released step with nothing to
   * show still renders as the record so the client's Approve stays reachable.
   */
  const stepSlice = checklistState[item.id];
  const clientNothingYet =
    isClientRoute && !isStepReleasedToClient(stepSlice, item.id) && !clientHasContent;
  const staffAwaitingLead =
    readOnlyView &&
    !isClientRoute &&
    hasResponseFormFields(item, 'admin') &&
    !isStepReleasedToFirm(stepSlice, item.id);
  const nothingYetIntro = staffAwaitingLead
    ? 'Your project lead is still preparing this step. Their answers appear here once they ask for your approval.'
    : undefined;

  const railItems = journeyRailItems(
    bucketSteps,
    gates,
    checklistState,
    brSnapshot,
    eng.ownershipType,
    eng.schedule,
    isClientRoute,
  );
  const internPhaseRailItems = internPhase
    ? journeyRailItems(
        internPhase.items,
        gates,
        checklistState,
        brSnapshot,
        eng.ownershipType,
        eng.schedule,
        isClientRoute,
      )
    : [];
  /**
   * The window bar (S-489) for every staff reader. A manager, admin or super admin edits it
   * (`canSetScheduleWindows`, enforced again in the repository); leads read it. A SPICe+ Part A
   * or Part B step without a window of its own shares the one incorporation window, so its
   * "Edit" moves that window, the same one the project page sets.
   */
  const stepWindowTarget: ScheduleTarget =
    isIncorporationWindowStep(item.id) && !eng.schedule?.steps?.[item.id]
      ? { kind: 'incorporation' }
      : { kind: 'step', itemId: item.id };
  const stepWindowValue = windowForStep(eng.schedule, item.id);
  const internPhaseRailGroups = (() => {
    if (!internPhase || internPhase.id !== 'registration-phase-4') return [];
    const byId = new Map(internPhaseRailItems.map((row) => [row.item.id, row]));
    return internRegistrationHeadingGroups(internPhase.items).map((group) => ({
      heading: group.heading,
      items: group.items
        .map((step) => byId.get(step.id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    }));
  })();

  const openStep = (id: string) => {
    const next = catalog.find((s) => s.id === id) ?? bucketSteps.find((s) => s.id === id);
    if (next) router.push(stepPath(eng, next));
  };

  // Readers get the lead's workspace layout, not the old staff rail layout.
  const internWorkspace = isIntern || readOnlyView;
  /* S-486: every staff reader sees the step's status chip in the head. The client route keeps
     its approval line instead, as before. */
  const showHeadStatus = !isClientRoute;

  // Direct-flow steps have no approval: no status pill, no Approve button.
  const directFlow = isDirectFlowStep(item.id);
  const approvalLabel =
    isClientRoute && !directFlow ? stepApprovalLabel(checklistState[item.id]) : null;
  const directFlowComplete = directFlow && isDirectFlowStepComplete(item.id, stepSlice);
  const editedLine = directFlow ? lastEditedLine(stepSlice) : null;
  /** Gate copy the light layout would otherwise never show (waiting / opens after …). */
  const gateNotice =
    directFlow && stepGate?.message && (stepGate.kind === 'waiting' || stepGate.kind === 'locked')
      ? stepGate.message
      : null;
  const leadWaitingNotice =
    directFlow && isIntern && isWaitingOnLead(item.id, stepSlice)
      ? `${stepSlice?.waitingOnLeadByName?.trim() || 'The client'} submitted their part. Fill the NIC codes, then submit to complete this step.`
      : null;

  const docPackHref = docPackVisible
    ? docPackPagePath(eng, docPackShell, internPhase?.id === 'pre-inc-phase-1' ? 'part-a' : 'part-b')
    : null;

  const selfRow =
    internPhaseRailItems.find((row) => row.item.id === item.id) ?? railItems.find((row) => row.item.id === item.id);
  const selfStatus = selfRow ? gateDisplayStatus(selfRow.status, selfRow.gate) : null;
  const selfMark = selfStatus ? stepMarkForStatus(selfStatus) : null;

  /**
   * Every rail row opens, for the lead and for the client alike. Nothing is
   * locked for VIEWING: the sequential gate now governs actions only, and the
   * rail's node icons carry progress (tick done / blue current / dim upcoming).
   */
  const railDone = internPhaseRailItems.filter((row) => row.gate.kind === 'done').length;

  return {
    checklistLoading,
    handleCompleted,
    clientNothingYet,
    staffAwaitingLead,
    nothingYetIntro,
    railItems,
    internPhaseRailItems,
    stepWindowTarget,
    stepWindowValue,
    internPhaseRailGroups,
    openStep,
    internWorkspace,
    showHeadStatus,
    directFlow,
    approvalLabel,
    directFlowComplete,
    editedLine,
    gateNotice,
    leadWaitingNotice,
    docPackHref,
    selfRow,
    selfStatus,
    selfMark,
    railDone,
  };
}
