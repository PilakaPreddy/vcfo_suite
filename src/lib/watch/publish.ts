import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import {
  publishRegUpdate,
  systemGetPipelineUpdate,
  systemMarkNotified,
  systemUpdatesAwaitingSummary,
  systemWatchPeople,
} from '@/db/repositories/reg-updates';
import { roleAnnouncementsPath } from '@/lib/notifications/announcements';
import { bellRecipients, summaryFor } from './recipients';
import type { RegImportance } from './types';

/**
 * Step 9: publish in one action. The board row opens to its audience, the chat card is written, and
 * code picks the recipients. If the bell insert fails the update stays un-notified, so the day's
 * summary still covers it.
 */
export async function publishUpdate(ctx: AuthContext, id: string): Promise<'published' | 'not_ready'> {
  const current = await systemGetPipelineUpdate(id);
  if (!current) return 'not_ready';
  const row = await publishRegUpdate(ctx, id, current.sourceName);
  if (!row) return 'not_ready';
  const importance = (row.importance ?? 'normal') as RegImportance;
  const recipients = bellRecipients(importance, await systemWatchPeople());
  if (recipients.length === 0) return 'published';
  await createNotificationsForUsers(
    recipients.map((person) => ({
      userId: person.id,
      kind: 'watch.update' as const,
      title: row.title.slice(0, 160),
      body: (row.summary ?? '').slice(0, 400),
      engagementId: '',
      companyName: '',
      href: roleAnnouncementsPath(person.role),
    })),
  );
  await systemMarkNotified([id]);
  return 'published';
}

const SUMMARY_TITLES = 5;

/** One bell row per person for everything published since the last run. */
export async function sendDailySummary(): Promise<{ updates: number; rows: number }> {
  const updates = (await systemUpdatesAwaitingSummary()).map((row) => ({
    ...row,
    importance: (row.importance ?? 'normal') as RegImportance,
  }));
  if (updates.length === 0) return { updates: 0, rows: 0 };
  const rows = (await systemWatchPeople()).flatMap((person) => {
    const mine = summaryFor(person, updates);
    if (mine.length === 0) return [];
    const titles = mine.slice(0, SUMMARY_TITLES).map((row) => `• ${row.title}`);
    if (mine.length > SUMMARY_TITLES) titles.push(`and ${mine.length - SUMMARY_TITLES} more`);
    return [
      {
        userId: person.id,
        kind: 'watch.update' as const,
        title: `Official updates today: ${mine.length}`,
        body: titles.join('\n'),
        engagementId: '',
        companyName: '',
        href: roleAnnouncementsPath(person.role),
      },
    ];
  });
  await createNotificationsForUsers(rows);
  await systemMarkNotified(updates.map((row) => row.id));
  return { updates: updates.length, rows: rows.length };
}
