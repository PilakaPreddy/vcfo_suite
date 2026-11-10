/**
 * VCFO Assist agents: shared shapes for the run log, the heal ladder and the patch queue. Pure
 * types and word lists, so the schema, the repositories, the routes and the page share them.
 * Nothing here carries a profile value: heals and evidence name fields and labels only.
 */

export const ASSIST_AGENT_RUN_STATUSES = ['running', 'waiting_user', 'done', 'failed', 'cancelled'] as const;
export type AssistAgentRunStatus = (typeof ASSIST_AGENT_RUN_STATUSES)[number];

/** A run in one of these is closed: it takes no more progress and keeps its `finishedAt`. */
export const ASSIST_AGENT_RUN_CLOSED: ReadonlySet<AssistAgentRunStatus> = new Set(['done', 'failed', 'cancelled']);

/** The heal ladder (PLAN §3). T0 is the recipe itself; T2 is on-device and never reaches Suite. */
export const ASSIST_HEAL_TIERS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
export type AssistHealTier = (typeof ASSIST_HEAL_TIERS)[number];

/** The tiers whose fix becomes a recipe patch proposal. */
export const ASSIST_PATCH_TIERS = ['T1', 'T3', 'T4'] as const;
export type AssistPatchTier = (typeof ASSIST_PATCH_TIERS)[number];

export const ASSIST_PATCH_STATUSES = ['proposed', 'approved', 'rejected'] as const;
export type AssistPatchStatus = (typeof ASSIST_PATCH_STATUSES)[number];

export interface AssistHeal {
  field: string;
  tier: AssistHealTier;
  ok: boolean;
}

/** A guard refusal in the extension (a captcha, OTP or password input; a Submit or Pay button). */
export interface AssistRefusal {
  kind: string;
  /** The field key or the button label; never a value. */
  target?: string;
  at?: string;
}

export interface AssistPatchProposal {
  som?: string;
  css?: string;
  label?: string;
}

/** What the heal saw, labels only. */
export interface AssistPatchEvidence {
  fieldLabel?: string;
  candidateLabels?: string[];
  chosenLabel?: string;
  confidence?: number;
  note?: string;
}

/** One row of the run log as the API and the page see it. */
export interface AssistAgentRunView {
  id: string;
  engagementId: string;
  /** The client company's name, for the staff page; null when the list did not join it. */
  companyName: string | null;
  userId: string;
  userName: string | null;
  agent: string;
  subAgent: string;
  recipeId: string;
  recipeVersion: string;
  status: AssistAgentRunStatus;
  state: string;
  fieldsTotal: number;
  fieldsFilled: number;
  heals: AssistHeal[];
  refusals: AssistRefusal[];
  aiCalls: number;
  aiTokens: number;
  srn: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export interface AssistPatchView {
  id: string;
  recipeId: string;
  recipeVersion: string;
  fieldKey: string;
  proposed: AssistPatchProposal;
  evidence: AssistPatchEvidence;
  sourceTier: AssistPatchTier;
  runId: string | null;
  proposedBy: string | null;
  status: AssistPatchStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
