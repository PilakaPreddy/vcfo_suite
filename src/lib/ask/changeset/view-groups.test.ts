import { describe, expect, it } from 'vitest';
import type { ChangesetRowView } from './view-types';
import { groupChangesetRows, groupKindOf, rowPlace, shortPeriod } from './view-groups';

const attachment = (fileName: string) => ({ kind: 'attachment' as const, attachmentId: 'a', fileName });

function viewRow(id: string, input: Parameters<typeof rowPlace>[0], patch: Partial<ChangesetRowView> = {}) {
  const place = rowPlace(input, (slot) => (slot === 'paysheet' ? 'Paysheet' : slot));
  return { id, status: 'proposed' as const, heldReason: null, canAccept: true, groupKey: place.groupKey, groupTitle: place.groupTitle, groupKind: place.kind, sourceFile: place.sourceFile, ...patch };
}

const labour = (stateCode: string, periodFrom: string, periodTo: string, extra: Record<string, string | boolean> = {}) => ({
  action: 'labour.uploadSheet',
  target: { engagementId: 'e', stateCode, periodFrom, periodTo, slot: 'paysheet', attachmentId: 'a', ...extra },
  label: 'Paysheet · August 2026',
  source: attachment('aug-pay.xlsx'),
});

describe('groupKindOf', () => {
  it('reads the section from the action name, and counts unknown actions as values', () => {
    expect(groupKindOf('checklist.setResponse')).toBe('values');
    expect(groupKindOf('checklist.attachFile')).toBe('uploads');
    expect(groupKindOf('labour.uploadSheet')).toBe('labour');
    expect(groupKindOf('compliance.attachEvidence')).toBe('compliance');
    expect(groupKindOf('documents.fileToVault')).toBe('vault');
    expect(groupKindOf('engagement.somethingNew')).toBe('values');
  });
});

describe('rowPlace', () => {
  it('names a labour row by its file, with slot, state and period underneath', () => {
    const place = rowPlace(labour('KA', '2026-08-01', '2026-08-31'), () => 'Paysheet');
    expect(place).toMatchObject({ kind: 'labour', label: 'aug-pay.xlsx', groupTitle: 'Labour register · Karnataka · Aug 2026', stepTitle: 'Paysheet · Karnataka · Aug 2026' });
  });

  it('says when the labour state was assumed', () => {
    expect(rowPlace(labour('KA', '2026-08-01', '2026-08-31', { stateAssumed: true }), () => 'Paysheet').stepTitle).toContain('assumed from the registered office');
  });

  it('shows the vault category and the task deliverable line', () => {
    expect(rowPlace({ action: 'documents.fileToVault', target: { category: 'Contracts' }, label: 'Vault · Contracts', source: attachment('lease.pdf') })).toMatchObject({ label: 'lease.pdf', stepTitle: 'Vault · Contracts', groupTitle: 'Vault' });
    expect(rowPlace({ action: 'compliance.attachEvidence', target: { taskId: 't' }, label: 'Task deliverable', source: attachment('gstr3b.pdf') })).toMatchObject({ label: 'gstr3b.pdf', stepTitle: 'Task deliverable', groupTitle: 'Compliance evidence' });
  });

  it('keeps the field label and step title for checklist rows', () => {
    const place = rowPlace({ action: 'checklist.setResponse', target: { stepId: 'no-such-step', fieldId: 'f' }, label: 'Director first name', source: { kind: 'message' } });
    expect(place).toMatchObject({ kind: 'values', label: 'Director first name', stepTitle: 'no-such-step', sourceFile: null, groupTitle: 'Checklist values' });
  });
});

describe('shortPeriod', () => {
  it('writes one month short and a longer period as a range', () => {
    expect(shortPeriod('2026-08-01', '2026-08-31')).toBe('Aug 2026');
    expect(shortPeriod('2026-04-01', '2026-06-30')).toBe('Apr 2026 to Jun 2026');
  });
});

describe('groupChangesetRows', () => {
  it('orders sections by destination, splits labour by state and month, and gathers rows by file', () => {
    const value = (id: string, file: string | null) =>
      viewRow(id, { action: 'checklist.setResponse', target: { stepId: 's', fieldId: id }, label: id, source: file ? attachment(file) : { kind: 'message' } });
    const rows = [
      viewRow('v1', { action: 'documents.fileToVault', target: { category: 'Other' }, label: '', source: attachment('x.pdf') }),
      value('c1', 'pan.pdf'),
      value('c2', 'aoa.pdf'),
      value('c3', 'pan.pdf'),
      value('c4', null),
      viewRow('l1', labour('TG', '2026-08-01', '2026-08-31')),
      viewRow('l2', labour('KA', '2026-08-01', '2026-08-31')),
      viewRow('l3', labour('KA', '2026-09-01', '2026-09-30'), { status: 'applied', canAccept: false }),
      viewRow('u1', { action: 'checklist.attachFile', target: { stepId: 's', fieldId: 'u' }, label: 'PAN copy', source: attachment('pan.pdf') }, { heldReason: 'Step locked', canAccept: false }),
    ];
    const groups = groupChangesetRows(rows);
    expect(groups.map((g) => g.title)).toEqual([
      'Checklist values',
      'Checklist uploads',
      'Labour register · Karnataka · Aug 2026',
      'Labour register · Karnataka · Sep 2026',
      'Labour register · Telangana · Aug 2026',
      'Vault',
    ]);
    expect(groups[0]).toMatchObject({ kind: 'values', rowIds: ['c4', 'c1', 'c3', 'c2'], counts: { ready: 4, held: 0, applied: 0 } });
    expect(groups[1]!.counts).toEqual({ ready: 0, held: 1, applied: 0 });
    expect(groups[3]!.counts).toEqual({ ready: 0, held: 0, applied: 1 });
    expect(groups.flatMap((g) => g.rowIds).sort()).toEqual(rows.map((r) => r.id).sort());
  });
});
