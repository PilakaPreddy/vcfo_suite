import { describe, expect, it } from 'vitest';

import { formById } from '@/data/labour-registers/forms';
import {
  catalogueState,
  resolveVerification,
  verificationFingerprint,
  verificationIndex,
  verificationLabel,
  type VerificationRecord,
} from './verification';
import { templateVersionFor } from './xlsx/version';

/**
 * The firm's verdict on a layout, over the catalogue's.
 *
 * Two things are worth testing here and they are not the obvious one. That a row wins over the
 * catalogue is a one-line merge. What matters is what happens to a *stored document* when the
 * verdict moves, because the verdict is printed on the sheet: if the content address does not
 * change, the next request is answered from storage and prints the old notice. That is the one
 * kind of stale cache hit in this feature that is not merely stale but misleading.
 */

const FORM = formById('in-wages-iv')!;

function row(over: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    formId: FORM.id,
    status: 'gazette-verified',
    against: 'the Wage Code Central Rules as notified on 8 May 2026',
    disputedBecause: '',
    openItems: [],
    evidenceKey: null,
    evidenceFileName: null,
    suppressed: false,
    suppressedReason: '',
    verifiedAt: new Date('2026-11-04T09:30:00.000Z'),
    ...over,
  };
}

describe('whose verdict governs', () => {
  it('keeps the catalogue\'s claim when the firm has recorded nothing', () => {
    const state = resolveVerification(FORM, verificationIndex([]));
    expect(state.status).toBe(FORM.verification.status);
    expect(state.fromFirm).toBe(false);
    expect(state).toEqual(catalogueState(FORM));
  });

  it('takes the firm\'s verdict where there is one, dated by the row and not by hand', () => {
    const state = resolveVerification(FORM, verificationIndex([row()]));
    expect(state.status).toBe('gazette-verified');
    expect(state.fromFirm).toBe(true);
    /* The date printed on the register is the row's own timestamp. A hand-typed date on a
       statutory document is a date that can be wrong. */
    expect(state.on).toBe('2026-11-04');
  });

  it('does not let a bad status in the column become a bad status on the sheet', () => {
    const state = resolveVerification(FORM, verificationIndex([row({ status: 'probably-fine' })]));
    expect(state.status).toBe('unverified');
  });

  it('carries suppression separately from the verdict', () => {
    const state = resolveVerification(
      FORM,
      verificationIndex([row({ status: 'unverified', suppressed: true, suppressedReason: 'Combined register kept instead.' })]),
    );
    expect(state.suppressed).toBe(true);
    expect(verificationLabel(state)).toBe('Not produced');
  });

  it('leaves another form alone', () => {
    const other = formById('in-wages-ix')!;
    expect(resolveVerification(other, verificationIndex([row()])).fromFirm).toBe(false);
  });
});

describe('a moved verdict re-keys its own form and nothing else', () => {
  it('changes the template version when the firm records a check', () => {
    const before = templateVersionFor(FORM);
    const after = templateVersionFor(FORM, resolveVerification(FORM, verificationIndex([row()])));
    expect(after).not.toBe(before);
    expect(after.startsWith(before)).toBe(true);
  });

  it('changes it again when the verdict changes, so the old notice cannot be served', () => {
    const gazette = templateVersionFor(FORM, resolveVerification(FORM, verificationIndex([row()])));
    const sampled = templateVersionFor(
      FORM,
      resolveVerification(FORM, verificationIndex([row({ status: 'checked-against-sample' })])),
    );
    expect(sampled).not.toBe(gazette);
  });

  it('does not change it when only the evidence file was re-uploaded', () => {
    /* Nothing about the attachment is printed on the sheet, so re-keying twenty-nine registers
       for a re-scanned page would be a rebuild producing identical bytes. */
    const a = resolveVerification(FORM, verificationIndex([row()]));
    const b = resolveVerification(FORM, verificationIndex([row({ evidenceKey: 'k', evidenceFileName: 'gazette.pdf' })]));
    expect(verificationFingerprint(b)).toBe(verificationFingerprint(a));
  });

  it('ignores the order open items happen to be in', () => {
    const a = resolveVerification(FORM, verificationIndex([row({ openItems: ['seal', 'signatory'] })]));
    const b = resolveVerification(FORM, verificationIndex([row({ openItems: ['signatory', 'seal'] })]));
    expect(verificationFingerprint(b)).toBe(verificationFingerprint(a));
  });

  it('leaves a form with no verdict on its archetype version', () => {
    const other = formById('in-wages-ix')!;
    expect(templateVersionFor(other)).toBe('v1');
  });
});
