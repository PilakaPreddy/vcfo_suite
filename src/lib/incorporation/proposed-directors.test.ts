import { describe, expect, it } from 'vitest';
import { validatePre15Responses } from '@/lib/checklist/checklist-part-b-validation';
import {
  directorResponsesFromState,
  directorsAsPre6Responses,
  readProposedDirectors,
  seedProposedDirectorsFromPartA,
} from '@/lib/incorporation/proposed-directors';

const resident = {
  firstName: 'Asha', lastName: 'Rao', gender: 'female', indiaResident: 'yes', dob: '1985-04-02',
  fatherName: 'R Rao', highestEducationalQualification: 'bachelors-degree', occupationType: 'business',
  mobileNumber: '+919876543210', personalMailId: 'asha@example.com', aadhaarNumber: '123412341234',
  aadhaarCopyUrl: 'e/aadhaar/1-a.pdf', panNumber: 'ABCDE1234F', panCopyUrl: 'e/pan/1-p.pdf',
  utilityBillType: 'electricity', utilityBillNumber: '77', utilityBillAddress: '1 MG Road', utilityBillCopyUrl: 'e/ub/1-u.pdf',
  recentPhotographUrl: 'e/photo/1-x.jpg', hasOtherCompanyInterest: 'no',
};
const nonResident = {
  ...resident, firstName: 'John', lastName: 'Doe', gender: 'male', indiaResident: 'no', aadhaarNumber: '', aadhaarCopyUrl: '',
  panNumber: '', panCopyUrl: '', passportNumber: 'X1234567', passportCopyUrl: 'e/pp/1-p.pdf', notaryApostilleMethod: 'consultant',
};
function entries(list: Record<string, string>[]): Record<string, string> {
  const out: Record<string, string> = { directors: list.map((_, i) => `e${i + 1}`).join(',') };
  list.forEach((values, i) => {
    for (const [k, v] of Object.entries(values)) if (v) out[`directors.e${i + 1}.${k}`] = v;
  });
  return out;
}

describe('proposed directors accessor', () => {
  it('reads pre-15 entries first', () => {
    const state = { 'pre-15': { status: 'in-progress' as const, responses: entries([resident, nonResident]) } };
    const directors = readProposedDirectors(state);
    expect(directors.map((d) => d.values.firstName)).toEqual(['Asha', 'John']);
    const { pre1, pre6 } = directorResponsesFromState(state);
    expect(pre1.directorCount).toBe('2');
    expect(pre1.director1FirstName).toBe('Asha');
    expect(pre1.director2IndiaResident).toBe('no');
    expect(pre6.residentDirectorFirstName).toBe('Asha');
    expect(pre6.residentDirectorPanNumber).toBe('ABCDE1234F');
    expect(pre6.nrDirectorPassportNumber).toBe('X1234567');
    expect(pre6.nrDirectorNotaryApostilleMethod).toBe('consultant');
  });

  it('falls back to the legacy Part A slots + Director KYC step, matched by residency', () => {
    const state = {
      'pre-1': {
        status: 'completed' as const,
        responses: {
          directorCount: '2', director1FirstName: 'Asha', director1LastName: 'Rao', director1Gender: 'female', director1IndiaResident: 'yes',
          director2FirstName: 'John', director2LastName: 'Doe', director2Gender: 'male', director2IndiaResident: 'no', director2Din: '01234567',
        },
      },
      'pre-6': { status: 'completed' as const, responses: { residentDirectorPanNumber: 'ABCDE1234F', nrDirectorPassportNumber: 'X1234567', nrDirector2PassportNumber: 'NOPE' } },
    };
    const directors = readProposedDirectors(state);
    expect(directors.map((d) => d.values.firstName)).toEqual(['Asha', 'John']);
    expect(directors[0]?.values.panNumber).toBe('ABCDE1234F');
    expect(directors[1]?.values.passportNumber).toBe('X1234567');
    expect(directors[1]?.values.din).toBe('01234567');
    // Legacy maps are handed through untouched.
    const { pre6 } = directorResponsesFromState(state);
    expect(pre6.nrDirector2PassportNumber).toBe('NOPE');
  });

  it('numbers extra directors of the same residency the way the legacy step did', () => {
    const pre6 = directorsAsPre6Responses([
      { id: 'a', index: 1, values: { firstName: 'A', indiaResident: 'yes' } },
      { id: 'b', index: 2, values: { firstName: 'B', indiaResident: 'yes' } },
      { id: 'c', index: 3, values: { firstName: 'C', indiaResident: 'no' } },
    ]);
    expect(pre6.residentDirectorFirstName).toBe('A');
    expect(pre6.residentDirector2FirstName).toBe('B');
    expect(pre6.nrDirectorFirstName).toBe('C');
  });
});

