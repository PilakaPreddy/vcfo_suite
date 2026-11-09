import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isClientFillPending } from '@/lib/checklist/checklist-client-fill';
import { checklist } from '@/data/checklist';
import { primaryPhaseItems } from '@/lib/projects/project-stuck';
import { isAwaitingManagerDecision, isDirectFlowStep, MANAGER_APPROVAL_STEP_ID } from '@/lib/incorporation/pre-inc-direct-flow';

export type PendingApprovalRow = {
  engagementId: string;
  companyName: string;
  itemId: string;
  slug?: string;
  /** `lead_manager_request` when the lead asked for sign-off; otherwise a client submit. */
  reviewSource?: string;
  /** Lead is asking to send this step to the client — approve before it goes out. */
  clientFill?: { requestedByName?: string; note?: string };
};

type ApprovalEngagement = Pick<Engagement, 'id' | 'companyName' | 'slug' | 'stage'>;

/**
 * Every step waiting on a manager or admin decision across `engagements`.
 * Pure so the Approvals inbox (browser) and Ask VCFO's staff tools (server)
 * read the same rule.
 */
export function listPendingApprovals(
  engagements: readonly ApprovalEngagement[],
  stateFor: (engagement: ApprovalEngagement) => Record<string, ChecklistItemStateSlice | undefined>,
): PendingApprovalRow[] {
  const out: PendingApprovalRow[] = [];
  // Registration steps (the statutory bucket) also go lead → manager → client and email the
  // manager, so they belong in the inbox at every stage (UAT D-T07-01).
  const registrationItems = checklist.filter((i) => i.bucket === 'statutory');
  for (const eng of engagements) {
    const state = stateFor(eng);
    const items = eng.stage === 'Operational Readiness' ? registrationItems : [...primaryPhaseItems(), ...registrationItems];
    for (const item of items) {
      const slice = state[item.id];
      if (isAwaitingManagerDecision(item.id, slice)) {
        out.push({
          engagementId: eng.id,
          companyName: eng.companyName,
          itemId: item.id,
          slug: eng.slug,
          reviewSource: slice?.reviewSource,
        });
      }
      if (!isDirectFlowStep(item.id) && isClientFillPending(slice?.clientFillRequest)) {
        out.push({
          engagementId: eng.id,
          companyName: eng.companyName,
          itemId: item.id,
          slug: eng.slug,
          clientFill: {
            requestedByName: slice?.clientFillRequest?.requestedByName,
            note: slice?.clientFillRequest?.note,
          },
        });
      }
    }
  }
  return out;
}

export function pendingApprovalKind(row: PendingApprovalRow): string {
  if (row.clientFill) {
    return `Send to client${row.clientFill.requestedByName ? ` · ${row.clientFill.requestedByName}` : ''}`;
  }
  if (row.itemId === MANAGER_APPROVAL_STEP_ID) return 'Board resolution';
  return row.reviewSource === 'lead_manager_request' ? 'Lead request' : 'Client submit';
}
