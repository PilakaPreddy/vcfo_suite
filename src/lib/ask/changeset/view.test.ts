import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/auth/guards';

/**
 * The card view with the repository replaced: every row lands in exactly one destination group, and
 * the new file rows read as files (name, slot, state, period, category) rather than as field labels.
 */

const lead: AuthContext = { userId: 'lead-1', email: 'l@x.test', name: 'Lead', role: 'intern' };
let found: unknown = null;
vi.mock('@/db/repositories/ask-changesets', () => ({ getAskChangesetSummary: vi.fn(async () => found) }));
vi.mock('@/lib/actions/labour/upload-sheet', () => ({ SLOT_LABEL: { paysheet: 'Paysheet', attendance: 'Attendance' } }));
vi.mock('./apply', () => ({
  canDecideRow: () => true,
  rowEditable: (action: string) => action === 'checklist.setResponse' || action === 'labour.uploadSheet',
  rowStateEditable: (action: string) => action === 'labour.uploadSheet',
}));

const { loadChangesetView } = await import('./view');

const base = { displayOld: '', displayNew: 'x', sensitive: false, checks: [{ rule: 'scope', ok: true }], status: 'proposed', heldReason: null, error: null };
const file = (fileName: string) => ({ kind: 'attachment', attachmentId: '00000000-0000-4000-8000-000000000001', fileName });

beforeEach(() => {
  found = {
    owner: true,
    companyName: 'Acme',
    changeset: { id: 'cs-1', title: 'Acme: 3 files, 1 value', tier: 'T2', recipients: [], engagementId: 'e1', status: 'proposed', contentHash: 'h', expiresAt: new Date('2026-12-01T00:00:00Z'), decidedById: null },
    rows: [
      { ...base, id: 'r1', action: 'checklist.setResponse', target: { stepId: 'unknown-step', fieldId: 'f' }, label: 'Director first name', source: { kind: 'message' } },
      { ...base, id: 'r2', action: 'labour.uploadSheet', target: { engagementId: 'e1', stateCode: 'KA', periodFrom: '2026-08-01', periodTo: '2026-08-31', slot: 'attendance', attachmentId: 'a' }, label: 'Attendance · August 2026', source: file('att.xlsx') },
      { ...base, id: 'r3', action: 'documents.fileToVault', target: { engagementId: 'e1', attachmentId: 'a', category: 'Contracts' }, label: 'Vault · Contracts', source: file('lease.pdf') },
      { ...base, id: 'r4', action: 'compliance.attachEvidence', target: { engagementId: 'e1', taskId: 't', attachmentId: 'a' }, label: 'Task deliverable', source: file('gstr3b.pdf'), status: 'applied' },
    ],
  };
});

describe('loadChangesetView', () => {
  it('returns groups by destination with counts, and labels file rows by file', async () => {
    const view = await loadChangesetView(lead, 'cs-1');
    expect(view!.groups.map((g) => [g.title, g.rowIds, g.counts])).toEqual([
      ['Checklist values', ['r1'], { ready: 1, held: 0, applied: 0 }],
      ['Labour register · Karnataka · Aug 2026', ['r2'], { ready: 1, held: 0, applied: 0 }],
      ['Compliance evidence', ['r4'], { ready: 0, held: 0, applied: 1 }],
      ['Vault', ['r3'], { ready: 1, held: 0, applied: 0 }],
    ]);
    const byId = new Map(view!.rows.map((r) => [r.id, r]));
    expect(byId.get('r1')).toMatchObject({ label: 'Director first name', editable: true, groupKind: 'values' });
    expect(byId.get('r2')).toMatchObject({ label: 'att.xlsx', stepTitle: 'Attendance · Karnataka · Aug 2026', editable: true, inputType: 'choice', editValue: 'KA', groupKind: 'labour' });
    // A labour sheet's state is the one thing on a file row the person may change, from the list of states.
    expect(byId.get('r2')!.options).toContainEqual({ value: 'KA', label: 'Karnataka' });
    expect(byId.get('r3')).toMatchObject({ label: 'lease.pdf', stepTitle: 'Vault · Contracts', groupKind: 'vault' });
    expect(view!.canUndo).toBe(true);
  });
});