describe('validatePre15Responses', () => {
  it('needs two directors, one resident in India, each complete', () => {
    expect(validatePre15Responses({}).errors.directors).toMatch(/at least 2/i);
    expect(validatePre15Responses(entries([nonResident, nonResident])).errors.directors).toMatch(/resident of India/);
    const ok = validatePre15Responses(entries([resident, nonResident]));
    expect(ok.errors).toEqual({});
    const bad = validatePre15Responses(entries([{ ...resident, panNumber: 'nope', personalMailId: 'x' }, nonResident]));
    expect(bad.errors['directors.e1.panNumber']).toMatch(/PAN/);
    expect(bad.errors['directors.e1.personalMailId']).toMatch(/e-mail/);
    const missing = validatePre15Responses(entries([{ ...resident, aadhaarCopyUrl: '' }, nonResident]));
    expect(missing.errors['directors.e1.aadhaarCopyUrl']).toMatch(/upload/);
    // A non-resident is not asked for Aadhaar.
    expect(missing.errors['directors.e2.aadhaarCopyUrl']).toBeUndefined();
  });
});

describe('Part B step validators — capital structure and registered office', async () => {
  const { validatePre13Responses, validatePre14Responses, shareClassTotal } = await import(
    '@/lib/checklist/checklist-part-b-validation'
  );

  it('derives the class total from shares × nominal value', () => {
    expect(shareClassTotal('10000', '10')).toBe('1,00,000');
    expect(shareClassTotal('1,000', '12.5')).toBe('12,500');
    expect(shareClassTotal('abc', '10')).toBe('');
    expect(shareClassTotal('10', '')).toBe('');
  });

  it('needs at least one share class, then a whole share count and a nominal value', () => {
    expect(validatePre13Responses({}).errors.equityShares).toBe('This field is required.');
    expect(validatePre13Responses({ equityShares: 'no', preferenceShares: 'no' }).errors.equityShares).toMatch(/at least one/);
    const partial = validatePre13Responses({ equityShares: 'yes', preferenceShares: 'no' });
    expect(partial.errors.equityQuantity).toBe('This field is required.');
    expect(partial.errors.preferenceQuantity).toBeUndefined();
    const bad = validatePre13Responses({ equityShares: 'yes', preferenceShares: 'no', equityQuantity: '10.5', equityNominalValue: '-1' });
    expect(bad.errors.equityQuantity).toMatch(/whole number/);
    expect(bad.errors.equityNominalValue).toMatch(/nominal/);
    expect(validatePre13Responses({ equityShares: 'yes', preferenceShares: 'no', equityQuantity: '10000', equityNominalValue: '10' }).ok).toBe(true);
  });

  it('registered office needs the address, the NOC and the utility-bill proof', () => {
    const errors = validatePre14Responses({ registeredOfficeCompleteAddress: '1 MG Road' }).errors;
    expect(errors.registeredOfficeNocUrl).toMatch(/upload/);
    expect(errors.registeredOfficeUtilityBillType).toBe('This field is required.');
    expect(
      validatePre14Responses({
        registeredOfficeCompleteAddress: '1 MG Road', registeredOfficeNocUrl: 'e/noc/1-n.pdf',
        registeredOfficeUtilityBillType: 'electricity', registeredOfficeUtilityBillNumber: '77', registeredOfficeUtilityBillCopyUrl: 'e/ub/1-u.pdf',
      }).ok,
    ).toBe(true);
  });

  it('the generators read the registered office from pre-14 first', () => {
    const state = {
      'pre-6': { status: 'completed' as const, responses: { registeredOfficeCompleteAddress: 'Old KYC address' } },
      'pre-14': { status: 'completed' as const, responses: { registeredOfficeCompleteAddress: 'New pre-14 address' } },
    };
    expect(directorResponsesFromState(state).pre6.registeredOfficeCompleteAddress).toBe('New pre-14 address');
    expect(directorResponsesFromState({ 'pre-6': state['pre-6'] }).pre6.registeredOfficeCompleteAddress).toBe('Old KYC address');
  });
});

