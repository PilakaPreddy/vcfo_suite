import { describe, expect, it } from 'vitest';
import {
  FILING_STATES,
  FilingRefusal,
  deadlines,
  deadlinesToAlert,
  istDate,
  movesFrom,
  nextAction,
  planFilingPatch,
  stateFitsForm,
  type DeadlineInput,
  type FilingFacts,
} from './filing-state';

const facts = (over: Partial<FilingFacts> = {}): FilingFacts => ({
  form: 'spice-part-b',
  state: 'pdf_review',
  srn: null,
  srnAt: null,
  signedUploadedAt: null,
  paidAt: null,
  nameApprovedAt: null,
  reviewedAt: null,
  remarks: [],
  hasFreshSignedPdf: false,
  ...over,
});
const NOW = new Date('2026-11-05T06:00:00Z');
const plan = (f: FilingFacts, patch: Parameters<typeof planFilingPatch>[1]) => planFilingPatch(f, patch, NOW, 'Asha');
const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FilingRefusal) return e.code;
    throw e;
  }
  return 'no refusal';
};

describe('nextAction', () => {
  it('says who and what for every state', () => {
    for (const state of FILING_STATES) {
      const a = nextAction(state);
      expect(a.who).toBeTruthy();
      expect(a.what.length).toBeGreaterThan(5);
    }
    expect(nextAction('pdf_review').who).toBe('professional');
    expect(nextAction('awaiting_signatures').who).toBe('signers');
    expect(nextAction('approved').who).toBe('nobody');
    expect(nextAction('pdf_review', true).who).toBe('lead');
  });
});

describe('moves', () => {
  it('keeps each state to its form', () => {
    expect(stateFitsForm('spice-part-a', 'name_approved')).toBe(true);
    expect(stateFitsForm('spice-part-b', 'name_approved')).toBe(false);
    expect(stateFitsForm('spice-part-a', 'pdf_review')).toBe(false);
    expect(movesFrom('spice-part-b', 'data_ready')).toEqual(['part_b_filling', 'cancelled']);
    expect(movesFrom('spice-part-a', 'data_ready')).toEqual(['part_a_filling', 'cancelled']);
    expect(movesFrom('spice-part-b', 'approved')).toEqual([]);
  });

  it('refuses a jump, a wrong form and the gates', () => {
    expect(refusal(() => plan(facts({ state: 'data_ready' }), { state: 'submitted' }))).toBe('invalid_move');
    expect(refusal(() => plan(facts(), { state: 'name_approved' }))).toBe('state_not_for_form');
    expect(refusal(() => plan(facts(), { state: 'awaiting_signatures' }))).toBe('not_reviewed');
    expect(refusal(() => plan(facts({ state: 'awaiting_signatures' }), { state: 'signed_ready' }))).toBe('no_signed_pdf');
    expect(refusal(() => plan(facts({ state: 'payment_pending' }), { state: 'submitted' }))).toBe('not_paid');
  });

  it('allows a gated move once the gate is met', () => {
    expect(plan(facts({ reviewedAt: NOW }), { state: 'awaiting_signatures' }).state).toBe('awaiting_signatures');
    expect(plan(facts({ state: 'awaiting_signatures', hasFreshSignedPdf: true }), { state: 'signed_ready' }).state).toBe('signed_ready');
  });
});

