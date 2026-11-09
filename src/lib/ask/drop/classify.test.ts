import { describe, expect, it } from 'vitest';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { classifyDrop, classifyFile, matchTask, parseDropReply, stateCodeOfName, stateFromNames, uploadFieldsByLabel, type ClassifyInput } from './classify';

const acme = { id: 'e-acme', slug: 'acme', companyName: 'Acme Technologies Private Limited' };
const route = { id: 'e-route', slug: 'routeware', companyName: 'Routeware Solutions LLP' };
const engagements = [acme, route];

const read = (patch: Partial<ReadResult> = {}): ReadResult => ({ docType: 'other', company: null, values: [], parts: [], sensitive: false, usedModel: false, ...patch });
const file = (id: string, path: string, patch: Partial<ReadResult> = {}, kind = 'file'): ClassifyInput => ({ attachmentId: id, kind, fileName: path.split('/').pop()!, path, read: read(patch) });
const sheet = (slot: 'paysheet' | 'attendance' = 'paysheet', periodHint?: { from: string; to: string }) => ({ labourSheet: { slot, headers: ['Emp code'], ...(periodHint ? { periodHint } : {}) }, docType: 'labour_sheet' });
const hints = { engagements, instruction: 'fill this in' };

describe('classifyFile: the client', () => {
  it('takes the company the document names first', () => {
    const found = classifyFile(file('a', 'Routeware/letter.pdf', { company: 'ACME TECHNOLOGIES PVT LTD' }), hints);
    expect(found.engagementCandidates).toEqual([acme]);
    expect(found.clientSource).toBe('document');
  });

  it('then the folders, the deepest first, then the file name', () => {
    expect(classifyFile(file('a', 'Clients/Routeware/Payroll/pay.xlsx'), hints)).toMatchObject({ engagementCandidates: [route], clientSource: 'folder' });
    expect(classifyFile(file('a', 'acme_rent_agreement.pdf'), hints)).toMatchObject({ engagementCandidates: [acme], clientSource: 'file' });
  });

  it('then the message, the page and the only project', () => {
    expect(classifyFile(file('a', 'x.pdf'), { ...hints, instruction: 'file these for Routeware' })).toMatchObject({ engagementCandidates: [route], clientSource: 'message' });
    expect(classifyFile(file('a', 'x.pdf'), { ...hints, pagePath: '/app/intern/projects/acme' })).toMatchObject({ engagementCandidates: [acme], clientSource: 'page' });
    expect(classifyFile(file('a', 'x.pdf'), { engagements: [acme], instruction: '' })).toMatchObject({ engagementCandidates: [acme], clientSource: 'only' });
    const unknown = classifyFile(file('a', 'x.pdf'), hints);
    expect(unknown.engagementCandidates).toEqual([]);
    expect(unknown.needs).toContain('client');
  });
});

describe('classifyFile: the destination', () => {
  it('sends a labour sheet to the register with the month from the grid, else from the names, and a state from the names', () => {
    const grid = classifyFile(file('a', 'Acme/pay.xlsx', sheet('attendance', { from: '2026-09-01', to: '2026-09-30' })), hints);
    expect(grid.destination).toEqual({ kind: 'labour', slot: 'attendance', period: { from: '2026-09-01', to: '2026-09-30' }, stateCode: null });
    expect(grid.needs).toEqual(['state']);
    const named = classifyFile(file('a', 'Acme/Bengaluru/Payroll/Aug-2026/pay.xlsx', sheet()), hints);
    expect(named.destination).toEqual({ kind: 'labour', slot: 'paysheet', period: { from: '2026-08-01', to: '2026-08-31' }, stateCode: 'KA' });
    expect(named.needs).toEqual([]);
    expect(classifyFile(file('a', 'Acme/pay.xlsx', sheet()), hints).needs).toEqual(['state', 'period']);
  });

  it('sends an identity document to the director copy and a utility bill to a choice of fields', () => {
    expect(classifyFile(file('a', 'Acme/pan.pdf', { docType: 'pan_card' }), hints).destination).toMatchObject({ kind: 'checklist', copy: true });
    const bill = classifyFile(file('a', 'Acme/bill.pdf', { docType: 'utility_bill' }), hints);
    expect(bill.destination).toMatchObject({ kind: 'checklist', copy: false });
    expect(bill.needs).toContain('field');
  });

  it('matches an upload field by its label when the type says nothing', () => {
    expect(uploadFieldsByLabel('MCA name approval letter.pdf').map((f) => f.fieldId)).toHaveLength(1);
    expect(classifyFile(file('a', 'Acme/MCA name approval letter.pdf'), hints).destination).toMatchObject({ kind: 'checklist' });
    expect(uploadFieldsByLabel('scan.pdf')).toEqual([]);
  });

  it('sends everything else to the vault with a category, and a paste to values only', () => {
    expect(classifyFile(file('a', 'Acme/lease.pdf', { docType: 'rent_agreement' }), hints).destination).toEqual({ kind: 'vault', category: 'Contracts' });
    expect(classifyFile(file('a', 'Acme/x.pdf'), hints).destination).toEqual({ kind: 'vault', category: 'Other' });
    expect(classifyFile(file('a', 'Pasted text', {}, 'paste'), hints).destination).toEqual({ kind: 'values' });
  });
});

