import type { FormSpec } from '@/data/labour-registers/types';
import type { FormArchetype } from '@/data/labour-registers/types';

/**
 * LABOUR REGISTERS — which layout produced a stored document.
 *
 * A document is content-addressed: the same inputs give the same bytes, so a stored file can
 * answer a request instead of a rebuild. That only holds while the code producing the bytes is
 * pinned, and it is pinned in two places, at two different blast radii:
 *
 *  - **This file** versions one archetype's layout. Change the column widths of a wage register
 *    and `wages` goes to `v2`, which re-keys the ten wage forms and leaves the other nineteen
 *    answered from storage.
 *  - **`GENERATOR_REVISION` in `cache-key.ts`** versions the shared frame. Change anything in
 *    `scaffold.ts` — the verification notice, the print setup, the footer — and every register
 *    in the catalogue is re-keyed, because every one of them would now come out different.
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
  /* Not built. A key is still returned so nothing has to special-case them. */
  wageSlip: 'v0',
  periodicReturn: 'v0',
};

/** The template version for a form, for `DocumentIdentity.templateVersion`. */
export function templateVersionFor(form: FormSpec): string {
  return ARCHETYPE_VERSION[form.archetype] ?? 'v0';
}
