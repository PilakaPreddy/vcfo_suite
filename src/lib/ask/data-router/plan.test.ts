import { describe, expect, it } from 'vitest';
import { catalogEntry } from '@/lib/ask/field-catalog';
import { getActiveCatalogItems } from '@/data/checklist';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { planRows, type PlacedValue, type PlanInput } from './plan';

/** Every step before `stepId` done, so that step is the open one. */
function openAt(stepId: string, extra: Record<string, ChecklistItemStateSlice> = {}): PlanInput['state'] {
  const items = getActiveCatalogItems();
  const state: Record<string, ChecklistItemStateSlice> = {};
  for (const item of items) {
    if (item.id === stepId) break;
    state[item.id] = { status: 'completed', reviewStatus: 'accepted', responses: {} } as ChecklistItemStateSlice;
  }
  return { ...state, ...extra };
}

const place = (key: string, value: string, person: string | null = 'Asha Rao', page: number | null = 1): PlacedValue => ({
  entry: catalogEntry(key)!,
  value: { label: catalogEntry(key)!.label, value, page, person, confidence: 1 },
  source: { kind: 'attachment', attachmentId: 'file-1', fileName: 'pan.pdf', page: page ?? undefined },
});

const input = (placed: PlacedValue[], state: PlanInput['state'], extra: Partial<PlanInput> = {}): PlanInput => ({
  role: 'intern',
  engagementId: 'eng-acme',
  companyName: 'Acme Robotics',
  engagement: { ownershipType: 'indian' },
  state,
  placed,
  instruction: '',
  ...extra,
});

const target = (row: { target: Record<string, unknown> }) => row.target as { stepId: string; fieldId: string; group?: string; entryId?: string; newEntry?: boolean; needsManager?: boolean };