describe('planFilingPatch', () => {
  it('upper-cases the SRN, stamps it and refuses a bad one', () => {
    expect(plan(facts(), { srn: 'ab1234567' })).toMatchObject({ srn: 'AB1234567', srnAt: NOW });
    expect(refusal(() => plan(facts(), { srn: 'bad srn!' }))).toBe('bad_srn');
  });

  it('keeps the SRN date when the same SRN is sent again', () => {
    const first = new Date('2026-11-01T06:00:00Z');
    expect(plan(facts({ srn: 'AB1234567', srnAt: first }), { srn: 'AB1234567' }).srnAt).toBeUndefined();
    expect(plan(facts({ srn: 'AB1234567', srnAt: first }), { srn: 'AB1234567', srnOn: '2026-11-02' }).srnAt).toEqual(new Date('2026-11-02T00:00:00+05:30'));
  });

  it('adds a remark to the log and keeps the last one', () => {
    const out = plan(facts({ remarks: [{ at: 'x', byName: 'Ravi', text: 'old' }] }), { remark: ' Fix the address ' });
    expect(out.lastRemark).toBe('Fix the address');
    expect(out.remarks).toHaveLength(2);
    expect(out.remarks![1]).toMatchObject({ byName: 'Asha', text: 'Fix the address' });
  });

  it('stamps the name and upload clocks on their moves', () => {
    expect(plan(facts({ form: 'spice-part-a', state: 'part_a_submitted' }), { state: 'name_approved' }).nameApprovedAt).toEqual(NOW);
    expect(plan(facts({ state: 'upload_pending', hasFreshSignedPdf: true }), { state: 'payment_pending' }).signedUploadedAt).toEqual(NOW);
    const given = plan(facts({ state: 'upload_pending', hasFreshSignedPdf: true }), { state: 'payment_pending', signedUploadedOn: '2026-11-03' });
    expect(given.signedUploadedAt).toEqual(new Date('2026-11-03T00:00:00+05:30'));
  });

  it('moves a filing waiting for payment to submitted when the date is recorded', () => {
    const out = plan(facts({ state: 'payment_pending' }), { paidOn: '2026-11-05' });
    expect(out.state).toBe('submitted');
    expect(out.paidAt).toEqual(new Date('2026-11-05T00:00:00+05:30'));
  });

  it('refuses a date in the future and a fee on Part A', () => {
    expect(refusal(() => plan(facts({ state: 'payment_pending' }), { paidOn: '2026-11-06' }))).toBe('date_in_future');
    expect(refusal(() => plan(facts({ form: 'spice-part-a', state: 'part_a_filling' }), { paidOn: '2026-11-05' }))).toBe('not_part_b');
  });
});

describe('deadlines', () => {
  const base: DeadlineInput = { form: 'spice-part-b', state: 'pdf_review', srnAt: null, signedUploadedAt: null, paidAt: null, nameApprovedAt: null };

  it('runs 15 days from the SRN in India time, and marks it as the MCA FAQ rule', () => {
    // 19:00 UTC on 31 Oct is 1 Nov in India.
    const [d] = deadlines({ ...base, srnAt: '2026-10-31T19:00:00Z' }, '2026-11-05');
    expect(d).toMatchObject({ key: 'upload', dueOn: '2026-11-16', daysLeft: 11, confirmed: true });
    expect(d!.source).toContain('MCA FAQ');
  });

  it('swaps to 7 days from the signed upload, and stops once paid', () => {
    const uploaded = { ...base, srnAt: '2026-11-01T06:00:00Z', signedUploadedAt: '2026-11-03T06:00:00Z' };
    expect(deadlines(uploaded, '2026-11-05').map((d) => [d.key, d.dueOn, d.daysLeft])).toEqual([['payment', '2026-11-10', 5]]);
    expect(deadlines({ ...uploaded, paidAt: '2026-11-04T06:00:00Z' }, '2026-11-05')).toEqual([]);
  });

  it('marks the 20 day name validity as a secondary source, not confirmed', () => {
    const [d] = deadlines({ ...base, form: 'spice-part-a', state: 'name_approved', nameApprovedAt: '2026-11-01T06:00:00Z' }, '2026-11-05');
    expect(d).toMatchObject({ key: 'name', dueOn: '2026-11-21', confirmed: false });
    expect(d!.source).toMatch(/secondary source/i);
  });

  it('has no clock once the filing is submitted, sent back or cancelled', () => {
    for (const state of ['submitted', 'approved', 'resubmit', 'cancelled'] as const) {
      expect(deadlines({ ...base, state, srnAt: '2026-11-01T06:00:00Z' }, '2026-11-05')).toEqual([]);
    }
  });

  it('alerts within 3 days, for a week after, once a day, and never for the name date', () => {
    const srn = { ...base, srnAt: '2026-11-01T06:00:00Z' }; // due 16 Nov
    expect(deadlinesToAlert(srn, '2026-11-12', {})).toEqual([]);
    expect(deadlinesToAlert(srn, '2026-11-13', {}).map((d) => d.daysLeft)).toEqual([3]);
    expect(deadlinesToAlert(srn, '2026-11-16', {}).map((d) => d.daysLeft)).toEqual([0]);
    expect(deadlinesToAlert(srn, '2026-11-20', {}).map((d) => d.daysLeft)).toEqual([-4]);
    expect(deadlinesToAlert(srn, '2026-11-24', {})).toEqual([]);
    expect(deadlinesToAlert(srn, '2026-11-13', { upload: '2026-11-13' })).toEqual([]);
    const name = { ...base, form: 'spice-part-a' as const, state: 'name_approved' as const, nameApprovedAt: '2026-11-01T06:00:00Z' };
    expect(deadlinesToAlert(name, '2026-11-20', {})).toEqual([]);
  });

  it('reads the India date of an instant', () => {
    expect(istDate('2026-11-05T19:00:00Z')).toBe('2026-11-06');
  });
});
