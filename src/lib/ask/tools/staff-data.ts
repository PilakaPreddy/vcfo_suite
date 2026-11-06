import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { listChecklistIndex, listEngagements, toAppEngagement } from '@/db/repositories/engagements';
import { getFilings } from '@/db/repositories/filings';
import type { StaffData, StaffEngagement } from './staff';

/** Live engagements with their checklist state, as far as the caller's scope reaches. */
export async function loadStaffEngagements(ctx: AuthContext): Promise<StaffEngagement[]> {
  const [rows, index] = await Promise.all([listEngagements(ctx), listChecklistIndex(ctx)]);
  return rows
    .filter((row) => !row.deletedAt)
    .map((row) => {
      const app = toAppEngagement(row);
      return { dbId: row.id, engagement: app, state: index[app.id] ?? {} };
    });
}

/**
 * The read behind the staff tools, through the same scoped repositories the
 * dashboards use: firm-wide for admins, their own projects for a manager or lead.
 */
export async function loadStaffData(ctx: AuthContext, now: Date = new Date()): Promise<StaffData> {
  const [engagements, filings] = await Promise.all([
    loadStaffEngagements(ctx),
    getFilings(ctx).catch((error) => {
      console.warn('[ask-vcfo] staff filings unavailable', error);
      return { rows: [], companies: [] };
    }),
  ]);
  return { engagements, filings: filings.rows, now };
}
