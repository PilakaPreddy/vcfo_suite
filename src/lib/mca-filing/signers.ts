import type { AssistProfile } from '@/lib/assist-profile/types';
import type { ProposedDirector } from '@/lib/incorporation/proposed-directors';
import { displayName } from '@/lib/incorporation/proposed-directors';
import type { PdfSignatureReport } from '@/lib/mca-filing/pdf-signatures';
import { FilingRefusal } from '@/lib/mca-filing/filing-state';

/**
 * SIGNERS — pure. Who Suite knows should sign a SPICe+ form, and the checks a signed PDF must
 * pass. A signature is read, never made here. The trust chain to the CCA root is not checked
 * (`pdf-signatures.ts`), so a recognised name is a match on the certificate's name only.
 */

export interface KnownSigner {
  /** The `pre-15` director entry id, or a subscriber key. Safe to send to the browser. */
  id: string;
  name: string;
  email: string | null;
  role: 'director' | 'subscriber' | 'representative';
  /** What Suite holds about the DSC; null when it holds nothing. */
  hasDsc: boolean | null;
  dscExpiry: string | null;
}

const clean = (v: string | undefined | null) => (v ?? '').trim();
const personName = (p: { firstName?: string; middleName?: string; surName?: string }) =>
  [p.firstName, p.middleName, p.surName].map(clean).filter(Boolean).join(' ');

function dscOf(director: ProposedDirector | undefined): Pick<KnownSigner, 'hasDsc' | 'dscExpiry'> {
  const has = clean(director?.values.hasDsc).toLowerCase();
  return {
    hasDsc: has === 'yes' ? true : has === 'no' ? false : null,
    dscExpiry: clean(director?.values.dscExpiryDate) || null,
  };
}

function directorEmail(director: ProposedDirector | undefined): string | null {
  return clean(director?.values.personalMailId) || clean(director?.values.officialMailId) || null;
}

/** Everyone the profile and the director list name as a signer, each once. */
export function knownSigners(profile: AssistProfile, directors: ProposedDirector[]): KnownSigner[] {
  const out: KnownSigner[] = [];
  const byId = new Map(directors.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const push = (s: KnownSigner) => {
    const key = nameTokens(s.name).join(' ');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const d of directors) {
    push({ id: d.id, name: displayName(d.values), email: directorEmail(d), role: 'director', ...dscOf(d) });
  }
  for (const d of profile.directors) {
    push({ id: d.id, name: personName(d), email: clean(d.email) || directorEmail(byId.get(d.id)), role: 'director', ...dscOf(byId.get(d.id)) });
  }
  for (const s of profile.subscribers) {
    if (s.kind === 'bodyCorporate') {
      if (s.representative) {
        push({ id: `subscriber-${s.index}-representative`, name: personName(s.representative), email: clean(s.representative.email) || null, role: 'representative', hasDsc: null, dscExpiry: null });
      }
      continue;
    }
    const director = s.id ? byId.get(s.id) : undefined;
    push({ id: s.id ?? `subscriber-${s.index}`, name: personName(s), email: clean(s.email) || directorEmail(director), role: s.isDirector ? 'director' : 'subscriber', ...dscOf(director) });
  }
  return out;
}

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * A DSC often leaves out a middle name or adds one, so the shorter name must sit wholly inside the
 * longer one and hold at least two words, unless both are the same single word.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 1) return long.length === 1 && long[0] === short[0];
  const pool = new Set(long);
  return short.every((t) => pool.has(t));
}

export interface SignerMatch extends PdfSignatureReport {
  matchedSignerId: string | null;
  matchedAs: 'director' | 'subscriber' | 'representative' | 'professional' | null;
}

export interface SignedPdfCheck {
  signatures: number;
  textMatchesPortalPdf: true;
  /** Known signers with no signature in this file yet. */
  missingSigners: Array<{ id: string; name: string }>;
  /** A signature no known name matched. At most one, read as the professional; check it by hand. */
  unmatchedSigners: string[];
  /** Plain statement kept with the record. */
  trustChain: 'not_checked';
}

