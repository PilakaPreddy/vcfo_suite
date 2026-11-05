import { describe, expect, it } from 'vitest';
import type { VaultDocument, VaultEntityGroup } from '@/lib/documents/vault-documents';
import {
  canDeleteDoc,
  fileUrl,
  fromLabel,
  isReplacedDoc,
  folderDocs,
  factsFor,
  indexMaps,
  previewKind,
  refFor,
  reviewWord,
  zipItems,
  type VaultIndexRow,
} from './vault-files';

const PATH = 'eng-1/pan_card/1730000000000-pan.pdf';

function doc(id: string, milestoneId: string, section: string, extra: Partial<VaultDocument> = {}): VaultDocument {
  return {
    id,
    engagementId: 'e1',
    companyName: 'Acme',
    milestoneId,
    milestoneTitle: `Step ${milestoneId}`,
    bucket: 'Pre-incorporation',
    section,
    fieldId: `f-${id}`,
    fieldLabel: `Field ${id}`,
    fileName: `${id}.pdf`,
    storagePath: `eng-1/f-${id}/1730000000000-${id}.pdf`,
    uploadedAt: null,
    source: 'milestone',
    ...extra,
  };
}

const a = doc('a', 'm1', 'KYC');
const b = doc('b', 'm1', 'Office');
const c = doc('c', 'm2', 'KYC');
const m1 = { milestoneId: 'm1', milestoneTitle: 'Step m1', bucket: 'pre', docCount: 2, sections: [{ section: 'KYC', docs: [a] }, { section: 'Office', docs: [b] }] };
const m2 = { milestoneId: 'm2', milestoneTitle: 'Step m2', bucket: 'pre', docCount: 1, sections: [{ section: 'KYC', docs: [c] }] };
const entity: VaultEntityGroup = {
  engagementId: 'e1',
  companyName: 'Acme',
  stage: 'Pre-Incorporation',
  milestones: [m1, m2],
  phases: [{ phaseKey: 'pre-inc', phaseLabel: 'Pre-incorporation', milestones: [m1, m2], docCount: 3 }],
  docCount: 3,
};

describe('refFor and fileUrl', () => {
  it('uses the index row when there is one, else the checklist path', () => {
    expect(refFor(doc('x', 'm1', 'KYC', { storagePath: PATH }))).toEqual({ path: PATH });
    expect(refFor(doc('x', 'm1', 'KYC', { storagePath: PATH }), 'row-1')).toEqual({ documentId: 'row-1' });
    expect(refFor(doc('x', 'm1', 'KYC', { storagePath: 'engagement-documents/x/y.pdf', documentId: 'd1', source: 'index' }))).toEqual({
      documentId: 'd1',
    });
    expect(refFor(doc('x', 'm1', 'KYC', { storagePath: 'not-a-path' }))).toBeNull();
  });

  it('builds same-origin preview and download URLs', () => {
    expect(fileUrl({ documentId: 'd1' })).toBe('/api/documents/d1/preview');
    expect(fileUrl({ documentId: 'd1' }, 'download')).toBe('/api/documents/d1/preview?download=1');
    expect(fileUrl({ path: PATH })).toBe(`/api/documents/preview?path=${encodeURIComponent(PATH)}`);
    expect(fileUrl({ requestFileId: 'r1' }, 'download')).toBe('/api/documents/preview?requestFileId=r1&download=1');
  });
});

describe('index rows', () => {
  it('finds the row by id or by the object key', () => {
    const row = { id: 'row-1', engagementId: 'e1', category: null, fileName: 'pan.pdf', objectKey: PATH, stepId: null, createdAt: '' } as VaultIndexRow;
    const { byKey, byId } = indexMaps([row]);
    expect(factsFor(doc('x', 'm1', 'KYC', { storagePath: PATH }), byKey, byId)).toBe(row);
    expect(factsFor(doc('x', 'm1', 'KYC', { documentId: 'row-1' }), byKey, byId)).toBe(row);
    expect(factsFor(doc('x', 'm1', 'KYC'), byKey, byId)).toBeNull();
  });

  it('reads a server-read file from its node: index row, replaced flag and reference', () => {
    const { byKey, byId } = indexMaps([]);
    const node = {
      id: 'br-final', ref: 'br:final', label: 'Board resolution', fileName: 'br.docx', contentType: 'x/y', sizeBytes: 5,
      status: 'Replaced' as const, replaced: true, from: 'SBC', fromSbc: true, categoryId: 'c3' as const, source: 'board-resolution' as const,
    };
    const br = doc('br-final', 'pre-3', 'KYC', { storagePath: '', source: 'board-resolution', node });
    expect(factsFor(br, byKey, byId)).toEqual({ contentType: 'x/y', sizeBytes: 5 });
    expect(isReplacedDoc(br, null)).toBe(true);
    expect(refFor(br)).toEqual({ clientRef: 'br:final', engagementId: 'e1' });
    expect(fileUrl({ clientRef: 'br:final', engagementId: 'e1' }, 'download')).toBe('/api/client/documents/file?ref=br%3Afinal&engagement=e1&dl=1');
    expect(zipItems([br], () => null)).toEqual([]);
    const rf = doc('rf-1', 'pre-3', 'KYC', { storagePath: '', source: 'request', node: { ...node, id: 'rf-1', ref: 'r:file-1', replaced: false } });
    expect(refFor(rf)).toEqual({ requestFileId: 'file-1' });
    expect(canDeleteDoc(rf, factsFor(rf, byKey, byId), { role: 'admin' })).toBe(false);
  });
});

