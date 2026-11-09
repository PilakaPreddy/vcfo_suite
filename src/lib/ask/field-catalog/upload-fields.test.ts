import { describe, expect, it } from 'vitest';
import { COPY_FIELD_BY_DOC, isUploadField, UPLOAD_FIELD_BY_DOC, UPLOAD_FIELDS, uploadField } from './upload-fields';

describe('upload fields', () => {
  it('lists every file field on the incorporation steps, including those inside a repeating list', () => {
    expect(UPLOAD_FIELDS.length).toBeGreaterThan(20);
    expect(UPLOAD_FIELDS.every((f) => f.stepId && f.fieldId && f.label)).toBe(true);
    expect(uploadField('pre-15', 'panCopyUrl')).toMatchObject({ group: 'directors', entryLabel: 'Director' });
    expect(uploadField('pre-12', 'certificateOfIncorporationFinalUrl')?.group).toBeUndefined();
  });

  it('answers whether a step and field take a file', () => {
    expect(isUploadField('pre-14', 'registeredOfficeNocUrl')).toBe(true);
    expect(isUploadField('pre-15', 'panNumber')).toBe(false);
    expect(isUploadField('no-such', 'panCopyUrl')).toBe(false);
  });

  it('maps document types to upload fields, best first', () => {
    expect(UPLOAD_FIELD_BY_DOC.utility_bill?.map((f) => f.fieldId)).toEqual(['utilityBillCopyUrl', 'registeredOfficeUtilityBillCopyUrl']);
    expect(UPLOAD_FIELD_BY_DOC.incorporation_certificate?.[0]?.stepId).toBe('pre-12');
    expect(UPLOAD_FIELD_BY_DOC.contract).toBeUndefined();
  });

  it('keeps the director copy alias the planner used', () => {
    expect(COPY_FIELD_BY_DOC).toEqual({
      pan_card: 'panCopyUrl',
      aadhaar_card: 'aadhaarCopyUrl',
      passport: 'passportCopyUrl',
      driving_licence: 'drivingLicenceCopyUrl',
      utility_bill: 'utilityBillCopyUrl',
    });
  });
});
