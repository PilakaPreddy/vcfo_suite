/**
 * The run state machine (PLAN.md section 2). Explicit and small: a table of allowed moves and one
 * function that makes a move and logs it. No chrome APIs, no I/O.
 *
 * READY → PULL_PROFILE → WAIT_LOGIN → FILL (once per page) → CHECK → DOWNLOAD → WAIT_DSC → ATTACH
 * → RECHECK → WAIT_SUBMIT_PAY → READ_SRN → WRITE_BACK → DONE; any live state may go to FAILED or
 * CANCELLED. The WAIT_* states are human gates: the engine only watches in them and never acts.
 */
import type { LogEntry, Run, RunState } from '../shared/types';

export const TERMINAL: ReadonlySet<RunState> = new Set(['DONE', 'FAILED', 'CANCELLED']);

/** Human gates. No handler in these states clicks or fills anything. */
export const HUMAN_STATES: ReadonlySet<RunState> = new Set(['WAIT_LOGIN', 'WAIT_DSC', 'WAIT_SUBMIT_PAY']);

const NEXT: Readonly<Record<RunState, readonly RunState[]>> = {
  READY: ['PULL_PROFILE'],
  PULL_PROFILE: ['WAIT_LOGIN'],
  WAIT_LOGIN: ['FILL'],
  // FILL → FILL moves to the recipe's next page.
  FILL: ['FILL', 'CHECK'],
  // CHECK → FILL refills the page after the portal reported errors (for example after a reload).
  CHECK: ['DOWNLOAD', 'FILL'],
  DOWNLOAD: ['WAIT_DSC'],
  WAIT_DSC: ['ATTACH'],
  ATTACH: ['RECHECK', 'WAIT_DSC'],
  RECHECK: ['WAIT_SUBMIT_PAY'],
  WAIT_SUBMIT_PAY: ['READ_SRN'],
  READ_SRN: ['WRITE_BACK'],
  WRITE_BACK: ['DONE'],
  DONE: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: RunState, to: RunState): boolean {
  if (TERMINAL.has(from)) return false;
  if (to === 'FAILED' || to === 'CANCELLED') return true;
  return NEXT[from].includes(to);
}

export class IllegalTransition extends Error {
  constructor(from: RunState, to: RunState) {
    super(`illegal transition ${from} → ${to}`);
  }
}

export const MAX_LOG = 400;

export function appendLog(run: Run, kind: LogEntry['kind'], text: string, now: number): Run {
  const log = [...run.log, { t: now, kind, text }];
  return { ...run, log: log.length > MAX_LOG ? log.slice(log.length - MAX_LOG) : log, updatedAt: now };
}

/** Makes one move, clears any wait, and logs "FROM → TO (note)". Throws on a move the table forbids. */
export function transition(run: Run, to: RunState, note: string, now: number): Run {
  if (!canTransition(run.state, to)) throw new IllegalTransition(run.state, to);
  const moved: Run = { ...run, state: to, wait: undefined };
  return appendLog(moved, 'transition', `${run.state} → ${to}${note ? ` (${note})` : ''}`, now);
}

/** The status Suite's `assist_runs.status` column holds. */
export function suiteStatus(run: Run): 'running' | 'waiting_user' | 'done' | 'failed' | 'cancelled' {
  if (run.state === 'DONE') return 'done';
  if (run.state === 'FAILED') return 'failed';
  if (run.state === 'CANCELLED') return 'cancelled';
  return run.wait || HUMAN_STATES.has(run.state) ? 'waiting_user' : 'running';
}
