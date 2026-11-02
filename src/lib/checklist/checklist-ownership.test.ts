import { describe, expect, it } from 'vitest';
import { getItem } from '@/data/checklist';
import { validatePre1Responses } from '@/lib/checklist/checklist-pre1-validation';
import { fieldsForOwnership, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { partAFieldsFor, partAsectionsFor } from '@/lib/checklist/part-a-sections';
import { createProjectBodySchema } from '@/lib/api/schemas';

const pre1 = getItem('pre-1')!;

describe('fieldsForOwnership', () => {
  it('drops the parent-entity sections and board resolution date for an independent company', () => {
    const all = getClientResponseFields(pre1);
    const independent = fieldsForOwnership('pre-1', all, 'independent');
    const gone = new Set(all.filter((f) => !independent.includes(f)).map((f) => f.id));
    for (const id of [
      'parentEntityName',
      'parentEntityAddress',
      'parentEntityCountry',
      'parentEntityState',
      'certificateOfIncorporationUrl',
      'signatoryFirstName',
      'signatoryDesignation',
      'passportUrl',
    ]) {
      expect(gone.has(id), id).toBe(true);
    }
    for (const id of ['proposedName1', 'authorisedShareCapital', 'businessDescription', 'director1FirstName', 'nicCode']) {
      expect(independent.some((f) => f.id === id), id).toBe(true);
    }
  });

  it('keeps every dependent-company field (reordered, never dropped) and other steps untouched', () => {
    const all = getClientResponseFields(pre1);
    const ids = new Set(all.map((f) => f.id));
    expect(new Set(fieldsForOwnership('pre-1', all, 'subsidiary').map((f) => f.id))).toEqual(ids);
    expect(new Set(fieldsForOwnership('pre-1', all, undefined).map((f) => f.id))).toEqual(ids);
    const pre6 = getClientResponseFields(getItem('pre-6')!);
    expect(fieldsForOwnership('pre-6', pre6, 'independent')).toBe(pre6);
  });
});

describe('validatePre1Responses for an independent company', () => {
  const filled = {
    proposedName1: 'Acme India Private Limited',
    proposedName2: 'Acme Tech India Private Limited',
    companyMailId: 'ops@acme.in',
    companyMobileCountryCode: '+91',
    companyMobileNumber: '9876543210',
    businessDescription: 'Software',
    nicCode: '62011',
    directorCount: '2',
    director1FirstName: 'A',
    director1LastName: 'B',
    director1Gender: 'male',
    director1IndiaResident: 'yes',
    director2FirstName: 'C',
    director2LastName: 'D',
    director2Gender: 'female',
    director2IndiaResident: 'no',
    authorisedShareCapital: '1000000',
    paidUpShareCapital: '100000',
    nominalValuePerEquityShare: '10',
  };

  it('does not require parent, signatory, KYC uploads or the board resolution date', () => {
    expect(validatePre1Responses(filled).ok).toBe(false);
    const visibleFieldIds = new Set(
      partAFieldsFor(getClientResponseFields(pre1), 'independent').map((f) => f.id),
    );
    expect(validatePre1Responses(filled, { visibleFieldIds }).ok).toBe(true);
  });
});

describe('createProjectBodySchema ownership', () => {
  const base = {
    companyName: 'Acme',
    companyType: 'domestic',
    clientEmail: 'founder@acme.in',
    clientPassword: 'SBC@2026',
    internId: 'intern-1',
    managerId: '00000000-0000-4000-8000-000000000000',
    // Indian subsidiary must say what the parent does.
    parentIndianRelationship: 'investing',
  };

  it('defaults to a subsidiary and demands parent details at creation', () => {
    const missing = createProjectBodySchema.safeParse(base);
    expect(missing.success).toBe(false);
    const result = createProjectBodySchema.safeParse({
      ...base,
      parentEntityName: 'Acme Holdings',
      parentEntityAddress: '1 MG Road, Bengaluru',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ownershipType).toBe('subsidiary');
      expect(result.data.parentEntityName).toBe('Acme Holdings');
    }
  });

  it('lets an independent company skip parent and subsidiary details at any stage', () => {
    const result = createProjectBodySchema.safeParse({
      ...base,
      ownershipType: 'independent',
      stage: 'Post-Incorporation',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.parentEntityName).toBe('');
  });
});

describe('partAsectionsFor', () => {
  it('is the single source for the tab list: every pre-1 section appears once, in order', () => {
    const all = getClientResponseFields(pre1);
    const dependent = partAsectionsFor('subsidiary');
    const seen = new Set(all.map((f) => f.section).filter(Boolean));
    expect(new Set(dependent)).toEqual(seen);
    const independent = partAsectionsFor('independent');
    expect(independent).not.toContain('Foreign Entity Details');
    expect(independent).not.toContain('Person Signing the Board Resolution');
    expect(independent).toContain('Proposed Directors');
    // Relative order of the shared sections is identical for both company types.
    expect(dependent.filter((s) => independent.includes(s))).toEqual(independent);
  });

  it('sorts fields by that order and keeps the remarks field last', () => {
    const fields = partAFieldsFor(getClientResponseFields(pre1), 'subsidiary');
    const order: readonly string[] = partAsectionsFor('subsidiary');
    let last = -1;
    for (const field of fields) {
      if (field.section === undefined) continue;
      const rank = order.indexOf(field.section);
      expect(rank).toBeGreaterThanOrEqual(last);
      last = rank;
    }
    expect(fields[fields.length - 1]?.id).toBe('stepRemarks');
  });
});

describe('Part A tab order (owner list 2026-11-02)', () => {
  it('follows the owner list and ends with the lead-only NIC codes', () => {
    expect(partAsectionsFor('subsidiary')).toEqual([
      'Business Description',
      'Proposed Company Names',
      'Foreign Entity Details',
      'Proposed Directors',
      'Proposed Share Capital Structure',
      'Person Signing the Board Resolution',
      'NIC Codes',
    ]);
    expect(partAsectionsFor('independent')).toEqual([
      'Business Description',
      'Proposed Company Names',
      'Proposed Directors',
      'Proposed Share Capital Structure',
      'NIC Codes',
    ]);
    const fields = partAFieldsFor(getClientResponseFields(pre1), 'subsidiary');
    const ids = fields.map((f) => f.id);
    expect(ids.indexOf('nicBusinessType')).toBe(ids.indexOf('nicCode') + 1);
  });
});
