import { describe, expect, it } from 'vitest';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { classifyFile, noticeDestination, type ClassifyInput } from './classify';

/** The drop sorter learns the notice destination (IDEAS-PLAN wave 2, section C). */

const acme = { id: 'e-acme', slug: 'acme', companyName: 'Acme Technologies Private Limited' };
const hints = { engagements: [acme], instruction: '' };
const read = (patch: Partial<ReadResult> = {}): ReadResult => ({ docType: 'other', company: null, values: [], parts: [], sensitive: false, usedModel: false, ...patch });
const file = (path: string, patch: Partial<ReadResult> = {}): ClassifyInput => ({ attachmentId: 'a', kind: 'file', fileName: path.split('/').pop()!, path, read: read(patch) });
const value = (label: string, v: string) => ({ label, value: v, page: 1, person: null, confidence: 1 });

describe('drop: notices', () => {
  it('sends a notice the reader typed as one to the notice desk', () => {
    expect(classifyFile(file('Acme/scan.pdf', { docType: 'tax_notice' }), hints).destination).toEqual({ kind: 'notice', authority: null });
  });

  it('recognises notice wording in the file name, the folders or the values', () => {
    expect(classifyFile(file('Acme/GST SCN FY2324.pdf'), hints).destination).toEqual({ kind: 'notice', authority: 'gst' });
    expect(classifyFile(file('Acme/Notices/letter.pdf', { docType: 'company_letter', values: [value('Subject', 'Notice u/s 143(2) for AY 2024-25')] }), hints).destination).toEqual({ kind: 'notice', authority: 'income_tax' });
    expect(classifyFile(file('Acme/DRC-01 demand.pdf', { docType: 'form' }), hints).destination).toMatchObject({ kind: 'notice', authority: 'gst' });
  });

  it('keeps the client rules: the notice still needs one client', () => {
    const found = classifyFile(file('GST SCN.pdf'), { engagements: [acme, { id: 'e-2', slug: 'b', companyName: 'Beta LLP' }], instruction: '' });
    expect(found.destination.kind).toBe('notice');
    expect(found.needs).toContain('client');
  });

  it('leaves meeting notices, certificates and plain letters where they went before', () => {
    expect(classifyFile(file('Acme/Notice of Board Meeting.pdf', { docType: 'company_letter' }), hints).destination).toEqual({ kind: 'vault', category: 'Letters' });
    expect(noticeDestination(file('Acme/gst notice.pdf', { docType: 'gst_certificate' }))).toBeNull();
    expect(classifyFile(file('Acme/letter.pdf', { docType: 'company_letter' }), hints).destination).toEqual({ kind: 'vault', category: 'Letters' });
  });
});
