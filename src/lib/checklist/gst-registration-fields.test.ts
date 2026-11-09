import { describe, expect, it } from 'vitest';
import { getActiveCatalogItems } from '@/data/checklist';
import { gateChecklistSteps } from '@/lib/checklist/checklist-step-gate';
import { filterFieldsByViewer } from '@/lib/checklist/checklist-field-access';
import { requiredFieldErrors } from '@/lib/checklist/checklist-step-validation';
import { canRoleEditField, isDirectFlowStep } from '@/lib/incorporation/pre-inc-direct-flow';
import {
  GST_REG_FIELDS,
  GST_REG_LEAD_ONLY_FIELD_IDS,
  GST_REG_SECTIONS,
  gstPartBDueDate,
  gstRegFormatChecks,
} from './gst-registration-fields';

describe('GST REG-01 tabs', () => {
  it('follows the portal and leaves out Goods and Services', () => {
    expect(GST_REG_SECTIONS).toEqual([
      'Part A — New Registration',
      'Business Details',
      'Promoter / Partners',
      'Authorized Signatory',
      'Authorized Representative',
      'Principal Place of Business',
      'Additional Places of Business',
      'Bank Accounts',
      'State Specific Information',
      'Aadhaar Authentication',
      'Verification',
      'ARN and Certificate',
      'LUT Filing',
    ]);
    expect(GST_REG_FIELDS.some((f) => /goods and services|hsn|sac/i.test(`${f.section} ${f.label}`))).toBe(false);
    for (const f of GST_REG_FIELDS) expect(GST_REG_SECTIONS).toContain(f.section);
  });

  it('keeps the ids the registration facts read', () => {
    for (const id of ['gstinNumber', 'gstRegistrationDate', 'gstCertificateUrl', 'lutFilingDate', 'lutArn', 'lutNotes']) {
      expect(GST_REG_FIELDS.some((f) => f.id === id)).toBe(true);
    }
  });
});

describe('who fills the GST step', () => {
  it('is a direct-flow step', () => {
    expect(isDirectFlowStep('reg-4')).toBe(true);
  });

  it('gives the portal-only fields to the lead and the company details to the client', () => {
    for (const id of ['gstTrn', 'gstArn', 'gstinNumber', 'gstCertificateUrl', 'gstPartAState']) {
      expect(GST_REG_LEAD_ONLY_FIELD_IDS).toContain(id);
      expect(canRoleEditField('client', 'reg-4', id)).toBe(false);
      expect(canRoleEditField('intern', 'reg-4', id)).toBe(true);
    }
    for (const id of ['gstTradeName', 'gstPpobProofUrl', 'gstPromoters', 'gstPromoters.e1.photoUrl', 'gstBankAccounts.e1.ifsc']) {
      expect(canRoleEditField('client', 'reg-4', id)).toBe(true);
      expect(canRoleEditField('intern', 'reg-4', id)).toBe(true);
    }
  });

  it('shows the client only their tabs', () => {
    const sections = new Set(filterFieldsByViewer(GST_REG_FIELDS, 'client', 'reg-4').map((f) => f.section));
    expect(sections.has('Promoter / Partners')).toBe(true);
    expect(sections.has('Principal Place of Business')).toBe(true);
    expect(sections.has('Bank Accounts')).toBe(true);
    expect(sections.has('Part A — New Registration')).toBe(false);
    expect(sections.has('Verification')).toBe(false);
    expect(sections.has('ARN and Certificate')).toBe(false);
  });

  it('asks for the NOC only when the premises are on consent or shared', () => {
    const base = requiredFieldErrors('reg-4', { gstPpobPossession: 'owned' });
    expect(base.gstPpobNocUrl).toBeUndefined();
    expect(requiredFieldErrors('reg-4', { gstPpobPossession: 'consent' }).gstPpobNocUrl).toBeDefined();
  });
});

describe('when the GST step opens', () => {
  const items = getActiveCatalogItems();

  it('stays locked for the client before the certificate of incorporation', () => {
    expect(gateChecklistSteps({ items, state: {}, viewer: 'client' })['reg-4']?.canEdit).toBe(false);
  });

  it('opens for the client once the certificate step is complete, ahead of post-incorporation', () => {
    const state = Object.fromEntries(
      items
        .slice(0, items.findIndex((i) => i.id === 'pre-12') + 1)
        .map((i) => [i.id, { status: 'completed' as const }]),
    );
    const gates = gateChecklistSteps({ items, state, viewer: 'client' });
    expect(gates['reg-4']).toMatchObject({ kind: 'active', canEdit: true });
    expect(gates['reg-1']?.canEdit).toBe(false);
  });
});

describe('GST format checks', () => {
  it('catches a GSTIN that does not carry the company PAN', () => {
    const { errors } = gstRegFormatChecks({ gstCompanyPan: 'AABCS1429B', gstinNumber: '29AABCT1429B1Z1' });
    expect(errors.gstinNumber).toMatch(/PAN/);
    expect(gstRegFormatChecks({ gstCompanyPan: 'AABCS1429B', gstinNumber: '29AABCS1429B1Z1' }).errors).toEqual({});
  });

  it('checks PIN, mobile and email', () => {
    const { errors } = gstRegFormatChecks({ gstPpobPinCode: '12345', gstPartAMobile: '12345', gstPartAEmail: 'x' });
    expect(Object.keys(errors).sort()).toEqual(['gstPartAEmail', 'gstPartAMobile', 'gstPpobPinCode']);
  });

  it('warns about the Part B deadline 15 days after the TRN', () => {
    expect(gstPartBDueDate('2026-04-26')).toBe('2026-05-11');
    expect(gstRegFormatChecks({ gstTrnDate: '2026-04-26' }, '2026-05-01').warnings.gstTrn).toBe('Part B is due by 2026-05-11.');
    expect(gstRegFormatChecks({ gstTrnDate: '2026-04-26' }, '2026-05-20').warnings.gstTrn).toMatch(/expired/);
    expect(gstRegFormatChecks({ gstTrnDate: '2026-04-26', gstArn: 'AA29' }, '2026-05-20').warnings).toEqual({});
  });
});