describe('validatePre16Responses — subscriber details', async () => {
  const { validatePre16Responses } = await import('@/lib/checklist/checklist-part-b-validation');
  const { addRepeatEntry, resolveFieldLabels, expandRepeatEntry } = await import('@/lib/checklist/checklist-repeat');
  const { getItem } = await import('@/data/checklist');
  const { getClientResponseFields } = await import('@/lib/checklist/checklist-responses');
  const group = getClientResponseFields(getItem('pre-16')!).find((f) => f.id === 'subscribers')!;
  const sub = (values: Record<string, string>) => {
    const { patch, entryId } = addRepeatEntry({}, group as never);
    const responses = { ...patch };
    for (const [k, v] of Object.entries(values)) responses[`subscribers.${entryId}.${k}`] = v;
    return { responses, entryId };
  };

  it('accepts an empty list — "No subscribers to add" is a terminal path', () => {
    expect(validatePre16Responses({}).ok).toBe(true);
    expect(validatePre16Responses({ subscribers: '' }).ok).toBe(true);
  });

  it('an individual needs a name, a share count and a value', () => {
    const { responses, entryId } = sub({ type: 'individual' });
    const errors = validatePre16Responses(responses).errors;
    expect(errors[`subscribers.${entryId}.name`]).toBe('This field is required.');
    expect(errors[`subscribers.${entryId}.shares`]).toBe('This field is required.');
    expect(errors[`subscribers.${entryId}.entityType`]).toBeUndefined();
    expect(errors[`subscribers.${entryId}.cin`]).toBeUndefined();
    expect(validatePre16Responses(sub({ type: 'individual', name: 'Asha Rao', shares: '100', shareValue: '1000' }).responses).ok).toBe(true);
  });

  it('a body corporate needs a CIN and address; an LLP needs an LLPIN; both need the authorised person', () => {
    const bc = sub({ type: 'non-individual', entityType: 'body-corporate', name: 'Acme Ltd', shares: '10', shareValue: '100', cin: 'bad' });
    const bcErrors = validatePre16Responses(bc.responses).errors;
    expect(bcErrors[`subscribers.${bc.entryId}.cin`]).toMatch(/21 characters/);
    expect(bcErrors[`subscribers.${bc.entryId}.address`]).toBe('This field is required.');
    expect(bcErrors[`subscribers.${bc.entryId}.authorisedPerson`]).toBe('This field is required.');
    expect(bcErrors[`subscribers.${bc.entryId}.llpin`]).toBeUndefined();

    const llp = sub({ type: 'non-individual', entityType: 'llp', name: 'Acme LLP', shares: '10', shareValue: '100', llpin: '12', authorisedPerson: 'R Iyer' });
    expect(validatePre16Responses(llp.responses).errors[`subscribers.${llp.entryId}.llpin`]).toMatch(/AAB-1234/);
    expect(validatePre16Responses({ ...llp.responses, [`subscribers.${llp.entryId}.llpin`]: 'aab-1234' }).ok).toBe(true);
  });

  it('shares must be a whole number and the value a positive amount', () => {
    const { responses, entryId } = sub({ type: 'individual', name: 'A', shares: '1.5', shareValue: '0' });
    const errors = validatePre16Responses(responses).errors;
    expect(errors[`subscribers.${entryId}.shares`]).toMatch(/whole number/);
    expect(errors[`subscribers.${entryId}.shareValue`]).toMatch(/INR/);
  });

  it('the name field is relabelled by entity type', () => {
    const { responses, entryId } = sub({ type: 'non-individual', entityType: 'llp' });
    const fields = resolveFieldLabels(expandRepeatEntry(group as never, entryId), responses);
    expect(fields.find((f) => f.id === `subscribers.${entryId}.name`)?.label).toBe('Name of the LLP');
    const plain = resolveFieldLabels(expandRepeatEntry(group as never, entryId), { ...responses, [`subscribers.${entryId}.entityType`]: '' });
    expect(plain.find((f) => f.id === `subscribers.${entryId}.name`)?.label).toBe('Full name');
  });
});

describe('seedProposedDirectorsFromPartA', () => {
  const partA = {
    directorCount: '2',
    director1FirstName: 'Asha',
    director1LastName: 'Rao',
    director1Gender: 'female',
    director1IndiaResident: 'yes',
    director2FirstName: 'John',
    director2MiddleName: 'Q',
    director2LastName: 'Doe',
    director2Gender: 'male',
    director2IndiaResident: 'no',
  };

  it('starts pre-15 with one entry per Part A director', () => {
    const seed = seedProposedDirectorsFromPartA({}, partA)!;
    const ids = seed.directors!.split(',');
    expect(ids).toHaveLength(2);
    expect(seed[`directors.${ids[0]}.firstName`]).toBe('Asha');
    expect(seed[`directors.${ids[0]}.indiaResident`]).toBe('yes');
    expect(seed[`directors.${ids[1]}.middleName`]).toBe('Q');
    expect(seed[`directors.${ids[1]}.gender`]).toBe('male');
    const directors = readProposedDirectors({ 'pre-15': { status: 'in-progress', responses: seed } });
    expect(directors.map((d) => d.values.lastName)).toEqual(['Rao', 'Doe']);
  });

  it('never overwrites a pre-15 that already has entries, and skips an empty Part A', () => {
    expect(seedProposedDirectorsFromPartA({ directors: 'e12345678', 'directors.e12345678.firstName': 'X' }, partA)).toBeNull();
    expect(seedProposedDirectorsFromPartA({}, { directorCount: '2' })).toBeNull();
  });
});