describe('classifyDrop', () => {
  it('gives a file with no hint of its own the client of its folder siblings', () => {
    const found = classifyDrop(
      [file('a', 'Drop/Aug/pan.pdf', { docType: 'pan_card', company: 'Routeware Solutions' }), file('b', 'Drop/Aug/pay.xlsx', sheet()), file('c', 'Other/x.pdf')],
      { ...hints, instruction: 'fill these for Acme' },
    );
    expect(found[0]).toMatchObject({ engagementCandidates: [route], clientSource: 'document' });
    expect(found[1]).toMatchObject({ engagementCandidates: [route], clientSource: 'sibling' });
    expect(found[2]).toMatchObject({ engagementCandidates: [acme], clientSource: 'message' });
  });
});

describe('states', () => {
  it('reads state names, cities and capital codes, never a code inside a word', () => {
    expect(stateFromNames(['Payroll Tamil Nadu'])).toBe('TN');
    expect(stateFromNames(['Gurgaon office'])).toBe('HR');
    expect(stateFromNames(['Payroll_KA'])).toBe('KA');
    expect(stateFromNames(['ka payroll', 'Backup'])).toBeNull();
    expect(stateCodeOfName('Karnataka')).toBe('KA');
    expect(stateCodeOfName('')).toBeNull();
  });
});

describe('matchTask', () => {
  const tasks = [
    { id: 't-aug', name: 'GSTR-3B', periodLabel: 'Aug 2026', dueDate: '2026-09-20' },
    { id: 't-sep', name: 'GSTR-3B', periodLabel: 'Sep 2026', dueDate: '2026-10-20' },
    { id: 't-pf', name: 'PF return', periodLabel: null, dueDate: '2026-09-15' },
  ];
  it('takes a task the message or a folder names, by the month when one is given', () => {
    expect(matchTask(tasks, { instruction: 'attach to the GSTR-3B', path: 'x.pdf', fileName: 'x.pdf' })?.id).toBe('t-aug');
    expect(matchTask(tasks, { instruction: '', path: 'GSTR-3B/Sep 2026/x.pdf', fileName: 'x.pdf' })?.id).toBe('t-sep');
    expect(matchTask(tasks, { instruction: 'PF return', path: 'x.pdf', fileName: 'x.pdf' })?.id).toBe('t-pf');
  });
  it('takes a file name only with a filing and a matching period', () => {
    expect(matchTask(tasks, { instruction: '', path: 'GSTR-3B Sep-2026.pdf', fileName: 'GSTR-3B Sep-2026.pdf' })?.id).toBe('t-sep');
    expect(matchTask(tasks, { instruction: '', path: 'GSTR-3B.pdf', fileName: 'GSTR-3B.pdf' })).toBeNull();
    expect(matchTask(tasks, { instruction: '', path: 'GSTR-3B Jan-2026.pdf', fileName: 'GSTR-3B Jan-2026.pdf' })).toBeNull();
  });
});

describe('parseDropReply', () => {
  it('reads a numbered file with a client, a state and a month', () => {
    expect(parseDropReply('file 3 -> Acme, Karnataka, Aug 2026', 3, engagements)).toEqual({
      cancel: false,
      assignments: [{ files: [3], engagementId: 'e-acme', stateCode: 'KA', period: { from: '2026-08-01', to: '2026-08-31' } }],
    });
  });
  it('reads "all of them", lists of numbers and several lines', () => {
    expect(parseDropReply('all of them are Routeware', 4, engagements)?.assignments).toEqual([{ files: 'all', engagementId: 'e-route' }]);
    expect(parseDropReply('1 and 2 are Acme\n3: Routeware, Telangana', 3, engagements)?.assignments).toEqual([
      { files: [1, 2], engagementId: 'e-acme' },
      { files: [3], engagementId: 'e-route', stateCode: 'TG' },
    ]);
    expect(parseDropReply('Acme', 1, engagements)?.assignments).toEqual([{ files: [1], engagementId: 'e-acme' }]);
  });
  it('reads a cancel, and leaves an unrelated question to the chat', () => {
    expect(parseDropReply('leave them', 2, engagements)).toEqual({ cancel: true, assignments: [] });
    expect(parseDropReply('what is the due date of GSTR-1?', 2, engagements)).toBeNull();
    expect(parseDropReply('what is due for Acme in Aug 2026?', 2, engagements)).toBeNull();
    expect(parseDropReply('Acme', 0, engagements)).toBeNull();
  });
});
