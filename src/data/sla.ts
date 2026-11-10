/**
 * SLA DAYS PER STAGE (IDEAS-PLAN wave 2, section E). Pure data for the SLA escalation ladder in
 * src/lib/client-health/sla.ts. All values are calendar days.
 *
 * A checklist step is on the clock while it is in progress, waiting on the client, or waiting on
 * a manager's review. Its SLA comes from, in order:
 *   1. the manager-set window for the step (`engagements.schedule.steps[itemId]`), from FROM to TO;
 *   2. for work in progress, the playbook timeline on the step (`expectedTimeline`, for example
 *      "2–3 working days"), taking the upper figure and turning working days into calendar days;
 *   3. otherwise the stage default below.
 *
 * A statutory compliance, a compliance task or an event filing is on the clock from the start of
 * its working window (its manager-set window, its task start date, or `COMPLIANCE_WORK_DAYS`
 * before the due date) until its due date. The due date is therefore 1x the SLA, so the lead
 * hears on the due date, the manager one window later and the partner two windows later.
 */

export type SlaStage = 'in-progress' | 'awaiting-client' | 'review' | 'compliance';

export const SLA_STAGE_LABEL: Record<SlaStage, string> = {
  'in-progress': 'In progress',
  'awaiting-client': 'Waiting on the client',
  review: 'Waiting for review',
  compliance: 'Compliance due',
};

/** Default SLA in calendar days when nothing more specific is known. */
export const STAGE_SLA_DAYS: Record<SlaStage, number> = {
  'in-progress': 7,
  'awaiting-client': 5,
  review: 2,
  compliance: 7,
};

/** Working days before a compliance due date that count as its working window, when none is set. */
export const COMPLIANCE_WORK_DAYS = 7;

/** The ladder: who hears at which multiple of the SLA. */
export const SLA_LADDER = [
  { level: 'lead', multiple: 1 },
  { level: 'manager', multiple: 2 },
  { level: 'partner', multiple: 3 },
] as const;

export type SlaLevel = (typeof SLA_LADDER)[number]['level'];

export const SLA_LEVEL_LABEL: Record<SlaLevel, string> = { lead: 'Lead', manager: 'Manager', partner: 'Partner' };

/**
 * Calendar days from a playbook timeline such as "2–3 working days", "5 working days" or
 * "1 week". Returns null when the text has no number.
 */
export function slaDaysFromTimeline(text: string | null | undefined): number | null {
  if (!text) return null;
  const nums = [...text.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  const top = Math.max(...nums);
  if (/week/i.test(text)) return Math.ceil(top * 7);
  if (/working|business/i.test(text)) return Math.ceil((top * 7) / 5);
  return Math.ceil(top);
}
