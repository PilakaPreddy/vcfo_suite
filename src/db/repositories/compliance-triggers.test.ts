import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/db/client', () => ({ db: {} }));
import { complianceTriggersFor } from '@/db/repositories/compliance';
import { generateComplianceInstances } from '@/lib/compliance/generate-instances';

const emptyRow = {
  engagementId: 'e1', incorporationDate: '2026-08-01', gstRegistrationDate: null, tanRegistrationDate: null,
  pfRegistrationDate: null, esiRegistrationDate: null, ptRegistrationDate: null, tdsLiabilityStartDate: null,
  agmDate: null, hasForeignInvestment: false, gstQrmp: false, sezUnit: false, updatedAt: new Date(),
};
const state = {
  'reg-4': { status: 'completed', responses: { gstRegistrationDate: '2026-09-20' } },
  'reg-1': { status: 'completed', responses: { pfRegistrationDate: '2026-09-22' } },
  'reg-3': { status: 'completed', responses: { esiRegistrationDate: '2026-09-25' } },
};

describe('compliance generation reads the registration steps (UAT D-T13-01)', () => {
  it('fills the GST, PF and ESI dates from the checklist when the trigger row has none', () => {
    const t = complianceTriggersFor(emptyRow, state);
    expect(t).toMatchObject({ incorporationDate: '2026-08-01', gstRegistrationDate: '2026-09-20', pfRegistrationDate: '2026-09-22', esiRegistrationDate: '2026-09-25' });
  });

  it('so the monthly GST, PF and ESI filings are generated', () => {
    const ids = new Set(
      generateComplianceInstances({ engagementId: 'e1', entityLegalForm: 'company', triggers: complianceTriggersFor(emptyRow, state), ownerId: null, asOfDate: '2026-11-10' } as never).map((i) => i.obligationId),
    );
    const withoutRegs = new Set(
      generateComplianceInstances({ engagementId: 'e1', entityLegalForm: 'company', triggers: complianceTriggersFor(emptyRow, {}), ownerId: null, asOfDate: '2026-11-10' } as never).map((i) => i.obligationId),
    );
    expect(ids.size).toBeGreaterThan(withoutRegs.size);
    expect([...ids].some((id) => /gst/.test(id) && id !== 'gst-gstr-9')).toBe(true);
    expect([...ids].some((id) => /pf/.test(id))).toBe(true);
    expect([...ids].some((id) => /esi/.test(id))).toBe(true);
  });

  it('dates the TAN from the certificate of incorporation, so TDS payments are generated', () => {
    const withCoi = { ...state, 'pre-12': { status: 'completed', responses: { dateOfIncorporation: '2026-08-01', tan: 'BLRK12345F' } } };
    const t = complianceTriggersFor(emptyRow, withCoi);
    expect(t.tanRegistrationDate).toBe('2026-08-01');
    const ids = generateComplianceInstances({ engagementId: 'e1', entityLegalForm: 'company', triggers: t, ownerId: null, asOfDate: '2026-11-10' } as never).map((i) => i.obligationId);
    expect(ids).toContain('it-tds-payment');
  });
});
