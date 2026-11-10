import { describe, expect, it } from 'vitest';
import { createAgentRunSchema, proposePatchSchema, updateAgentRunSchema } from './api-schemas';
import { appendSrn, srnLine } from './record-srn';

describe('assist agent request bodies', () => {
  it('accepts progress with heals and an SRN, upper-casing the SRN', () => {
    const parsed = updateAgentRunSchema.parse({
      status: 'done',
      state: 'READ_SRN',
      fieldsFilled: 7,
      heals: [{ field: 'company.type', tier: 'T1', ok: true }],
      srn: 'aa1234567',
    });
    expect(parsed.srn).toBe('AA1234567');
  });

  it('refuses a refusal target or an error that carries personal data', () => {
    expect(updateAgentRunSchema.safeParse({ refusals: [{ kind: 'otp', target: 'OTP sent to 9876543210' }] }).success).toBe(false);
    expect(updateAgentRunSchema.safeParse({ error: 'PAN ABCDE1234F not accepted' }).success).toBe(false);
  });

  it('refuses unknown fields, so the extension cannot write the AI counters', () => {
    expect(updateAgentRunSchema.safeParse({ aiTokens: 0 }).success).toBe(false);
    expect(createAgentRunSchema.safeParse({ subAgent: 'spice-a', portalHost: 'localhost', userId: 'x' }).success).toBe(false);
  });

  it('refuses patch evidence that carries a value', () => {
    const base = { recipeId: 'spice-a', recipeVersion: '1.0.0', fieldKey: 'company.type', proposed: { som: 'a[0].b[0]' }, sourceTier: 'T3' };
    expect(proposePatchSchema.safeParse({ ...base, evidence: { fieldLabel: 'Type of company' } }).success).toBe(true);
    expect(proposePatchSchema.safeParse({ ...base, evidence: { candidateLabels: ['director@example.com'] } }).success).toBe(false);
    expect(proposePatchSchema.safeParse({ ...base, proposed: {} }).success).toBe(false);
    expect(proposePatchSchema.safeParse({ ...base, sourceTier: 'T0' }).success).toBe(false);
  });
});

describe('labels-only check reads text fields, never ids', () => {
  // The first group is all digits (a bare DIN) and the last is twelve digits (an Aadhaar shape).
  const runId = '12345678-1234-4234-8234-123456789012';
  const base = { recipeId: 'spice-a', recipeVersion: '1.0.0', fieldKey: 'company.type', proposed: { som: 'a[0].b[0]' }, sourceTier: 'T1' };

  it('accepts a patch whose run id has digit-only groups', () => {
    expect(proposePatchSchema.safeParse({ ...base, runId, evidence: { fieldLabel: 'Type of company' } }).success).toBe(true);
  });

  it('still refuses personal data in the proposed label or the field key', () => {
    expect(proposePatchSchema.safeParse({ ...base, runId, proposed: { label: 'PAN ABCDE1234F' } }).success).toBe(false);
    expect(proposePatchSchema.safeParse({ ...base, fieldKey: 'x 9876543210' }).success).toBe(false);
  });

  it('accepts progress with an SRN and refuses a value in a heal field name', () => {
    expect(updateAgentRunSchema.safeParse({ srn: 'A12345678', state: 'DONE', heals: [{ field: 'company.type', tier: 'T0', ok: true }] }).success).toBe(true);
    expect(updateAgentRunSchema.safeParse({ heals: [{ field: 'director@example.com', tier: 'T1', ok: true }] }).success).toBe(false);
  });
});

describe('SRN write-back text', () => {
  const at = new Date('2026-11-09T10:00:00Z');
  it('appends one line and never replaces the lead’s note', () => {
    expect(appendSrn(undefined, 'AA1234567', at)).toBe(srnLine('AA1234567', at));
    expect(appendSrn('Filed after client call.', 'AA1234567', at)).toBe('Filed after client call.\nSRN AA1234567 (VCFO Assist, 2026-11-09)');
  });
  it('writes nothing when the note already names the SRN', () => {
    expect(appendSrn('SRN AA1234567 filed', 'AA1234567', at)).toBeNull();
  });
});
