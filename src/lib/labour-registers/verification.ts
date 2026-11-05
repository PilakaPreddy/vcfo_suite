import { createHash } from 'node:crypto';

import type { FormSpec, FormVerification } from '@/data/labour-registers/types';

/**
 * LABOUR REGISTERS — the firm's own verdict on a layout, over the catalogue's.
 *
 * Every form ships a `verification` block in `src/data/labour-registers/forms.ts`, and that
 * block is a developer's claim: it says how far a layout was checked, and it can only be
 * changed by editing TypeScript and deploying. That is the wrong shape for what it describes.
 * Deciding that Form XIX matches the prescribed form is a company secretary's professional
 * judgement, made with the gazette open, and it should not wait for a release.
 *
 * So a row in `labour_register_verifications` overrides the catalogue for one form. No row
 * means the catalogue's claim stands, which is why the default is not a migration backfill:
 * there is nothing to backfill, the catalogue already says what it knows.
 *
 * Two things follow from the verdict being printed on the sheet:
 *
 *  - **It is part of the document's content address.** A sheet carries its notice at the head,
 *    above the table. If the verdict moves and the key does not, the next request is answered
 *    from storage and prints yesterday's notice. `verificationFingerprint` goes into
 *    `templateVersion`, so changing one form's verdict re-keys exactly that form.
 *  - **Suppression is a separate decision from the verdict.** A firm may conclude that a form
 *    does not apply to it at all — not that the layout is unsure, but that the register is not
 *    one it owes. That is `suppressed`, it carries a reason, and the generator skips the form
 *    and says so rather than leaving a silent gap.
 */

/** The shape a stored row resolves to, as the rest of the feature wants to read it. */
export interface VerificationState extends FormVerification {
  /** True when the firm has decided this register is not one it owes. */
  suppressed: boolean;
  suppressedReason: string;
  /** The signed or annotated file the verdict rests on, where one was uploaded. */
  evidenceKey: string | null;
  evidenceFileName: string | null;
  /** True when this came from a stored row rather than from the catalogue. */
  fromFirm: boolean;
  verifiedAt: string | null;
}

/** The subset of a stored row this module needs. Keeps the seam out of the domain. */
export interface VerificationRecord {
  formId: string;
  status: string;
  against: string;
  disputedBecause: string;
  openItems: unknown;
  evidenceKey: string | null;
  evidenceFileName: string | null;
  suppressed: boolean;
  suppressedReason: string;
  verifiedAt: Date | string;
}

const STATUSES = new Set(['unverified', 'disputed', 'checked-against-sample', 'gazette-verified']);

function statusOf(raw: string): FormVerification['status'] {
  return STATUSES.has(raw) ? (raw as FormVerification['status']) : 'unverified';
}

function openOf(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** What the catalogue says, as a `VerificationState` with nothing of the firm's in it. */
export function catalogueState(form: FormSpec): VerificationState {
  return {
    ...form.verification,
    suppressed: false,
    suppressedReason: '',
    evidenceKey: null,
    evidenceFileName: null,
    fromFirm: false,
    verifiedAt: null,
  };
}

/** The stored rows, by form id, ready for `resolveVerification`. */
export function verificationIndex(rows: VerificationRecord[]): Map<string, VerificationRecord> {
  return new Map(rows.map((row) => [row.formId, row]));
}

/**
 * The verdict that governs this form: the firm's where it has one, the catalogue's otherwise.
 *
 * `on` is the stored row's own timestamp rather than a date somebody typed. A verdict dated by
 * hand is a verdict that can be dated wrongly, and the date is printed on the register.
 */
export function resolveVerification(
  form: FormSpec,
  index: Map<string, VerificationRecord> | undefined,
): VerificationState {
  const row = index?.get(form.id);
  if (!row) return catalogueState(form);

  const at = row.verifiedAt instanceof Date ? row.verifiedAt.toISOString() : String(row.verifiedAt);
  const open = openOf(row.openItems);
  return {
    status: statusOf(row.status),
    on: at.slice(0, 10),
    against: row.against || undefined,
    disputedBecause: row.disputedBecause || undefined,
    open: open.length ? open : undefined,
    suppressed: row.suppressed,
    suppressedReason: row.suppressedReason,
    evidenceKey: row.evidenceKey,
    evidenceFileName: row.evidenceFileName,
    fromFirm: true,
    verifiedAt: at,
  };
}

/**
 * A short, stable fingerprint of what the sheet will print about verification.
 *
 * Only the printed fields go in. Who recorded the verdict, and the evidence file behind it,
 * are not on the sheet — re-keying twenty-nine registers because a scan was re-uploaded would
 * be a rebuild with no change in the bytes.
 */
export function verificationFingerprint(state: FormVerification): string {
  const printed = JSON.stringify([
    state.status,
    state.on ?? '',
    state.against ?? '',
    state.disputedBecause ?? '',
    (state.open ?? []).slice().sort(),
  ]);
  return createHash('sha256').update(printed).digest('hex').slice(0, 8);
}

/** One line for a screen: how far this form has been checked, and by whom it was decided. */
export function verificationLabel(state: VerificationState): string {
  if (state.suppressed) return 'Not produced';
  switch (state.status) {
    case 'gazette-verified':
      return 'Gazette verified';
    case 'checked-against-sample':
      return 'Checked against a sample';
    case 'disputed':
      return 'Disputed';
    default:
      return 'Unverified';
  }
}
