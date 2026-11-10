import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { checklistStateFromRow, getEngagementById } from '@/db/repositories/engagements';
import { applyChecklistPatch } from '@/lib/incorporation/apply-checklist-patch';
import { findSubAgent } from './catalog';

/**
 * SRN WRITE-BACK — a finished run's SRN goes onto its checklist step through the ordinary staff
 * save (`applyChecklistPatch`, the path the checklist autosave and Ask VCFO use), so the same role
 * rules apply and the save is audited.
 *
 * Deliberately small: only a sub-agent with an `srnField` (an existing free-text filing note the
 * lead fills, for example pre-4 `nameApplicationFilingNotes`) writes anything, it appends one line
 * and never replaces what the lead wrote, and it changes no status, review or lock field. A
 * responses-only patch sends no email. Everything else keeps the SRN on the run only.
 */

export function srnLine(srn: string, at: Date): string {
  return `SRN ${srn} (VCFO Assist, ${at.toISOString().slice(0, 10)})`;
}

/** The note with the SRN line appended, or null when the note already names this SRN. */
export function appendSrn(existing: string | undefined, srn: string, at: Date): string | null {
  const text = (existing ?? '').trimEnd();
  if (text.includes(srn)) return null;
  return text ? `${text}\n${srnLine(srn, at)}` : srnLine(srn, at);
}

export type SrnWriteBack = { recorded: true; stepId: string; field: string } | { recorded: false; reason: string };

/**
 * `engagementDbId` is the engagement's uuid as the run repository resolved it, never the URL
 * segment: a slug in the URL is not a uuid, and Postgres would refuse the lookup.
 */
export async function recordRunSrn(
  ctx: AuthContext,
  engagementDbId: string,
  subAgentId: string,
  srn: string,
  at: Date = new Date(),
): Promise<SrnWriteBack> {
  const sub = findSubAgent(subAgentId);
  if (!sub?.stepId || !sub.srnField) return { recorded: false, reason: 'no_step_field' };
  try {
    const row = await getEngagementById(ctx, engagementDbId);
    if (!row) return { recorded: false, reason: 'not_found' };
    const current = checklistStateFromRow(row)[sub.stepId]?.responses?.[sub.srnField];
    const next = appendSrn(typeof current === 'string' ? current : undefined, srn, at);
    if (next === null) return { recorded: true, stepId: sub.stepId, field: sub.srnField };
    await applyChecklistPatch(ctx, engagementDbId, sub.stepId, { responses: { [sub.srnField]: next } });
    return { recorded: true, stepId: sub.stepId, field: sub.srnField };
  } catch (error) {
    // The run keeps the SRN either way; a refused save (a locked step) is reported, not thrown.
    console.warn('[assist-agents] SRN not written to the checklist', error);
    return { recorded: false, reason: 'checklist_refused' };
  }
}
