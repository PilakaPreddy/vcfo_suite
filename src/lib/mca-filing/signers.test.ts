import { describe, expect, it } from 'vitest';
import { FilingRefusal } from './filing-state';
import type { PdfSignatureReport } from './pdf-signatures';
import { checkSignedPdf, knownSigners, namesMatch, type KnownSigner, type SignedPdfInput } from './signers';
import type { AssistProfile } from '@/lib/assist-profile/types';

const sig = (over: Partial<PdfSignatureReport> = {}): PdfSignatureReport => ({
  index: 1,
  signerName: 'ASHA RAO',
  serial: 'AB',
  issuerName: 'CA',
  validFrom: '2025-01-01T00:00:00.000Z',
  validTo: '2027-01-01T00:00:00.000Z',
  signingTime: '2026-11-05T00:00:00.000Z',
  digestAlgorithm: 'sha256',
  digestOk: true,
  signatureOk: true,
  expiredAtSigning: false,
  coversFile: true,
  error: null,
  ...over,
});
const signer = (id: string, name: string): KnownSigner => ({ id, name, email: `${id}@x.test`, role: 'director', hasDsc: true, dscExpiry: null });
const input = (over: Partial<SignedPdfInput> = {}): SignedPdfInput => ({
  signatures: [sig()],
  textHash: 'h1',
  portalTextHash: 'h1',
  signers: [signer('a', 'Asha Rao')],
  professionalName: null,
  ...over,
});
const code = (over: Partial<SignedPdfInput>): string => {
  try {
    checkSignedPdf(input(over));
  } catch (e) {
    if (e instanceof FilingRefusal) return e.code;
    throw e;
  }
  return 'passed';
};

describe('namesMatch', () => {
  it('matches across case, order and a left-out middle name', () => {
    expect(namesMatch('Asha Rao', 'ASHA RAO')).toBe(true);
    expect(namesMatch('Asha Devi Rao', 'ASHA RAO')).toBe(true);
    expect(namesMatch('Rao, Asha', 'Asha Rao')).toBe(true);
  });

  it('does not match on one shared word or an empty name', () => {
    expect(namesMatch('Asha Rao', 'Ravi Rao')).toBe(false);
    expect(namesMatch('Asha Rao', 'Rao')).toBe(false);
    expect(namesMatch('', 'Rao')).toBe(false);
    expect(namesMatch('Madonna', 'MADONNA')).toBe(true);
  });
});

describe('checkSignedPdf refuses by name', () => {
  it.each([
    ['no_portal_pdf', { portalTextHash: undefined }],
    ['no_signature', { signatures: [] }],
    ['digest_mismatch', { signatures: [sig({ digestOk: false })] }],
    ['signature_invalid', { signatures: [sig({ signatureOk: false })] }],
    ['certificate_expired_at_signing', { signatures: [sig({ expiredAtSigning: true })] }],
    ['changed_after_last_signature', { signatures: [sig({ coversFile: false })] }],
    ['unreadable_pdf', { textHash: null }],
    ['unreadable_pdf', { portalTextHash: null }],
    ['text_differs_from_portal_pdf', { textHash: 'other' }],
    ['signer_not_recognised', { signatures: [sig({ signerName: 'STRANGER ONE' }), sig({ index: 2, signerName: 'STRANGER TWO' })] }],
  ] as Array<[string, Partial<SignedPdfInput>]>)('%s', (expected, over) => {
    expect(code(over)).toBe(expected);
  });

  it('refuses one stranger when the professional has already signed', () => {
    expect(code({ professionalName: 'Priya Shah', signatures: [sig({ signerName: 'PRIYA SHAH' }), sig({ index: 2, signerName: 'STRANGER' })] })).toBe('signer_not_recognised');
  });
});

describe('checkSignedPdf passes', () => {
  it('matches a director and lists who is still to sign', () => {
    const { check, matches } = checkSignedPdf(input({ signers: [signer('a', 'Asha Rao'), signer('b', 'Ravi Kumar')] }));
    expect(matches[0]).toMatchObject({ matchedSignerId: 'a', matchedAs: 'director' });
    expect(check).toMatchObject({ signatures: 1, missingSigners: [{ id: 'b', name: 'Ravi Kumar' }], unmatchedSigners: [], trustChain: 'not_checked' });
  });

  it('reads the reviewer as the professional', () => {
    const { matches } = checkSignedPdf(input({ professionalName: 'Priya Shah', signatures: [sig(), sig({ index: 2, signerName: 'PRIYA SHAH' })] }));
    expect(matches[1]).toMatchObject({ matchedAs: 'professional', matchedSignerId: null });
  });

  it('lets one unknown name through for a person to read, since Suite may not hold the professional', () => {
    const { check } = checkSignedPdf(input({ signatures: [sig(), sig({ index: 2, signerName: 'PRIYA SHAH' })] }));
    expect(check.unmatchedSigners).toEqual(['PRIYA SHAH']);
  });

  it('only shows the names when Suite knows no signer', () => {
    const { check } = checkSignedPdf(input({ signers: [], signatures: [sig({ signerName: 'ONE PERSON' }), sig({ index: 2, signerName: 'TWO PERSON' })] }));
    expect(check.unmatchedSigners).toHaveLength(2);
  });

  it('needs only the newest signature to reach the end of the file', () => {
    expect(code({ signatures: [sig({ coversFile: false }), sig({ index: 2 })] })).toBe('passed');
  });
});

describe('knownSigners', () => {
  const profile: AssistProfile = {
    mcaLogin: { userId: '' },
    company: {},
    directors: [{ id: 'd2', index: 2, firstName: 'Ravi', surName: 'Kumar', email: 'ravi@x.test' }],
    subscribers: [
      { id: 'd1', index: 1, kind: 'individual', isDirector: true, firstName: 'Asha', surName: 'Rao', email: 'asha@x.test' },
      { index: 2, kind: 'bodyCorporate', isDirector: false, name: 'Parent Inc', representative: { firstName: 'Meera', surName: 'Nair', email: 'meera@x.test' } },
    ],
    agile: {},
    moa: {},
    aoa: {},
  };
  const directors = [
    { id: 'd1', index: 1, values: { firstName: 'Asha', lastName: 'Rao', hasDsc: 'yes', dscExpiryDate: '2027-01-01', personalMailId: 'asha@x.test' } },
    { id: 'd2', index: 2, values: { firstName: 'Ravi', lastName: 'Kumar', hasDsc: 'no' } },
  ];

  it('lists each person once with what Suite holds, and never the company as a signer', () => {
    const out = knownSigners(profile, directors);
    expect(out.map((s) => s.name)).toEqual(['Asha Rao', 'Ravi Kumar', 'Meera Nair']);
    expect(out[0]).toMatchObject({ id: 'd1', hasDsc: true, dscExpiry: '2027-01-01', email: 'asha@x.test', role: 'director' });
    expect(out[1]).toMatchObject({ hasDsc: false, dscExpiry: null });
    expect(out[2]).toMatchObject({ role: 'representative', hasDsc: null, email: 'meera@x.test' });
  });
});
