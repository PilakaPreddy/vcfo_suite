import type { SuperInsightClient } from '@/lib/super/super-insights-model';

/**
 * One client row on Practice · Incorporation (rule R-51). The super admin's insights row
 * (`SuperInsightClient`) carries these fields and more, so the one view serves both the super
 * admin (from `/api/super/insights`) and every other staff role (from the scoped
 * `/api/practice/incorporation`). `summary.href` opens the client's incorporation detail in the
 * caller's own shell.
 */
export type PracticeIncorporationClient = Pick<
  SuperInsightClient,
  'summary' | 'startedPreInc' | 'certificateDate' | 'daysToCoi' | 'nextDueDate'
>;

/** The staff shells that have their own Incorporation page. */
export type PracticeShellBase = '/app/admin' | '/app/manager' | '/app/intern';

/** The client list each staff shell opens from the empty state ("View clients"). */
export function practiceClientsHref(base: PracticeShellBase): string {
  return base === '/app/intern' ? '/app/intern/clients' : `${base}/projects`;
}
