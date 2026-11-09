import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import { changesetHash } from './hash';

/**
 * The approval rules, with the repository and the registry replaced. What must hold: nothing runs
 * unless the hash matches and the claim succeeds, the checks run again at the click, only the right
 * person decides, and a T4 action never executes from a card.
 */

const lead: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern' };
const manager: AuthContext = { userId: 'mgr-1', email: 'm@x.test', name: 'Manager', role: 'manager' };

const execute = vi.fn();
const recheck = vi.fn();
const undo = vi.fn();
const action = { name: 'checklist.setResponse', tier: 'T2', input: z.object({ stepId: z.string(), fieldId: z.string(), value: z.string() }).passthrough(), recheck, execute, undo };
const actions: Record<string, unknown> = { 'checklist.setResponse': action };
vi.mock('@/lib/actions/registry', () => ({ getAction: async (name: string) => actions[name] ?? null }));

const claim = vi.fn();
const setStatus = vi.fn();
const updateRows = vi.fn();
let found: unknown = null;
vi.mock('@/db/repositories/ask-changesets', () => ({
  getAskChangesetForDecision: vi.fn(async () => found),
  claimAskChangeset: (...a: unknown[]) => claim(...a),
  setAskChangesetStatus: (...a: unknown[]) => setStatus(...a),
  updateAskChangesetRows: (...a: unknown[]) => updateRows(...a),
  rowNeedsManager: (row: { target: { needsManager?: boolean } }) => row.target.needsManager === true,
}));
const audit = vi.fn();
vi.mock('@/db/repositories/audit-events', () => ({ recordAuditEvent: (...a: unknown[]) => audit(...a) }));

const { ChangesetRefused, decideChangeset, editChangesetRow, undoChangeset } = await import('./apply');

const makeRow = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  action: 'checklist.setResponse',
  target: { stepId: 'pre-15', fieldId: id },
  newValue: `value-${id}`,
  label: id,
  status: 'proposed',
  undoData: null,
  ...patch,
});

function setCard(rows: ReturnType<typeof makeRow>[], extra: Record<string, unknown> = {}) {
  const contentHash = changesetHash(rows.map((r) => ({ action: r.action, target: r.target as never, newValue: r.newValue as never })));
  found = {
    changeset: { id: 'cs-1', status: 'proposed', contentHash, expiresAt: new Date(Date.now() + 86_400_000), engagementId: 'eng-1', conversationId: null, runId: 'run-1', decidedById: null },
    rows,
    companyName: 'Acme',
    viewerId: 'lead-1',
    owner: true,
    manager: false,
    ...extra,
  };
  return contentHash;
}

const passes = { checks: [{ rule: 'gate', ok: true }], heldReason: null, canApply: true, oldValue: '', value: 'v', displayOld: '', displayNew: 'v', sensitive: false };

beforeEach(() => {
  vi.clearAllMocks();
  actions['checklist.setResponse'] = action;
  action.tier = 'T2';
  claim.mockResolvedValue(true);
  recheck.mockResolvedValue(passes);
  execute.mockResolvedValue({ ok: true, summary: 'saved', undo: { previous: '' } });
  undo.mockResolvedValue({ ok: true, summary: 'undone' });
});

