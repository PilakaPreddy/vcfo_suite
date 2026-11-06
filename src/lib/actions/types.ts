import type { z } from 'zod';
import type { AppRole, AuthContext } from '@/auth/guards';
import type { ChangesetDraft, JsonValue, RowCheck } from '@/lib/ask/changeset/types';

/**
 * One definition per action, used by the chat and, as routes move over, by the route too.
 *
 *   T0 Read     looks only; runs on its own.
 *   T1 Draft    private and reversible; runs on its own with undo.
 *   T2 Record   changes shared business data; a person approves the changeset.
 *   T3 Outward  others see it or it is hard to undo; a person confirms each one with exact recipients.
 *   T4 Legal    regulatory or financial effect (MCA submit, DSC signing, finalising resolutions,
 *               payments, role changes); the agent may only prepare, and never executes one.
 */
export const ACTION_TIERS = ['T0', 'T1', 'T2', 'T3', 'T4'] as const;
export type ActionTier = (typeof ACTION_TIERS)[number];

export interface ActionContext {
  /** Every action runs as the signed-in person, never as a system account. */
  auth: AuthContext;
  /** The client this run is locked to. */
  engagementId: string | null;
  conversationId: string | null;
  runId: string | null;
  now: Date;
  via: 'ask' | 'route';
}

export type ActionResult =
  | { ok: true; summary: string; href?: string; undo?: JsonValue }
  | { ok: false; error: string };

export interface ActionRecheck {
  checks: RowCheck[];
  heldReason: string | null;
  canApply: boolean;
  /** The current saved value and how the new one is stored and shown, for the card. */
  oldValue: string;
  value: string;
  displayOld: string;
  displayNew: string;
  sensitive: boolean;
}

export interface Action<Input = unknown> {
  /** `<area>.<verb>`; the prefix must match the area folder that exports it. */
  name: string;
  /** What the model reads to choose this action. */
  description: string;
  /** Sent to the model as a strict tool schema; every input is parsed with it again at execution. */
  input: z.ZodType<Input>;
  tier: ActionTier;
  /** Filtered in code before tool selection, so the model never sees a forbidden action. */
  roles: readonly AppRole[];
  /** Kept loaded for tool search; the rest are deferred. */
  common?: boolean;
  examples?: readonly Input[];
  /** Null for T0 and T1, which have nothing to review. Reads only; it never writes. */
  preview(actx: ActionContext, input: Input): Promise<ChangesetDraft | null>;
  /**
   * Checks one proposed row against the saved record as it stands now: when it is edited and again
   * at the click. Actions with nothing beyond input parsing to recheck leave it out.
   */
  recheck?(actx: ActionContext, input: Input, pending: Readonly<Record<string, string>>): Promise<ActionRecheck>;
  /** Runs the same rule code as the screen, then writes through repositories. */
  execute(actx: ActionContext, input: Input): Promise<ActionResult>;
  undo?(actx: ActionContext, undo: JsonValue): Promise<ActionResult>;
}

/** The registry holds actions of many input types; each one parses its own input first. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAction = Action<any>;

/** Keeps the input type inferred from the zod schema at the definition site. */
export function defineAction<Input>(action: Action<Input>): Action<Input> {
  return action;
}

/** T4 stops here: nothing the agent runs may execute a legal or financial action. */
export function agentMayExecute(tier: ActionTier): boolean {
  return tier !== 'T4';
}

/** T2 and T3 go through a changeset and a person's approval; T0 and T1 do not. */
export function needsApproval(tier: ActionTier): boolean {
  return tier === 'T2' || tier === 'T3';
}