export interface SignedPdfInput {
  signatures: PdfSignatureReport[];
  /** Null when the signed file has no readable text. */
  textHash: string | null;
  /** The latest portal PDF's text hash; undefined when no portal PDF exists. */
  portalTextHash: string | null | undefined;
  signers: KnownSigner[];
  /** The person who recorded the professional approval. */
  professionalName: string | null;
}

/** Every check on a signed upload, in order. Throws a named FilingRefusal, or returns the check. */
export function checkSignedPdf(input: SignedPdfInput): { check: SignedPdfCheck; matches: SignerMatch[] } {
  const { signatures, textHash, portalTextHash, signers, professionalName } = input;
  if (portalTextHash === undefined) throw new FilingRefusal('no_portal_pdf', 'Add the unsigned PDF from the portal before a signed copy.');
  if (signatures.length === 0) throw new FilingRefusal('no_signature', 'This PDF has no digital signature.', 422);

  for (const s of signatures) {
    const who = s.signerName ?? `Signature ${s.index}`;
    if (!s.digestOk) throw new FilingRefusal('digest_mismatch', `${who}: the file was changed after this signature was made.`, 422);
    if (!s.signatureOk) throw new FilingRefusal('signature_invalid', `${who}: the signature does not verify with its certificate.`, 422);
    if (s.expiredAtSigning === true) throw new FilingRefusal('certificate_expired_at_signing', `${who}: the certificate was not valid when this signature was made.`, 422);
  }
  // The newest signature must reach the end of the file; earlier ones cannot, by design.
  if (!signatures[signatures.length - 1]!.coversFile) {
    throw new FilingRefusal('changed_after_last_signature', 'Content was added to the file after the last signature.', 422);
  }

  if (textHash === null || portalTextHash === null) {
    throw new FilingRefusal('unreadable_pdf', 'The text of the signed or the portal PDF cannot be read, so they cannot be compared.', 422);
  }
  if (textHash !== portalTextHash) {
    throw new FilingRefusal('text_differs_from_portal_pdf', 'The signed PDF does not read the same as the latest portal PDF. Sign the latest one.', 422);
  }

  const matches: SignerMatch[] = signatures.map((s) => {
    const signer = s.signerName ? signers.find((k) => namesMatch(k.name, s.signerName!)) : undefined;
    if (signer) return { ...s, matchedSignerId: signer.id, matchedAs: signer.role };
    if (s.signerName && professionalName && namesMatch(professionalName, s.signerName)) return { ...s, matchedSignerId: null, matchedAs: 'professional' };
    return { ...s, matchedSignerId: null, matchedAs: null };
  });

  // Suite does not hold the certifying professional's name unless that person recorded the
  // approval, so one unknown name is allowed through for a person to read. With no signers on
  // record there is nothing to match against, and the names are only shown.
  const unmatched = matches.filter((m) => !m.matchedAs);
  const professionalFound = matches.some((m) => m.matchedAs === 'professional');
  if (signers.length > 0 && (unmatched.length > 1 || (unmatched.length === 1 && professionalFound))) {
    const names = unmatched.map((m) => m.signerName ?? `Signature ${m.index}`).join(', ');
    throw new FilingRefusal('signer_not_recognised', `Not a director, subscriber or the professional on this filing: ${names}.`, 422);
  }

  const signedIds = new Set(matches.map((m) => m.matchedSignerId).filter(Boolean));
  return {
    matches,
    check: {
      signatures: signatures.length,
      textMatchesPortalPdf: true,
      missingSigners: signers.filter((k) => !signedIds.has(k.id)).map((k) => ({ id: k.id, name: k.name })),
      unmatchedSigners: unmatched.map((m) => m.signerName ?? `Signature ${m.index}`),
      trustChain: 'not_checked',
    },
  };
}
