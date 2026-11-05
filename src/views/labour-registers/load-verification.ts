import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { listVerifications } from '@/db/repositories/labour-registers';
import { FORMS } from '@/data/labour-registers/forms';
import { REGISTER_GAPS } from '@/data/labour-registers/gaps';
import { stateByCode } from '@/data/labour-registers/states';
import { resolveVerification, verificationIndex, verificationLabel } from '@/lib/labour-registers/verification';
import { isAdminOrManager } from '@/lib/auth';
import type { VerificationRow, VerificationView } from './VerificationPage';

/**
 * Every form in the catalogue, with whoever's verdict governs it.
 *
 * The whole catalogue rather than one state's or one period's, because this is a register of
 * what the firm has checked and not a to-do list for a client. Somebody working through the
 * Punjab rules on a Tuesday afternoon is not working on a batch.
 *
 * Sorted so that what needs attention is at the top: disputed first, then unverified, then the
 * ones already settled. A list of thirty-four in catalogue order would bury the three that
 * matter.
 */
const ORDER: Record<string, number> = {
  disputed: 0,
  unverified: 1,
  'checked-against-sample': 2,
  'gazette-verified': 3,
};

/** "All India" for a central form, the state's own name otherwise. */
function jurisdictionName(code: string): string {
  return code === 'IN' ? 'All India' : (stateByCode(code)?.name ?? code);
}

export async function loadVerificationView(ctx: AuthContext): Promise<VerificationView> {
  const index = verificationIndex(await listVerifications(ctx));
  const rows: VerificationRow[] = FORMS.map((form) => {
    const state = resolveVerification(form, index);
    return {
      formId: form.id,
      formNumber: form.formNumber,
      title: form.title,
      act: form.act,
      rule: form.rule,
      regime: form.regime,
      jurisdiction: form.jurisdiction,
      jurisdictionName: jurisdictionName(form.jurisdiction),
      authorityLine: form.authorityLine,
      status: state.status,
      label: verificationLabel(state),
      on: state.on ?? null,
      against: state.against ?? '',
      disputedBecause: state.disputedBecause ?? '',
      open: state.open ?? [],
      suppressed: state.suppressed,
      suppressedReason: state.suppressedReason,
      evidenceFileName: state.evidenceFileName,
      fromFirm: state.fromFirm,
      /* What the catalogue claims, kept beside the firm's verdict so that clearing one is a
         visible choice rather than a jump to an unknown default. */
      catalogueStatus: form.verification.status,
    };
  }).sort(
    (a, b) =>
      (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) ||
      a.act.localeCompare(b.act) ||
      a.formNumber.localeCompare(b.formNumber),
  );

  const count = (status: string) => rows.filter((r) => r.status === status && !r.suppressed).length;

  return {
    rows,
    /* The registers the research named and nobody here has seen. Listed beside what is built,
       because an omission somebody can see is a different thing from one nobody can. */
    gaps: REGISTER_GAPS.map((g) => ({
      id: g.id,
      jurisdiction: g.jurisdiction,
      jurisdictionName: jurisdictionName(g.jurisdiction),
      act: g.act,
      formNumber: g.formNumber,
      title: g.title,
      unknown: g.unknown,
      source: g.source,
    })),
    counts: {
      total: rows.length,
      disputed: count('disputed'),
      unverified: count('unverified'),
      sampled: count('checked-against-sample'),
      gazette: count('gazette-verified'),
      suppressed: rows.filter((r) => r.suppressed).length,
      fromFirm: rows.filter((r) => r.fromFirm).length,
    },
    canWrite: true,
    canClear: isAdminOrManager(ctx.role),
  };
}