describe('folderDocs and zipItems', () => {
  it('collects a phase, a step and a category', () => {
    expect(folderDocs(entity, 'step', 'phase:pre-inc').map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(folderDocs(entity, 'step', 'phase:pre-inc:m1').map((d) => d.id)).toEqual(['a', 'b']);
    expect(folderDocs(entity, 'cat', 'cat:KYC').map((d) => d.id)).toEqual(['a', 'c']);
    expect(folderDocs(entity, 'step', 'nope')).toEqual([]);
  });

  it('names each file once, with its phase and step as the folder', () => {
    const items = zipItems([a, a, b], () => null);
    expect(items).toEqual([
      { path: a.storagePath, folder: 'Pre-incorporation/Step m1' },
      { path: b.storagePath, folder: 'Pre-incorporation/Step m1' },
    ]);
  });
});

describe('previewKind and reviewWord', () => {
  it('previews PDFs and images only', () => {
    expect(previewKind('a.PDF')).toBe('pdf');
    expect(previewKind('scan', 'image/jpeg')).toBe('image');
    expect(previewKind('a.docx')).toBeNull();
    expect(previewKind('a.svg', 'image/svg+xml')).toBeNull();
  });

  it('words the review state', () => {
    expect(reviewWord('approved')).toBe('Approved');
    expect(reviewWord('changes')).toBe('Sent back');
    expect(reviewWord('none')).toBeNull();
  });
});

describe('replaced, from and delete (P-575, P-593, P-596)', () => {
  const r = (extra: Partial<VaultIndexRow> = {}): VaultIndexRow => ({
    id: 'd1',
    engagementId: 'e1',
    category: null,
    fileName: 'pan.pdf',
    objectKey: PATH,
    stepId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    uploadedBy: 'u-lead',
    ...extra,
  });
  const indexed = doc('index:d1', 's1', 'Docs', { source: 'index', documentId: 'd1' });
  const current = doc('m1', 's1', 'Docs', { source: 'milestone', storagePath: PATH });

  it('a replaced row flags an indexed file, never the file a step holds', () => {
    expect(isReplacedDoc(indexed, r({ replacedAt: '2026-10-02T00:00:00.000Z' }))).toBe(true);
    expect(isReplacedDoc(current, r({ replacedAt: '2026-10-02T00:00:00.000Z' }))).toBe(false);
    expect(isReplacedDoc(indexed, r())).toBe(false);
  });

  it('names the client for a client upload and SBC for staff', () => {
    expect(fromLabel(r({ uploadedByRole: 'client' }), 'Acme')).toBe('Acme');
    expect(fromLabel(r({ uploadedByRole: 'intern', uploadedByName: 'Bharath' }), 'Acme')).toBe('SBC · Bharath');
    expect(fromLabel(r({ uploadedBy: null }), 'Acme')).toBeNull();
  });

  it('admins and managers delete any indexed file, a lead only their own, nobody a step file', () => {
    expect(canDeleteDoc(indexed, r(), { role: 'manager', id: 'u-x' })).toBe(true);
    expect(canDeleteDoc(indexed, r(), { role: 'intern', id: 'u-lead' })).toBe(true);
    expect(canDeleteDoc(indexed, r(), { role: 'intern', id: 'u-other' })).toBe(false);
    expect(canDeleteDoc(current, r(), { role: 'admin', id: 'u-x' })).toBe(false);
    expect(canDeleteDoc(indexed, null, { role: 'admin', id: 'u-x' })).toBe(false);
  });
});
