import { describe, expect, it } from 'vitest';
import { getIncorporationPhases, getItem } from '@/data/checklist';
import { prefillNotes, shortLabel, subStepCount, subStepsOf } from './step-progress';

const stepNo = (id: string) => getIncorporationPhases().flatMap((p) => p.items).findIndex((i) => i.id === id) + 1;

describe('subStepsOf', () => {
  const reg4 = getItem('reg-4')!; // GST registration: the client's GST REG-01 tabs

  it('groups by section and marks the first open group as now', () => {
    const subs = subStepsOf(reg4, {}, 'live');
    expect(subs.length).toBeGreaterThanOrEqual(2);
    expect(subs[0]!.s).toBe('now');
    expect(subs.slice(1).every((x) => x.s === 'todo')).toBe(true);
  });

  it('counts a section done when one of its fields has an answer', () => {
    const subs = subStepsOf(reg4, { gstTradeName: 'Acme' }, 'live');
    const business = subs.find((x) => /Business/.test(x.l));
    expect(business?.s).toBe('done');
    expect(subStepCount(subs).done).toBe(1);
  });

  it('is all done for a finished step and all to do for one not open yet', () => {
    expect(subStepsOf(reg4, {}, 'done').every((x) => x.s === 'done')).toBe(true);
    expect(subStepsOf(reg4, { lutArn: 'x' }, 'up').every((x) => x.s === 'todo')).toBe(true);
  });

  it('cuts long labels', () => {
    expect(shortLabel('Registered office address (as on the utility bill)')).toBe('Registered office…');
    expect(shortLabel('GST Registration')).toBe('GST Registration');
  });
});

describe('prefillNotes', () => {
  it('notes a field copied from an earlier step that defines it', () => {
    const state = {
      'reg-4': { responses: { lutArn: 'AD290000000001', lutFilingDate: '2026-10-01' } },
      'reg-5': { responses: { lutArn: 'AD290000000001', lutFilingDate: '2026-10-02' } },
    };
    const notes = prefillNotes('reg-5', state as never);
    expect(notes.lutArn).toBe(`Copied from step ${stepNo('reg-4')} · ${getItem('reg-4')!.title}`);
    // a different answer is not a copy
    expect(notes.lutFilingDate).toBeUndefined();
  });

  it('gives no note when the earlier step has no answer, or for the first step', () => {
    expect(prefillNotes('reg-5', { 'reg-5': { responses: { lutArn: 'X1' } } } as never)).toEqual({});
    expect(prefillNotes('pre-1', { 'pre-1': { responses: { companyName: 'Northwind' } } } as never)).toEqual({});
    expect(prefillNotes('not-a-step', {})).toEqual({});
  });

  it('reads the registered office seed the step recorded', () => {
    const fromSetup = prefillNotes('pre-14', {
      'pre-14': { responses: { registeredOfficeSource: 'project-setup', registeredOfficeCompleteAddress: '12 MG Road, Bengaluru' } },
    } as never);
    expect(fromSetup.registeredOfficeCompleteAddress).toBe('Copied from project setup');

    const fromKyc = prefillNotes('pre-14', {
      'pre-14': {
        responses: {
          registeredOfficeSource: 'director-kyc',
          registeredOfficeCompleteAddress: '12 MG Road, Bengaluru',
          registeredOfficeUtilityBillNumber: 'EB-1',
        },
      },
    } as never);
    expect(fromKyc.registeredOfficeCompleteAddress).toBe('Copied from the earlier Director KYC step');
    expect(fromKyc.registeredOfficeUtilityBillNumber).toBe('Copied from the earlier Director KYC step');

    const none = prefillNotes('pre-14', { 'pre-14': { responses: { registeredOfficeCompleteAddress: '12 MG Road' } } } as never);
    expect(none).toEqual({});
  });
});
