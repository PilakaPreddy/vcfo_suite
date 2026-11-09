import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { stateByCode } from '@/data/labour-registers/states';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  claimAskChangeset,
  getAskChangesetForDecision,
  rowNeedsManager,
  setAskChangesetStatus,
  updateAskChangesetRows,
  type AskChangesetRowRow,
  type ChangesetAccess,
} from '@/db/repositories/ask-changesets';
import { responseKey } from '@/lib/actions/checklist/rules';
import { getAction } from '@/lib/actions/registry';
import { agentMayExecute, type ActionContext, type AnyAction } from '@/lib/actions/types';
import { askFlags } from '@/lib/ask/config';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import { changesetHash } from './hash';
import type { JsonValue } from './types';

/**
 * Approval and undo. Nothing here is reachable by a model: these run only from a person's click on
 * the card, through the changeset routes. At the click, code re-parses each row, runs the same rules
 * again against the saved record, compares the content hash and only then calls the action, as the
 * person who clicked.
 */
export class ChangesetRefused extends Error {
  constructor(
    message: string,
    readonly status: number = 409,
  ) {
    super(message);
    this.name = 'ChangesetRefused';
  }
}

const OPEN: readonly string[] = ['proposed', 'partly_applied'];
const OPEN_ROW: ReadonlySet<string> = new Set(['proposed', 'edited', 'accepted', 'held', 'failed']);

export function canDecideRow(found: Pick<ChangesetAccess, 'owner' | 'manager'>, row: Pick<AskChangesetRowRow, 'target'>): boolean {
  return rowNeedsManager(row) ? found.manager : found.owner;
}

function actionContext(ctx: AuthContext, found: ChangesetAccess, now: Date): ActionContext {
  return { auth: ctx, engagementId: found.changeset.engagementId, conversationId: found.changeset.conversationId, runId: found.changeset.runId, now, via: 'ask' };
}

async function loadOpen(ctx: AuthContext, id: string, now: Date): Promise<ChangesetAccess> {
  const found = await getAskChangesetForDecision(ctx, id);
  if (!found) throw new ChangesetRefused('This card is not available.', 404);
  if (!OPEN.includes(found.changeset.status)) throw new ChangesetRefused('This card has already been decided.');
  if (found.changeset.expiresAt <= now) {
    await setAskChangesetStatus(ctx, found, 'expired');
    throw new ChangesetRefused('This card has expired. Please send the details again.');
  }
  return found;
}

const inputOf = (row: AskChangesetRowRow) => ({ ...row.target, value: row.newValue });

/** Runs every still-open row's rules again, in order, with earlier rows' answers counted. */
async function recheckRows(actx: ActionContext, rows: readonly AskChangesetRowRow[]) {
  const pending: Record<string, string> = {};
  const updates: Parameters<typeof updateAskChangesetRows>[2][number][] = [];
  for (const row of rows) {
    if (row.status === 'applied' || row.status === 'undone' || row.status === 'skipped') continue;
    const action = await getAction(row.action);
    const parsed = action?.input.safeParse(inputOf(row));
    if (!action?.recheck || !parsed?.success) continue;
    const checked = await action.recheck(actx, parsed.data, pending);
    updates.push({
      id: row.id,
      patch: {
        checks: checked.checks,
        heldReason: checked.heldReason,
        status: checked.heldReason ? 'held' : row.status === 'held' ? 'proposed' : row.status,
        oldValue: checked.oldValue,
        // A file named with an identity number shows it masked, as the drop's first preview did.
        displayOld: maskIdentityNumbers(checked.displayOld),
        displayNew: maskIdentityNumbers(checked.displayNew),
      },
    });
    const value = typeof row.newValue === 'string' ? row.newValue : '';
    const key = keyOf(row);
    if (value && key) pending[key] = value;
  }
  return updates;
}

function keyOf(row: AskChangesetRowRow): string | null {
  const { group, entryId, fieldId } = row.target;
  return typeof fieldId === 'string' ? responseKey({ fieldId, group: group as string | undefined, entryId: entryId as string | undefined }) : null;
}

/**
 * A person's correction to one row. It is a server call of its own, so the value is checked and the
 * hash recomputed before the card can show it. A sensitive value is typed in full and shown masked.
 */
/**
 * The actions whose value a person may change on the card. Only a checklist answer is a value; every
 * file row (a checklist upload, a labour sheet, compliance evidence, a vault file) carries a file
 * that cannot be retyped, so it is accepted or left, never edited. The card and the edit route both
 * use this, so a hand-made request cannot edit what the card does not offer.
 */
const VALUE_EDIT_ACTIONS: ReadonlySet<string> = new Set(['checklist.setResponse']);

/**
 * The one part of a file row a person may change: a labour sheet's state, which the drop may have
 * assumed from the registered office or read from a folder name (owner decision 7). The edit's value
 * is the state code; the file, slot and month stay as they are.
 */
