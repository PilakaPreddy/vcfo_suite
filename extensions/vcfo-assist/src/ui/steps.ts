/** The run checklist the panel shows: one line per state, with who does it. Pure, so it is tested. */
import type { Run, RunState } from '../shared/types';

export type Actor = 'agent' | 'you';
export type StepStatus = 'done' | 'current' | 'todo' | 'failed';

export const STEPS: ReadonlyArray<{ state: RunState; label: string; actor: Actor }> = [
  { state: 'PULL_PROFILE', label: 'Pull the client profile from Suite', actor: 'agent' },
  { state: 'WAIT_LOGIN', label: 'Log in to the portal', actor: 'you' },
  { state: 'FILL', label: 'Fill the form', actor: 'agent' },
  { state: 'CHECK', label: 'Check the form', actor: 'agent' },
  { state: 'DOWNLOAD', label: 'Download the PDF', actor: 'agent' },
  { state: 'WAIT_DSC', label: 'Sign with your DSC and drop the PDF', actor: 'you' },
  { state: 'ATTACH', label: 'Attach the signed PDF', actor: 'agent' },
  { state: 'RECHECK', label: 'Check the form again', actor: 'agent' },
  { state: 'WAIT_SUBMIT_PAY', label: 'Click Submit and pay the fee', actor: 'you' },
  { state: 'READ_SRN', label: 'Read the SRN', actor: 'agent' },
  { state: 'WRITE_BACK', label: 'Write the SRN back to Suite', actor: 'agent' },
];

const ORDER = STEPS.map((s) => s.state);

/** The last live state the run was in (the state it failed or was cancelled from). */
export function lastLiveState(run: Run): RunState | null {
  if (run.state !== 'FAILED' && run.state !== 'CANCELLED') return run.state;
  const moves = run.log.filter((l) => l.kind === 'transition');
  const last = moves[moves.length - 1];
  const from = last?.text.split(' → ')[0] as RunState | undefined;
  return from ?? null;
}

export function stepStatus(run: Run, state: RunState): StepStatus {
  if (run.state === 'DONE') return 'done';
  const at = lastLiveState(run);
  const i = ORDER.indexOf(state);
  const j = at ? ORDER.indexOf(at) : -1;
  if (j < 0) return 'todo';
  if (i < j) return 'done';
  if (i > j) return 'todo';
  return run.state === 'FAILED' || run.state === 'CANCELLED' ? 'failed' : 'current';
}

/** Haiku 4.5 list price (src/lib/ask/provider/pricing.ts): $1 input and $5 output per million tokens.
 * The resolver reports one total, so the meter assumes the usual 90/10 split of a pick-one prompt. */
export function estimateCostUsd(tokens: number): number {
  return (tokens * (0.9 * 1 + 0.1 * 5)) / 1_000_000;
}
