import { describe, expect, it } from 'vitest';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { RegistrationFacts } from '@/lib/registrations/registration-facts';
import { seedRowsFor } from './seed';

const slice = (responses: Record<string, string>): ChecklistItemStateSlice => ({ status: 'in-progress', responses });

const STATE = {
  'pre-15': slice({
    directors: 'e1,e2',
    'directors.e1.firstName': 'Ravi',
    'directors.e1.lastName': 'Kumar',
    'directors.e1.din': '01234567',
    'directors.e1.hasDsc': 'yes',
    'directors.e1.dscExpiryDate': '2027-03-12',
    'directors.e2.firstName': 'Asha',
    'directors.e2.lastName': 'Rao',
    'directors.e2.hasDsc': 'no',
  }),
};

function facts(stepId: string, f: Partial<RegistrationFacts>): RegistrationFacts {
  return { stepId, rowKey: stepId, number: null, registeredOn: null, certificate: null, issuedOn: null, expiresOn: null, renewEveryMonths: null, ...f };
}

describe('seedRowsFor', () => {
  it('adds a DSC for each director with a DSC expiry, and DIR-3 KYC for each DIN holder', () => {
    const rows = seedRowsFor({ companyName: 'Acme Private Limited', state: STATE, registrationFacts: {}, directors: [], today: '2026-11-09' });
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'dsc', subjectName: 'Ravi Kumar', expiresOn: '2027-03-12', sourceKey: 'dsc:ravi-kumar', referenceLabel: 'DIN 01234567', sync: true }),
      expect.objectContaining({ kind: 'dir3_kyc', subjectName: 'Ravi Kumar', expiresOn: '2027-09-30', sourceKey: 'dir3:01234567', sync: false }),
    ]);
  });

  it('takes DIN holders from the current directors, skips ceased ones and deduplicates by DIN', () => {
    const rows = seedRowsFor({
      companyName: 'Acme',
      state: STATE,
      registrationFacts: {},
      directors: [
        { name: 'Ravi K', din: '01234567', ceasedOn: null },
        { name: 'Old Director', din: '07654321', ceasedOn: '2026-01-01' },
        { name: 'New Director', din: '08888888', ceasedOn: null },
      ],
      today: '2026-08-01',
    });
    const kyc = rows.filter((r) => r.kind === 'dir3_kyc');
    expect(kyc.map((r) => [r.subjectName, r.expiresOn])).toEqual([
      ['Ravi K', '2026-09-30'],
      ['New Director', '2026-09-30'],
    ]);
  });

  it('adds registrations that carry an expiry, and LEI a year on from its registration date', () => {
    const rows = seedRowsFor({
      companyName: 'Acme',
      state: {},
      registrationFacts: {
        'reg-9': facts('reg-9', { expiresOn: '2027-01-31', number: 'SE-123' }),
        'reg-4': facts('reg-4', { number: '36AAACX1234F1Z5' }),
        'reg-6': facts('reg-6', { registeredOn: '2025-12-01' }),
        'reg-12': facts('reg-12', { expiresOn: '2030-05-01' }),
      },
      directors: [],
      today: '2026-11-09',
    });
    expect(rows.map((r) => [r.kind, r.expiresOn, r.sourceKey])).toEqual([
      ['shops', '2027-01-31', 'reg:reg-9'],
      ['lei', '2026-12-01', 'reg:reg-6'],
      ['other', '2030-05-01', 'reg:reg-12'],
    ]);
    expect(rows[0]).toMatchObject({ subjectKind: 'company', subjectName: 'Acme', referenceLabel: 'Shops & Establishment SE-123', source: 'registration' });
  });
});
