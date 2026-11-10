import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { deriveStuckReason } from '@/lib/projects/project-stuck';
import type { HealthInputs } from './score';

/**
 * Turns the raw counts the repository reads for one client (src/db/repositories/client-health.ts,
 * `systemRawHealthCounts`) into the score inputs. PURE, so the rules are tested without a db.
 *
 *  - Oldest open request: whole days since the oldest pending document request was made. Request
 *    list items of the document kind create document requests when the list is sent, so they
 *    count here too.
 *  - Client silence: whole days since the later of the client's last message and last upload.
 *    A client who has never replied counts from the day the engagement was created, once a week
 *    has passed; before that the signal is not counted.
 *  - Overdue compliances: statutory instances, compliance tasks and event filings past their due
 *    date and not filed or completed.
 *  - Open notices: as counted; null when the notice desk is not available.
 *  - Late receivables: receivable sheets belong to client organisations, not to engagements, so
 *    nothing links them yet and the signal is always null (left out).
 *  - Stuck: `deriveStuckReason` on the incorporation checklist while the client is incorporating;
 *    null once the client is in Operational Readiness (compliance only).
 */

export interface RawCounts {
  oldestRequestAt: Date | string | null;
  lastClientMessageAt: Date | string | null;
  lastClientUploadAt: Date | string | null;
  overdueInstances: number;
  overdueTasks: number;
  overdueEvents: number;
  openNotices: number | null;
}

const DAY = 86_400_000;

function wholeDays(from: Date | string | null | undefined, now: Date): number | null {
  if (!from) return null;
  const t = from instanceof Date ? from.getTime() : Date.parse(from);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

function later(a: Date | string | null, b: Date | string | null): Date | string | null {
  if (!a) return b;
  if (!b) return a;
  const ta = a instanceof Date ? a.getTime() : Date.parse(a);
  const tb = b instanceof Date ? b.getTime() : Date.parse(b);
  return ta >= tb ? a : b;
}

export function healthInputsFrom(input: {
  raw: RawCounts | undefined;
  engagement: { stage: string; createdAt: Date | string };
  checklistState: Record<string, ChecklistItemStateSlice>;
  /** False when the notice table could not be read; the signal is then left out. */
  noticesAvailable: boolean;
  now: Date;
}): HealthInputs {
  const raw = input.raw;
  const lastActivity = later(raw?.lastClientMessageAt ?? null, raw?.lastClientUploadAt ?? null);
  let silence = wholeDays(lastActivity, input.now);
  if (silence == null) {
    const age = wholeDays(input.engagement.createdAt, input.now);
    silence = age != null && age >= 7 ? age : null;
  }
  const incorporating = input.engagement.stage !== 'Operational Readiness';
  return {
    oldestRequestDays: wholeDays(raw?.oldestRequestAt ?? null, input.now),
    daysSinceClientActivity: silence,
    overdueCompliances: (raw?.overdueInstances ?? 0) + (raw?.overdueTasks ?? 0) + (raw?.overdueEvents ?? 0),
    // When the job read the notice table, a client with no row has none open.
    openNotices: input.noticesAvailable ? (raw?.openNotices ?? 0) : null,
    lateReceivables: null,
    stuck: incorporating ? deriveStuckReason({ stage: input.engagement.stage } as Engagement, input.checklistState) : null,
  };
}
