import { describe, expect, it } from 'vitest';
import {
  applyPre1EngagementDefaults,
  getPre1VisibleFields,
  isValidPre1Date,
  isValidPre1Gender,
  isValidPre1NominalValuePerEquityShare,
  pre1GenderLabel,
  validatePre1Responses,
} from '@/lib/checklist/checklist-pre1-validation';
import { CLIENT_RESPONSE_FIELDS } from '@/lib/checklist/checklist-responses';
import { buildBoardResolutionMergeFields } from '@/lib/board-resolution/board-resolution';

describe('isValidPre1Date', () => {
  it('accepts ISO YYYY-MM-DD dates', () => {
    expect(isValidPre1Date('2026-05-26')).toBe(true);
    expect(isValidPre1Date('2024-02-29')).toBe(true);
  });

  it('rejects invalid dates', () => {
    expect(isValidPre1Date('')).toBe(false);
    expect(isValidPre1Date('26-05-2026')).toBe(false);
    expect(isValidPre1Date('2026-02-29')).toBe(false);
    expect(isValidPre1Date('2026-13-01')).toBe(false);
    expect(isValidPre1Date('not-a-date')).toBe(false);
  });
});

describe('isValidPre1NominalValuePerEquityShare', () => {
  it('accepts positive integers and decimals', () => {
    expect(isValidPre1NominalValuePerEquityShare('10')).toBe(true);
    expect(isValidPre1NominalValuePerEquityShare('10.5')).toBe(true);
    expect(isValidPre1NominalValuePerEquityShare('1,000')).toBe(true);
  });

  it('rejects zero, negative, and non-numeric values', () => {
    expect(isValidPre1NominalValuePerEquityShare('0')).toBe(false);
    expect(isValidPre1NominalValuePerEquityShare('-10')).toBe(false);
    expect(isValidPre1NominalValuePerEquityShare('ten')).toBe(false);
    expect(isValidPre1NominalValuePerEquityShare('')).toBe(false);
  });
});

describe('validatePre1Responses nominalValuePerEquityShare', () => {
  it('requires nominal value on submit validation', () => {
    const { ok, errors } = validatePre1Responses({});
    expect(ok).toBe(false);
    expect(errors.nominalValuePerEquityShare).toMatch(/required/i);
  });

  it('flags invalid nominal value format', () => {
    const { ok, errors } = validatePre1Responses({ nominalValuePerEquityShare: 'INR 10' });
    expect(ok).toBe(false);
    expect(errors.nominalValuePerEquityShare).toMatch(/valid nominal/i);
  });
});

describe('applyPre1EngagementDefaults share capital', () => {
  it('defaults nominal value per equity share to 10', () => {
    const next = applyPre1EngagementDefaults({});
    expect(next.nominalValuePerEquityShare).toBe('10');
  });
});

describe('Part A fields (owner list 2026-11-02)', () => {
  const pre1Fields = CLIENT_RESPONSE_FIELDS['pre-1'];

  it('lists nominal value as the third share-capital field', () => {
    const shareCapitalIds = pre1Fields
      .filter((f) => f.section === 'Proposed Share Capital Structure')
      .map((f) => f.id);
    expect(shareCapitalIds).toEqual([
      'authorisedShareCapital',
      'paidUpShareCapital',
      'nominalValuePerEquityShare',
    ]);
  });

  it('asks only the sections on the owner list, in that order', () => {
    const sections = [...new Set(pre1Fields.map((f) => f.section).filter(Boolean))];
    expect(sections).toEqual([
      'Business Description',
      'Proposed Company Names',
      'Foreign Entity Details',
      'Proposed Directors',
      'Proposed Share Capital Structure',
      'Person Signing the Board Resolution',
      'NIC Codes',
    ]);
  });

  it('no longer asks for company mail, mobile, registration number, trademark, gender, extra KYC or the resolution date', () => {
    const ids = pre1Fields.map((f) => f.id);
    for (const gone of [
      'companyMailId',
      'companyMobileCountryCode',
      'companyMobileNumber',
      'parentEntityRegistrationNumber',
      'parentEntityHasTrademark',
      'parentEntityTrademarkUrl',
      'signatoryGender',
      'drivingLicenseUrl',
      'utilityBillUrl',
      'boardResolutionDate',
    ]) {
      expect(ids).not.toContain(gone);
    }
  });

  it('keeps the foreign entity certificate and the signatory KYC as attachments', () => {
    const files = pre1Fields.filter((f) => f.type === 'file').map((f) => [f.id, f.section]);
    expect(files).toEqual([
      ['certificateOfIncorporationUrl', 'Foreign Entity Details'],
      ['passportUrl', 'Person Signing the Board Resolution'],
    ]);
  });

  it('shows director slots 3 and 4 only when the count asks for them', () => {
    const ids = (count: string) => getPre1VisibleFields(pre1Fields, { directorCount: count }).map((f) => f.id);
    expect(ids('2')).toContain('director2FirstName');
    expect(ids('2')).not.toContain('director3FirstName');
    expect(ids('3')).toContain('director3FirstName');
    expect(ids('3')).not.toContain('director4FirstName');
    expect(ids('4')).toContain('director3FirstName');
    expect(ids('4')).toContain('director4FirstName');
  });
});

