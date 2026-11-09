import { describe, expect, it } from 'vitest';
import { projectSnapshotSchema } from '@/data/ask/schema';
import { buildSnapshot } from '@/lib/ask/snapshot-build';
import { listSuggestions } from '@/lib/ask/suggestions';

const SECRETS = ['ABCDE1234F', 'U12345KA2026PTC000001', '09876543', 'Z1234567', '12 MG Road', 'Priya Sharma', 'priya@example.com'];

const state = {
  'pre-1': {
    status: 'completed',
    completedOn: '2026-09-01',
    responses: { pan: 'ABCDE1234F', directorName: 'Priya Sharma', email: 'priya@example.com' },
  },
  'pre-12': { status: 'not-started', responses: { cin: 'U12345KA2026PTC000001' } },
  'pre-15': { status: 'not-started', responses: { din: '09876543', passport: 'Z1234567', address: '12 MG Road' } },
} as never;

function snap(legalForm = 'company', companyType = 'foreign') {
  return buildSnapshot({
    engagement: {
      companyName: 'Acme India Private Limited',
      entityLegalForm: legalForm,
      companyType,
      ownershipType: 'subsidiary',
      stage: 'Pre-Incorporation',
      incorporationDate: null,
      schedule: null,
    },
    state,
    filings: [
      { particular: 'GSTR-3B', dueDate: '2026-10-20', filedOn: null },
      { particular: 'Old', dueDate: '2025-01-01', filedOn: '2025-01-01' },
    ],
    now: new Date('2026-10-01T00:00:00Z'),
  });
}

describe('project snapshot (§6.3)', () => {
  it('carries none of the forbidden fields', () => {
    const json = JSON.stringify(snap());
    for (const secret of SECRETS) expect(json).not.toContain(secret);
    expect(Object.keys(snap()).sort()).toEqual(
      [
        'companyName',
        'completedStepCount',
        'currentPhase',
        'currentStep',
        'hasForeignParent',
        'incorporated',
        'legalForm',
        'residency',
        'totalActiveSteps',
        'upcomingCompliances',
      ].sort(),
    );
  });

  it('rejects any extra key', () => {
    expect(projectSnapshotSchema.safeParse({ ...snap(), pan: 'ABCDE1234F' }).success).toBe(false);
  });

  it('keeps only upcoming unfiled calendar items', () => {
    expect(snap().upcomingCompliances).toEqual([{ name: 'GSTR-3B', dueDate: '2026-10-20' }]);
  });

  it('knows the current step and who owns it', () => {
    const s = snap();
    expect(s.currentStep?.id).toBeTruthy();
    expect(['client', 'lead']).toContain(s.currentStep?.owner);
    expect(s.currentPhase).toBe('SPICe+ Part A');
  });
});

describe('suggestions follow the company type', () => {
  it('an LLP client never sees SPICe+ as its own path', () => {
    const labels = listSuggestions('client', snap('llp', 'domestic')).map((s) => s.label);
    expect(labels.join(' ')).not.toMatch(/SPICe\+/);
    expect(labels).toContain('How is an LLP incorporated?');
  });

  it('a domestic client gets no FC-GPR suggestion; a foreign one does', () => {
    expect(listSuggestions('client', snap('company', 'domestic')).map((s) => s.id)).not.toContain('client-fc-gpr');
    expect(listSuggestions('client', snap('company', 'foreign')).map((s) => s.id)).toContain('client-fc-gpr');
  });
});

describe('next step for a company that is already incorporated (UAT D-T18-01)', () => {
  it('does not send a client who joined at Registration back to Part A', () => {
    const s = buildSnapshot({
      engagement: { companyName: 'Kaveri Foods Private Limited', entityLegalForm: 'company', companyType: 'domestic', ownershipType: 'independent', stage: 'Post-Incorporation', incorporationDate: '2026-08-01', schedule: null },
      state: { 'pre-12': { status: 'completed' } } as never,
      filings: [],
      now: new Date('2026-11-10T09:00:00Z'),
    });
    expect(s.currentStep?.id ?? 'none').not.toMatch(/^pre-/);
  });
});