describe('planRows', () => {
  it('turns a new person into rows on one new entry, nothing saved', () => {
    const { draft } = planRows(input([place('director.name', 'Asha K Rao'), place('director.pan', 'abcde1234f'), place('director.dob', '03/04/1985')], openAt('pre-15')));
    expect(draft.engagementId).toBe('eng-acme');
    const fields = draft.rows.map((r) => target(r).fieldId);
    expect(fields).toEqual(expect.arrayContaining(['firstName', 'middleName', 'lastName', 'panNumber', 'dob']));
    expect(new Set(draft.rows.map((r) => target(r).entryId)).size).toBe(1);
    expect(draft.rows.every((r) => target(r).newEntry === true && target(r).group === 'directors')).toBe(true);
    const pan = draft.rows.find((r) => target(r).fieldId === 'panNumber')!;
    expect(pan.newValue).toBe('ABCDE1234F');
    expect(pan.displayNew).not.toContain('ABCDE');
    expect(pan.sensitive).toBe(true);
    expect(draft.rows.find((r) => target(r).fieldId === 'dob')!.newValue).toBe('1985-04-03');
  });

  it('finds an existing person by PAN, by name, then by number', () => {
    const responses = {
      directors: 'e1,e2',
      'directors.e1.firstName': 'Ravi',
      'directors.e1.lastName': 'Menon',
      'directors.e2.firstName': 'Asha',
      'directors.e2.lastName': 'Rao',
      'directors.e2.panNumber': 'ABCDE1234F',
    };
    const state = openAt('pre-15', { 'pre-15': { responses } as unknown as ChecklistItemStateSlice });
    const byName = planRows(input([place('director.din', '01234567')], state)).draft.rows[0]!;
    expect(target(byName)).toMatchObject({ entryId: 'e2' });
    expect(target(byName).newEntry).toBeUndefined();
    const byPan = planRows(input([place('director.din', '01234567', 'Someone Else'), place('director.pan', 'ABCDE1234F', 'Someone Else')], state)).draft.rows[0]!;
    expect(target(byPan)).toMatchObject({ entryId: 'e2' });
    const byNumber = planRows(input([place('director.din', '01234567', null)], state, { instruction: 'Add this as director 1' })).draft.rows[0]!;
    expect(target(byNumber)).toMatchObject({ entryId: 'e1' });
    expect(byNumber.label).toContain('Director 1');
  });

  it('asks which person when a value has no name and the list already has people', () => {
    const state = openAt('pre-15', { 'pre-15': { responses: { directors: 'e1', 'directors.e1.firstName': 'Ravi' } } as unknown as ChecklistItemStateSlice });
    const plan = planRows(input([place('director.din', '01234567', null)], state));
    expect(plan.draft.rows).toEqual([]);
    expect(plan.questions[0]).toMatch(/Which director/);
    expect(plan.questions[0]).not.toContain('01234567');
  });

  it('never overwrites silently: a saved value that differs is a failed check, an equal one drops the row', () => {
    const state = openAt('pre-15', { 'pre-15': { responses: { directors: 'e1', 'directors.e1.firstName': 'Asha', 'directors.e1.lastName': 'Rao', 'directors.e1.din': '01234567' } } as unknown as ChecklistItemStateSlice });
    const same = planRows(input([place('director.din', '01234567')], state));
    expect(same.draft.rows).toEqual([]);
    const differs = planRows(input([place('director.din', '07654321')], state)).draft.rows[0]!;
    expect(differs.checks).toContainEqual(expect.objectContaining({ rule: 'conflict', ok: false }));
    expect(differs.oldValue).toBe('01234567');
    expect(differs.displayOld).not.toContain('0123');
  });

  it('shows the difference when two documents disagree, and picks neither silently', () => {
    const { draft } = planRows(input([place('director.dob', '03/04/1985'), place('director.dob', '04/04/1985')], openAt('pre-15')));
    expect(draft.rows).toHaveLength(1);
    expect(draft.rows[0]!.checks).toContainEqual(expect.objectContaining({ rule: 'documents_differ', ok: false }));
  });

  it('holds a row on a locked step, with the reason', () => {
    const { draft } = planRows(input([place('director.din', '01234567')], openAt('pre-1')));
    expect(draft.rows[0]!.heldReason).toMatch(/opens after/);
  });

  it('holds a field this role cannot fill, naming who does', () => {
    const entry = catalogEntry('company.proposed_name_1')!;
    const { draft } = planRows(input([{ entry, value: { label: 'Proposed name 1', value: 'Acme', page: null, person: null, confidence: 1 }, source: { kind: 'paste' } }], openAt('pre-1')));
    expect(draft.rows[0]!.heldReason).toMatch(/client fills/);
  });

  it('holds a direct-flow field from a manager, as the screen does', () => {
    const { draft } = planRows(input([place('director.din', '01234567')], openAt('pre-15'), { role: 'manager' }));
    expect(draft.rows[0]!.heldReason).toMatch(/project lead/);
  });

  it('asks for the answer a condition depends on, before the row that needs it', () => {
    const { draft } = planRows(input([place('director.aadhaar', '2345 6789 0123')], openAt('pre-15')));
    expect(target(draft.rows[0]!).fieldId).toBe('indiaResident');
    expect(draft.rows[0]!.newValue).toBe('');
    expect(draft.rows[0]!.checks).toContainEqual(expect.objectContaining({ rule: 'answer', ok: false }));
    expect(target(draft.rows[1]!).fieldId).toBe('aadhaarNumber');
    expect(draft.rows[1]!.heldReason).toMatch(/resident/i);
    expect(draft.rows[1]!.displayNew).not.toContain('2345');
  });

  it('shows a wrong format as a question on the row, with the value masked', () => {
    const { draft } = planRows(input([place('director.pan', 'ABCDE1234')], openAt('pre-15')));
    const pan = draft.rows.find((r) => target(r).fieldId === 'panNumber')!;
    expect(pan.checks).toContainEqual(expect.objectContaining({ rule: 'format', ok: false }));
  });

  it('marks a step only a manager approves', () => {
    const entry = catalogEntry('pre-2.boardResolutionWorkflowNotes')!;
    const { draft } = planRows(input([{ entry, value: { label: entry.label, value: 'Sent to the lead', page: null, person: null, confidence: 1 }, source: { kind: 'paste' } }], openAt('pre-2')));
    expect(target(draft.rows[0]!).needsManager).toBe(true);
  });

  it('never carries another engagement into a row', () => {
    const { draft } = planRows(input([place('director.din', '01234567')], openAt('pre-15')));
    expect(draft.rows.every((r) => target(r as never) && (r.target as { engagementId: string }).engagementId === 'eng-acme')).toBe(true);
  });

  it('adds the copy of an identity document to the same person', () => {
    const { draft } = planRows(input([place('director.pan', 'ABCDE1234F')], openAt('pre-15'), { files: [{ attachmentId: 'file-1', fileName: 'pan.pdf', docType: 'pan_card', person: 'Asha Rao' }] }));
    const copy = draft.rows.find((r) => r.action === 'checklist.attachFile')!;
    expect(target(copy).fieldId).toBe('panCopyUrl');
    expect(target(copy).entryId).toBe(target(draft.rows[0]!).entryId);
    expect(copy.displayNew).toBe('pan.pdf');
  });
});
