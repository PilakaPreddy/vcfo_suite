import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { syncRecordChangeProposals } from '@/db/repositories/compliance-events';
import { checklistStateFromRow, type EngagementDbRow } from '@/db/repositories/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { sameValue, watchesForItem } from './detect';

/**
 * The checklist save hook for company events (IDEAS-PLAN wave 2, section D). `applyChecklistPatch`
 * calls it after a successful save. When an incorporated company's registered office, auditor or
 * directors changed on this save, it proposes a compliance event (no task yet) and the repository
 * tells the lead to review it.
 *
 * It is additive and never throws: a failure here is logged and the save stands.
 */
export async function proposeEventsFromChecklistSave(
  ctx: AuthContext,
  input: {
    engagement: EngagementDbRow | null | undefined;
    itemId: string;
    prevSlice: ChecklistItemStateSlice | undefined;
    nextSlice: ChecklistItemStateSlice | undefined;
    now?: Date;
  },
): Promise<number> {
  try {
    const watches = watchesForItem(input.itemId);
    if (watches.length === 0 || !input.engagement) return 0;
    if (!isIncorporated(input.engagement, checklistStateFromRow(input.engagement))) return 0;
    const before = input.prevSlice?.responses ?? {};
    const after = input.nextSlice?.responses ?? {};
    const occurredOn = (input.now ?? new Date()).toISOString().slice(0, 10);
    let created = 0;
    for (const watch of watches) {
      const was = watch.read(before);
      const now = watch.read(after);
      if (sameValue(was, now)) continue;
      const rows = await syncRecordChangeProposals(ctx, { engagementId: input.engagement.id, watchKey: watch.key, before: was, after: now, occurredOn });
      created += rows.length;
    }
    return created;
  } catch (err) {
    console.error('[compliance-events] record change hook failed', err);
    return 0;
  }
}