describe('decideChangeset', () => {
  it('saves the accepted rows only, as the person who clicked, with audit', async () => {
    const hash = setCard([makeRow('a'), makeRow('b')]);
    const result = await decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] });
    expect(result).toEqual({ applied: 1, failed: 0, held: 0 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toMatchObject({ auth: lead, via: 'ask', runId: 'run-1' });
    expect(setStatus.mock.calls[0]![2]).toBe('partly_applied');
    expect(audit.mock.calls[0]![1]).toMatchObject({ action: 'ask.changeset.applied', metadata: { via: 'ask', changesetId: 'cs-1', runId: 'run-1' } });
    // The audit line names fields, never values.
    expect(JSON.stringify(audit.mock.calls[0]![1])).not.toContain('value-a');
  });

  it('refuses a hash that does not match what was shown, before anything runs', async () => {
    setCard([makeRow('a')]);
    await expect(decideChangeset(lead, 'cs-1', { contentHash: 'f'.repeat(64), accept: ['a'] })).rejects.toBeInstanceOf(ChangesetRefused);
    expect(claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses when a stored value no longer matches the stored hash', async () => {
    const hash = setCard([makeRow('a')]);
    (found as { rows: Array<{ newValue: string }> }).rows[0]!.newValue = 'tampered';
    await expect(decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] })).rejects.toBeInstanceOf(ChangesetRefused);
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs nothing when another click already claimed the card', async () => {
    const hash = setCard([makeRow('a')]);
    claim.mockResolvedValue(false);
    await expect(decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] })).rejects.toThrow(/already been decided/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('checks again at the click: a step locked since the proposal holds the row', async () => {
    const hash = setCard([makeRow('a')]);
    recheck.mockResolvedValue({ ...passes, canApply: false, heldReason: 'Held: the step closed.', checks: [{ rule: 'gate', ok: false, message: 'Held: the step closed.' }] });
    const result = await decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] });
    expect(result.held).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(updateRows.mock.calls[0]![2][0].patch).toMatchObject({ status: 'held', heldReason: 'Held: the step closed.' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses an expired card', async () => {
    const hash = setCard([makeRow('a')]);
    (found as { changeset: { expiresAt: Date } }).changeset.expiresAt = new Date(Date.now() - 1000);
    await expect(decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] })).rejects.toThrow(/expired/);
    expect(setStatus.mock.calls[0]![2]).toBe('expired');
  });

  it('refuses a card already decided', async () => {
    const hash = setCard([makeRow('a', { status: 'applied' })]);
    (found as { changeset: { status: string } }).changeset.status = 'applied';
    await expect(decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] })).rejects.toThrow(/already been decided/);
  });

  it('leaves a manager-only row to the manager, even from the lead who prepared the card', async () => {
    const hash = setCard([makeRow('a', { target: { stepId: 'pre-2', fieldId: 'a', needsManager: true } })]);
    await expect(decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] })).rejects.toThrow(/manager/);
    expect(execute).not.toHaveBeenCalled();
    (found as { owner: boolean; manager: boolean; viewerId: string }).owner = false;
    (found as { owner: boolean; manager: boolean; viewerId: string }).manager = true;
    await decideChangeset(manager, 'cs-1', { contentHash: hash, accept: ['a'] });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0].auth).toBe(manager);
  });

  it('refuses a person who is neither owner nor manager on the card', async () => {
    found = null;
    await expect(decideChangeset(lead, 'cs-1', { contentHash: 'x'.repeat(64), accept: ['a'] })).rejects.toMatchObject({ status: 404 });
  });

  it('never executes a T4 action from a card', async () => {
    action.tier = 'T4';
    const hash = setCard([makeRow('a')]);
    const result = await decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a'] });
    expect(result.failed).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('keeps going past one failed row and reports it', async () => {
    const hash = setCard([makeRow('a'), makeRow('b')]);
    execute.mockResolvedValueOnce({ ok: false, error: 'No' }).mockResolvedValueOnce({ ok: true, summary: 'saved' });
    const result = await decideChangeset(lead, 'cs-1', { contentHash: hash, accept: ['a', 'b'] });
    expect(result).toEqual({ applied: 1, failed: 1, held: 0 });
    expect(setStatus.mock.calls[0]![2]).toBe('partly_applied');
  });
});

