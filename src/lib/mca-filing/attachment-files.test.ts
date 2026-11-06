import { describe, expect, it } from 'vitest';
import { attachmentSlots, contentTypeFromName, fileNameFromKey, ownMilestoneKey } from './attachment-files';
import type { SpiceAttachment } from '@/lib/spice-attachments/derive';

const DB = '11111111-1111-1111-1111-111111111101';
const OTHER = '22222222-2222-2222-2222-222222222202';
const path = (field: string, name = 'file.pdf', id = DB) => `${id}/${field}/1700000000000-${name}`;
const item = (key: string): SpiceAttachment => ({ key, label: key, stepId: 'pre-1', stepTitle: 'Step', status: 'waiting', detail: 'In progress', vaultDocumentId: null });
const state = (steps: Record<string, Record<string, string>>) =>
  Object.fromEntries(Object.entries(steps).map(([id, responses]) => [id, { responses }])) as never;

describe('ownMilestoneKey', () => {
  it('accepts only this engagement’s own stored paths', () => {
    expect(ownMilestoneKey(DB, path('x'))).toBe(`milestone-documents/${path('x')}`);
    expect(ownMilestoneKey(DB, path('x', 'file.pdf', OTHER))).toBeNull();
    expect(ownMilestoneKey(DB, `${DB}/../${OTHER}/x/1700000000000-a.pdf`)).toBeNull();
    expect(ownMilestoneKey(DB, 'https://example.com/a.pdf')).toBeNull();
    expect(ownMilestoneKey(DB, 'plain text')).toBeNull();
    expect(ownMilestoneKey(DB, '')).toBeNull();
    expect(ownMilestoneKey(DB, undefined)).toBeNull();
  });
});

describe('attachmentSlots', () => {
  const key = (slots: ReturnType<typeof attachmentSlots>, k: string) => slots.find((s) => s.key === k);

  it('reports nothing as available when nothing is stored', () => {
    const slots = attachmentSlots({
      dbId: DB,
      items: ['board-resolution', 'parent-proof', 'office-proof', 'director-kyc', 'dir-2', 'inc-9', 'moa', 'aoa'].map(item),
      state: state({}),
      boardResolutionKey: null,
    });
    expect(slots.every((s) => s.storageKey === null)).toBe(true);
    expect(slots.every((s) => Boolean(s.note))).toBe(true);
    expect(slots.map((s) => s.key)).toEqual(['board-resolution', 'parent-proof', 'office-proof.noc', 'office-proof.utility-bill', 'director-kyc', 'dir-2', 'inc-9', 'moa', 'aoa']);
  });

  it('finds the board resolution, the parent proof and both office proofs', () => {
    const slots = attachmentSlots({
      dbId: DB,
      items: ['board-resolution', 'parent-proof', 'office-proof'].map(item),
      state: state({
        'pre-1': { certificateOfIncorporationUrl: path('certificateOfIncorporationUrl', 'coi.pdf') },
        'pre-14': { registeredOfficeNocUrl: path('registeredOfficeNocUrl', 'noc.pdf'), registeredOfficeUtilityBillCopyUrl: path('registeredOfficeUtilityBillCopyUrl', 'bill.pdf') },
      }),
      boardResolutionKey: `engagement-documents/${DB}/signed/x.pdf`,
    });
    expect(key(slots, 'board-resolution')!.storageKey).toBe(`engagement-documents/${DB}/signed/x.pdf`);
    expect(key(slots, 'parent-proof')!.storageKey).toContain('coi.pdf');
    expect(key(slots, 'office-proof.noc')!.storageKey).toContain('noc.pdf');
    expect(key(slots, 'office-proof.utility-bill')!.storageKey).toContain('bill.pdf');
  });

  it('refuses a stored path that points at another engagement', () => {
    const slots = attachmentSlots({
      dbId: DB,
      items: [item('parent-proof')],
      state: state({ 'pre-1': { certificateOfIncorporationUrl: path('certificateOfIncorporationUrl', 'coi.pdf', OTHER) } }),
      boardResolutionKey: null,
    });
    expect(slots[0]!.storageKey).toBeNull();
  });

  it('never offers a Word draft as the file', () => {
    const slots = attachmentSlots({
      dbId: DB,
      items: [item('moa'), item('aoa')],
      state: state({ 'pre-7': { moaDraftUrl: path('moaDraftUrl', 'moa.docx') } }),
      boardResolutionKey: null,
    });
    expect(key(slots, 'moa')).toMatchObject({ storageKey: null });
    expect(key(slots, 'moa')!.note).toMatch(/Word draft/);
    expect(key(slots, 'aoa')!.note).toMatch(/does not store/);
  });
});

describe('file names', () => {
  it('drops the upload time and reads the type', () => {
    expect(fileNameFromKey('milestone-documents/a/b/1700000000000-coi.pdf')).toBe('coi.pdf');
    expect(contentTypeFromName('coi.PDF')).toBe('application/pdf');
    expect(contentTypeFromName('photo.jpg')).toBe('image/jpeg');
    expect(contentTypeFromName('odd.xyz')).toBe('application/octet-stream');
  });
});