describe('validatePre1Responses proposed directors', () => {
  const two = {
    directorCount: '2',
    director1FirstName: 'Priya',
    director1LastName: 'Sharma',
    director1Gender: 'female',
    director1IndiaResident: 'yes',
    director2FirstName: 'John',
    director2LastName: 'Smith',
    director2Gender: 'male',
    director2IndiaResident: 'no',
  };

  it('accepts two named directors with one India resident', () => {
    const { errors } = validatePre1Responses(two);
    expect(Object.keys(errors).filter((k) => k.startsWith('director'))).toEqual([]);
  });

  it('requires each slot up to the count', () => {
    const { errors } = validatePre1Responses({ ...two, directorCount: '3' });
    expect(errors.director3FirstName).toMatch(/required/i);
    expect(errors.director3LastName).toMatch(/required/i);
    expect(errors.director3Gender).toMatch(/required/i);
    expect(errors.director3IndiaResident).toMatch(/required/i);
    expect(errors.director4FirstName).toBeUndefined();
  });

  it('requires at least one India-resident director', () => {
    const { errors } = validatePre1Responses({ ...two, director1IndiaResident: 'no' });
    expect(errors.director1IndiaResident).toMatch(/resident in India/i);
  });

  it('never requires the board resolution date or the company mail', () => {
    const { errors } = validatePre1Responses({});
    expect(errors.boardResolutionDate).toBeUndefined();
    expect(errors.companyMailId).toBeUndefined();
    expect(errors.signatoryGender).toBeUndefined();
  });
});

describe('isValidPre1Gender', () => {
  it('accepts male, female, other', () => {
    expect(isValidPre1Gender('male')).toBe(true);
    expect(isValidPre1Gender('female')).toBe(true);
    expect(isValidPre1Gender('other')).toBe(true);
    expect(isValidPre1Gender('Male')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidPre1Gender('')).toBe(false);
    expect(isValidPre1Gender('M')).toBe(false);
    expect(isValidPre1Gender('unknown')).toBe(false);
  });
});

describe('pre1GenderLabel', () => {
  it('returns display label for stored value', () => {
    expect(pre1GenderLabel('female')).toBe('Female');
    expect(pre1GenderLabel('')).toBeNull();
  });
});