const STATE_EDIT_ACTIONS: ReadonlySet<string> = new Set(['labour.uploadSheet']);

export function rowValueEditable(action: string): boolean {
  return VALUE_EDIT_ACTIONS.has(action);
}

export function rowStateEditable(action: string): boolean {
  return STATE_EDIT_ACTIONS.has(action);
}

/** Whether the card offers "Edit" on this row at all. */
export function rowEditable(action: string): boolean {
  return rowValueEditable(action) || rowStateEditable(action);
}

/** A labour row moved to another state: its target changes, the assumed flags go, and every row is checked again. */
async function editRowState(ctx: AuthContext, found: ChangesetAccess, row: AskChangesetRowRow, value: string, now: Date): Promise<void> {
  const code = value.trim().toUpperCase();
  if (!stateByCode(code)) throw new ChangesetRefused('Choose a state from the list.', 400);
  const { stateAssumed: _assumed, stateNew: _new, ...rest } = row.target;
  const target = { ...rest, stateCode: code };
  const actx = actionContext(ctx, found, now);
  const action = await getAction(row.action);
  if (!action?.recheck || !action.input.safeParse({ ...target, value: row.newValue }).success) throw new ChangesetRefused('This state cannot be used.', 400);
  const edited = found.rows.map((r) => (r.id === row.id ? { ...r, target, status: 'edited' } : r));
  const updates = await recheckRows(actx, edited);
  await updateAskChangesetRows(
    ctx,
    found,
    updates.map((update) => (update.id === row.id ? { ...update, patch: { ...update.patch, target } } : update)),
    changesetHash(edited.map((r) => ({ action: r.action, target: r.target, newValue: r.newValue as JsonValue }))),
  );
}

export async function editChangesetRow(ctx: AuthContext, id: string, rowId: string, value: string): Promise<void> {
  const now = new Date();
  const found = await loadOpen(ctx, id, now);
  const row = found.rows.find((r) => r.id === rowId);
  if (!row || !canDecideRow(found, row)) throw new ChangesetRefused('This row is not yours to change.', 403);
  if (!rowEditable(row.action) || row.status === 'applied') throw new ChangesetRefused('This row cannot be edited.');
  if (rowStateEditable(row.action)) return editRowState(ctx, found, row, value, now);
  const actx = actionContext(ctx, found, now);
  const action = await getAction(row.action);
  const parsed = action?.input.safeParse({ ...row.target, value });
  if (!action?.recheck || !parsed?.success) throw new ChangesetRefused('This value cannot be used.', 400);
  // The stored value takes the shape the screen stores: a date as YYYY-MM-DD, a PAN in capitals.
  const checked = await action.recheck(actx, parsed.data, {});
  const edited = found.rows.map((r) => (r.id === rowId ? { ...r, newValue: checked.value as JsonValue, status: 'edited' } : r));
  const updates = await recheckRows(actx, edited);
  await updateAskChangesetRows(
    ctx,
    found,
    updates.map((update) => (update.id === rowId ? { ...update, patch: { ...update.patch, newValue: checked.value } } : update)),
    changesetHash(edited.map((r) => ({ action: r.action, target: r.target, newValue: r.newValue as JsonValue }))),
  );
}

export interface DecisionResult {
  applied: number;
  failed: number;
  held: number;
}

/** The approval. `accept` lists the rows this person accepted; a row not listed stays open. */
export async function decideChangeset(ctx: AuthContext, id: string, input: { contentHash: string; accept: readonly string[] }): Promise<DecisionResult> {
  const now = new Date();
  const found = await loadOpen(ctx, id, now);
  const current = changesetHash(found.rows.map((r) => ({ action: r.action, target: r.target, newValue: r.newValue as JsonValue })));
  if (current !== input.contentHash || current !== found.changeset.contentHash) {
    throw new ChangesetRefused('This card changed after you saw it. Please look at it again.');
  }
  const wanted = found.rows.filter((row) => input.accept.includes(row.id) && OPEN_ROW.has(row.status));
  if (wanted.some((row) => !canDecideRow(found, row))) throw new ChangesetRefused('One of these rows needs the manager to approve it.', 403);
  if (wanted.length === 0) throw new ChangesetRefused('Accept at least one row first.', 400);
  if (!(await claimAskChangeset(ctx, found, input.contentHash, now))) {
    throw new ChangesetRefused('This card has already been decided, or it changed.');
  }

  const actx = actionContext(ctx, found, now);
  const result: DecisionResult = { applied: 0, failed: 0, held: 0 };
  const statusById = new Map(found.rows.map((row) => [row.id, row.status]));
  const fields: string[] = [];
  for (const row of wanted) {
    const outcome = await applyRow(actx, row);
    await updateAskChangesetRows(ctx, found, [{ id: row.id, patch: outcome.patch }]);
    statusById.set(row.id, outcome.patch.status!);
    if (outcome.patch.status === 'applied') {
      result.applied += 1;
      fields.push(typeof row.target.fieldId === 'string' ? `${String(row.target.stepId)}/${row.target.fieldId}` : `${row.action}:${row.label}`);
    } else if (outcome.patch.status === 'held') result.held += 1;
    else result.failed += 1;
  }

  const remaining = [...statusById.values()].some((status) => OPEN_ROW.has(status) || status === 'failed');
  const status = result.applied === 0 ? (found.changeset.status === 'proposed' ? 'proposed' : 'partly_applied') : remaining ? 'partly_applied' : 'applied';
  await setAskChangesetStatus(ctx, found, status, result.applied > 0 ? { appliedAt: now } : {});
  if (found.changeset.engagementId && result.applied > 0) {
    await recordAuditEvent(ctx, {
      engagementId: found.changeset.engagementId,
      action: 'ask.changeset.applied',
      summary: `Applied ${result.applied} change${result.applied === 1 ? '' : 's'} from an Ask VCFO card`,
      metadata: { via: 'ask', changesetId: id, runId: found.changeset.runId, fields },
      result: 'ok',
    });
  }
  return result;
}

