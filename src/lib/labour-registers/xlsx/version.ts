import type { FormArchetype, FormSpec, FormVerification } from '@/data/labour-registers/types';
import { verificationFingerprint } from '../verification';

/**
 * LABOUR REGISTERS — which layout produced a stored document.
 *
 * A document is content-addressed: the same inputs give the same bytes, so a stored file can
 * answer a request instead of a rebuild. That only holds while the code producing the bytes is
 * pinned, and it is pinned in three places, at three different blast radii:
 *
 *  - **This file** versions one archetype's layout. Change the column widths of a wage register
 *    and `wages` goes to `v2`, which re-keys the ten wage forms and leaves the other nineteen
 *    answered from storage.
 *  - **`GENERATOR_REVISION` in `cache-key.ts`** versions the shared frame. Change anything in
 *    `scaffold.ts` — the verification notice, the print setup, the footer — and every register
 *    in the catalogue is re-keyed, because every one of them would now come out different.
 *  - **The firm's verification verdict**, per form, appended by `templateVersionFor` below.
 *
 * Forgetting either is the failure worth guarding against: stored documents quietly stop
 * matching what the code would now produce, and nobody finds out until an inspector has the
 * old one.
 */
const ARCHETYPE_VERSION: Record<FormArchetype, string> = {
  wages: 'v1',
  musterRoll: 'v1',
  combinedWages: 'v1',
  leave: 'v1',
  employment: 'v1',
  wageSlip: 'v1',
  periodicReturn: 'v1',
};

/**
 * The template version for a form, for `DocumentIdentity.templateVersion`.
 *
 * A third blast radius joins the two above, and it is per form rather than per archetype: the
 * verification notice printed at the head of the sheet. A firm recording that it has checked
 * Form XIX against the gazette changes what that sheet says and nothing else, so the verdict's
 * fingerprint is appended here. Leaving it out would mean the next request is answered from
 * storage and prints yesterday's notice — the one case where a stale cache hit is not merely
 * stale but misleading about how far the firm has checked its own register.
 */
export function templateVersionFor(form: FormSpec, verification?: FormVerification): string {
  const base = ARCHETYPE_VERSION[form.archetype] ?? 'v0';
  if (!verification) return base;
  return `${base}-${verificationFingerprint(verification)}`;
}
