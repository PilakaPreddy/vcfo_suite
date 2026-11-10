import { allSubAgents, type AssistSubAgent, type AssistSubAgentStatus } from '@/lib/assist-agents/catalog';

/**
 * Which VCFO Assist sub-agents can fill the portal form for a checklist step. Pure, so the step
 * page and its test share it. Several sub-agents can share a step (SPICe+ Part B and its linked
 * forms all sit on pre-10); the first one in catalog order leads the hint.
 */
export interface AssistStepHint {
  lead: AssistSubAgent;
  others: AssistSubAgent[];
  /** The best status among them: beta when any has a recipe, otherwise later. */
  status: AssistSubAgentStatus;
}

const RANK: Record<AssistSubAgentStatus, number> = { ready: 0, beta: 1, later: 2 };

export function assistHintForStep(stepId: string | null | undefined): AssistStepHint | null {
  if (!stepId) return null;
  const matches = allSubAgents().filter((s) => s.stepId === stepId);
  if (matches.length === 0) return null;
  const [lead, ...others] = matches;
  const status = matches.reduce<AssistSubAgentStatus>((best, s) => (RANK[s.status] < RANK[best] ? s.status : best), 'later');
  return { lead, others, status };
}

export const ASSIST_STATUS_LABEL: Record<AssistSubAgentStatus, string> = {
  ready: 'Ready',
  beta: 'Beta',
  later: 'Coming later',
};