async function loadAction(row: AskChangesetRowRow): Promise<AnyAction | null> {
  const action = await getAction(row.action);
  return action && agentMayExecute(action.tier) && !askFlags().killedTiers.has(action.tier) ? action : null;
}

async function applyRow(actx: ActionContext, row: AskChangesetRowRow): Promise<{ patch: Parameters<typeof updateAskChangesetRows>[2][number]['patch'] }> {
  const failed = (error: string) => ({ patch: { status: 'failed', error } });
  const action = await loadAction(row);
  if (!action) return failed('This action is switched off.');
  const parsed = action.input.safeParse(inputOf(row));
  if (!parsed.success) return failed('This row no longer reads as a valid change.');
  if (action.recheck) {
    const checked = await action.recheck(actx, parsed.data, {});
    if (!checked.canApply) {
      return { patch: { status: 'held', checks: checked.checks, heldReason: checked.heldReason ?? checked.checks.find((c) => !c.ok)?.message ?? 'A check failed.' } };
    }
  }
  try {
    const outcome = await action.execute(actx, parsed.data);
    if (outcome.ok === false) return failed(outcome.error);
    return { patch: { status: 'applied', error: null, heldReason: null, appliedAt: actx.now, undoData: outcome.undo ?? null } };
  } catch (error) {
    console.error('[ask-vcfo] changeset row failed', error);
    return failed('This row could not be saved.');
  }
}

export async function rejectChangeset(ctx: AuthContext, id: string): Promise<void> {
  const now = new Date();
  const found = await loadOpen(ctx, id, now);
  if (!found.owner && !found.manager) throw new ChangesetRefused('This card is not yours to decide.', 403);
  await setAskChangesetStatus(ctx, found, found.rows.some((r) => r.status === 'applied') ? 'partly_applied' : 'rejected', { decidedAt: now });
}

/** Puts back what the card saved, newest first. A value changed since then is left as it is. */
export async function undoChangeset(ctx: AuthContext, id: string): Promise<{ undone: number; kept: string[] }> {
  const now = new Date();
  const found = await getAskChangesetForDecision(ctx, id);
  if (!found) throw new ChangesetRefused('This card is not available.', 404);
  if (!found.owner && found.changeset.decidedById !== ctx.userId) throw new ChangesetRefused('Only the person who saved this can undo it.', 403);
  const actx = actionContext(ctx, found, now);
  const kept: string[] = [];
  let undone = 0;
  for (const row of [...found.rows].reverse()) {
    if (row.status !== 'applied' || row.undoData == null) continue;
    const action = await getAction(row.action);
    const outcome = action?.undo ? await action.undo(actx, row.undoData) : { ok: false as const, error: 'This row cannot be undone.' };
    if (outcome.ok === true) {
      undone += 1;
      await updateAskChangesetRows(ctx, found, [{ id: row.id, patch: { status: 'undone' } }]);
    } else {
      kept.push(`${row.label}: ${outcome.error}`);
      await updateAskChangesetRows(ctx, found, [{ id: row.id, patch: { error: outcome.error } }]);
    }
  }
  if (undone === 0 && kept.length === 0) throw new ChangesetRefused('Nothing on this card has been saved.');
  if (kept.length === 0) await setAskChangesetStatus(ctx, found, 'undone', { undoneAt: now });
  if (found.changeset.engagementId && undone > 0) {
    await recordAuditEvent(ctx, {
      engagementId: found.changeset.engagementId,
      action: 'ask.changeset.undone',
      summary: `Undid ${undone} value${undone === 1 ? '' : 's'} saved from an Ask VCFO card`,
      metadata: { via: 'ask', changesetId: id, runId: found.changeset.runId },
      result: 'ok',
    });
  }
  return { undone, kept };
}