describe('editChangesetRow', () => {
  it('stores the checked shape, recomputes the hash and saves nothing to the step', async () => {
    setCard([makeRow('a')]);
    recheck.mockResolvedValue({ ...passes, value: 'ABCDE1234F' });
    await editChangesetRow(lead, 'cs-1', 'a', 'abcde1234f');
    expect(execute).not.toHaveBeenCalled();
    const [, , updates, hash] = updateRows.mock.calls[0]!;
    expect(updates[0].patch.newValue).toBe('ABCDE1234F');
    expect(hash).toBe(changesetHash([{ action: 'checklist.setResponse', target: { stepId: 'pre-15', fieldId: 'a' }, newValue: 'ABCDE1234F' }]));
  });

  it('refuses an edit of a row that is not yours', async () => {
    setCard([makeRow('a', { target: { stepId: 'pre-2', fieldId: 'a', needsManager: true } })]);
    await expect(editChangesetRow(lead, 'cs-1', 'a', 'x')).rejects.toMatchObject({ status: 403 });
  });

  it.each(['checklist.attachFile', 'compliance.attachEvidence', 'documents.fileToVault'])(
    'refuses to edit a file row (%s), which carries a file rather than a typed value',
    async (action) => {
      setCard([makeRow('a', { action })]);
      await expect(editChangesetRow(lead, 'cs-1', 'a', 'other.pdf')).rejects.toThrow('This row cannot be edited.');
      expect(updateRows).not.toHaveBeenCalled();
    },
  );

  describe('a labour sheet\'s state', () => {
    const labourTarget = { engagementId: 'eng-1', stateCode: 'MH', periodFrom: '2026-08-01', periodTo: '2026-08-31', slot: 'paysheet', attachmentId: 'att-1', stateAssumed: true };
    beforeEach(() => {
      actions['labour.uploadSheet'] = { ...action, name: 'labour.uploadSheet', input: z.object({ stateCode: z.string(), value: z.string() }).passthrough() };
    });

    it('moves the row to the chosen state, drops the assumed flag and recomputes the hash', async () => {
      setCard([makeRow('a', { action: 'labour.uploadSheet', target: labourTarget, newValue: 'pay.xlsx' })]);
      await editChangesetRow(lead, 'cs-1', 'a', 'ka');
      const [, , updates, hash] = updateRows.mock.calls[0]!;
      const { stateAssumed: _a, ...rest } = labourTarget;
      expect(updates[0].patch.target).toEqual({ ...rest, stateCode: 'KA' });
      expect(updates[0].patch.status).toBe('edited');
      expect(hash).toBe(changesetHash([{ action: 'labour.uploadSheet', target: { ...rest, stateCode: 'KA' }, newValue: 'pay.xlsx' }]));
      expect(recheck.mock.calls[0]![1]).toMatchObject({ stateCode: 'KA', value: 'pay.xlsx' });
    });

    it('refuses a state that is not on the list', async () => {
      setCard([makeRow('a', { action: 'labour.uploadSheet', target: labourTarget, newValue: 'pay.xlsx' })]);
      await expect(editChangesetRow(lead, 'cs-1', 'a', 'Atlantis')).rejects.toMatchObject({ status: 400 });
      expect(updateRows).not.toHaveBeenCalled();
    });
  });

  it('releases a later row once the answer it waits for is given', async () => {
    setCard([makeRow('parent', { newValue: '' }), makeRow('child', { status: 'held' })]);
    recheck.mockImplementation(async (_a, input, pending) => {
      const released = input.fieldId !== 'child' || pending.parent === 'yes';
      return { ...passes, value: input.value, heldReason: released ? null : 'Held', canApply: released };
    });
    await editChangesetRow(lead, 'cs-1', 'parent', 'yes');
    const child = updateRows.mock.calls[0]![2].find((u: { id: string }) => u.id === 'child');
    expect(child.patch).toMatchObject({ status: 'proposed', heldReason: null });
  });
});

describe('undoChangeset', () => {
  it('undoes newest first and reports a value changed since', async () => {
    setCard([makeRow('a', { status: 'applied', undoData: { n: 1 } }), makeRow('b', { status: 'applied', undoData: { n: 2 } })]);
    undo.mockResolvedValueOnce({ ok: false, error: 'Changed since.' }).mockResolvedValueOnce({ ok: true, summary: 'done' });
    const result = await undoChangeset(lead, 'cs-1');
    expect(undo.mock.calls[0]![1]).toEqual({ n: 2 });
    expect(result).toEqual({ undone: 1, kept: ['b: Changed since.'] });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('marks the card undone when everything came back, with audit', async () => {
    setCard([makeRow('a', { status: 'applied', undoData: { n: 1 } })]);
    await undoChangeset(lead, 'cs-1');
    expect(setStatus.mock.calls[0]![2]).toBe('undone');
    expect(audit.mock.calls[0]![1]).toMatchObject({ action: 'ask.changeset.undone' });
  });

  it('refuses someone who neither prepared nor saved it', async () => {
    setCard([makeRow('a', { status: 'applied', undoData: {} })], { owner: false, manager: true });
    await expect(undoChangeset(manager, 'cs-1')).rejects.toMatchObject({ status: 403 });
  });
});