describe('buildBoardResolutionMergeFields director gender', () => {
  it('outputs director names without Mr./Ms. honorifics', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '2',
        director1FirstName: 'Jane',
        director1LastName: 'Doe',
        director1Gender: 'female',
        director1IndiaResident: 'yes',
        director2FirstName: 'John',
        director2LastName: 'Smith',
        director2Gender: 'male',
        director2IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Jane Doe');
    expect(fields.SECOND_DIRECTOR_LINE).toBe('John Smith');
  });

  it('includes middle name in director merge line', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '2',
        director1FirstName: 'Jane',
        director1MiddleName: 'Marie',
        director1LastName: 'Doe',
        director1Gender: 'female',
        director1IndiaResident: 'yes',
        director2FirstName: 'John',
        director2LastName: 'Smith',
        director2Gender: 'male',
        director2IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Jane Marie Doe');
  });

  it('outputs plain names when gender is other', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '2',
        director1FirstName: 'Alex',
        director1LastName: 'Director',
        director1Gender: 'other',
        director1IndiaResident: 'yes',
        director2FirstName: 'Second',
        director2LastName: 'Person',
        director2Gender: 'female',
        director2IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Alex Director');
    expect(fields.SECOND_DIRECTOR_LINE).toBe('Second Person');
  });

  it('maps signatory first/middle/last to SIGNATORY_NAME', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        signatoryFirstName: 'Sam',
        signatoryMiddleName: 'Lee',
        signatoryLastName: 'Patel',
      },
    });
    expect(fields.SIGNATORY_NAME).toBe('Sam Lee Patel');
  });

  it('maps pre-1 boardResolutionDate to RESOLUTION_EFFECTIVE_DATE', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        boardResolutionDate: '2026-05-26',
      },
    });
    expect(fields.RESOLUTION_EFFECTIVE_DATE).toBe('MAY 26, 2026');
  });

  it('includes all non-Indian-resident directors in SECOND_DIRECTOR_LINE when count is 3', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '3',
        director1FirstName: 'Priya',
        director1LastName: 'Sharma',
        director1Gender: 'female',
        director1IndiaResident: 'yes',
        director2FirstName: 'John',
        director2LastName: 'Smith',
        director2Gender: 'male',
        director2IndiaResident: 'no',
        director3FirstName: 'Alex',
        director3LastName: 'Chen',
        director3Gender: 'other',
        director3IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Priya Sharma');
    expect(fields.SECOND_DIRECTOR_LINE).toBe('John Smith and Alex Chen');
  });

  it('includes all non-Indian-resident directors in SECOND_DIRECTOR_LINE when count is 4', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '4',
        director1FirstName: 'Priya',
        director1LastName: 'Sharma',
        director1Gender: 'female',
        director1IndiaResident: 'yes',
        director2FirstName: 'John',
        director2LastName: 'Smith',
        director2Gender: 'male',
        director2IndiaResident: 'no',
        director3FirstName: 'Alex',
        director3LastName: 'Chen',
        director3Gender: 'other',
        director3IndiaResident: 'no',
        director4FirstName: 'Maria',
        director4LastName: 'Garcia',
        director4Gender: 'female',
        director4IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Priya Sharma');
    expect(fields.SECOND_DIRECTOR_LINE).toBe(
      'John Smith, Alex Chen and Maria Garcia',
    );
  });

  it('lists remaining directors when Indian resident is not director 1', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '3',
        director1FirstName: 'John',
        director1LastName: 'Smith',
        director1Gender: 'male',
        director1IndiaResident: 'no',
        director2FirstName: 'Priya',
        director2LastName: 'Sharma',
        director2Gender: 'female',
        director2IndiaResident: 'yes',
        director3FirstName: 'Alex',
        director3LastName: 'Chen',
        director3Gender: 'other',
        director3IndiaResident: 'no',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Priya Sharma');
    expect(fields.SECOND_DIRECTOR_LINE).toBe('John Smith and Alex Chen');
  });

  it('lists second Indian director in SECOND_DIRECTOR_LINE when both are India residents', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        directorCount: '2',
        director1FirstName: 'Priya',
        director1LastName: 'Sharma',
        director1Gender: 'female',
        director1IndiaResident: 'yes',
        director2FirstName: 'Raj',
        director2LastName: 'Patel',
        director2Gender: 'male',
        director2IndiaResident: 'yes',
      },
    });
    expect(fields.INDIAN_DIRECTOR_LINE).toBe('Priya Sharma');
    expect(fields.SECOND_DIRECTOR_LINE).toBe('Raj Patel');
  });

  it('maps pre-1 parentEntityAddress to PARENT_ENTITY_ADDRESS', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        parentEntityAddress: '100 Market Street, Salt Lake City, Utah, USA',
      },
    });
    expect(fields.PARENT_ENTITY_ADDRESS).toBe(
      '100 Market Street, Salt Lake City, Utah, USA',
    );
  });

  it('derives CERTIFICATION_PLACE from parent address and uses boardResolutionDate for cert date', () => {
    const fields = buildBoardResolutionMergeFields({
      pre1: {
        boardResolutionDate: '2026-05-26',
        parentEntityAddress: '100 Market Street, Salt Lake City, Utah, USA',
      },
    });
    expect(fields.CERTIFICATION_PLACE).toBe('USA');
    expect(fields.CERTIFICATION_DATE).toBe('26th May, 2026');
  });
});
