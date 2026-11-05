import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { notificationPrefs, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';

/**
 * CLIENT ACCOUNT EXTRAS (client portal Profile: About you and Notifications).
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Client role only, owner only: every read and write is keyed by `ctx.userId`;
 * no caller-supplied profile id exists. Staff use their own account route.
 *   designation — `profiles.designation` (C-821), free text up to 80 characters.
 *   remindDays  — `notification_prefs.remind_days` (C-831): 7, 3 or 1 days
 *                 before a due date; null means the firm default.
 */

const REMIND_DAYS = [7, 3, 1] as const;
export type RemindDays = (typeof REMIND_DAYS)[number];

export interface ClientAccountExtras {
  designation: string | null;
  remindDays: RemindDays | null;
}

export class ClientAccountError extends Error {
  constructor(
    message: string,
    public status: 400 | 403 = 400,
  ) {
    super(message);
  }
}

function assertClient(ctx: AuthContext) {
  if (ctx.role !== 'client') throw new ClientAccountError('This is for client accounts', 403);
}

function asRemind(v: number | null | undefined): RemindDays | null {
  return v === 7 || v === 3 || v === 1 ? v : null;
}

export async function getOwnClientAccount(ctx: AuthContext): Promise<ClientAccountExtras> {
  assertClient(ctx);
  const [p] = await db.select({ designation: profiles.designation }).from(profiles).where(eq(profiles.id, ctx.userId)).limit(1);
  const [n] = await db
    .select({ remindDays: notificationPrefs.remindDays })
    .from(notificationPrefs)
    .where(eq(notificationPrefs.profileId, ctx.userId))
    .limit(1);
  return { designation: p?.designation?.trim() || null, remindDays: asRemind(n?.remindDays) };
}

export async function updateOwnClientAccount(
  ctx: AuthContext,
  patch: { designation?: string | null; remindDays?: number | null },
): Promise<ClientAccountExtras> {
  assertClient(ctx);
  const now = new Date();
  if (patch.designation !== undefined) {
    const designation = patch.designation?.trim().slice(0, 80) || null;
    await db
      .update(profiles)
      .set({ designation, updatedAt: now })
      .where(and(eq(profiles.id, ctx.userId), eq(profiles.role, 'client')));
  }
  if (patch.remindDays !== undefined) {
    if (patch.remindDays !== null && !REMIND_DAYS.includes(patch.remindDays as RemindDays)) {
      throw new ClientAccountError('Pick 7, 3 or 1 days');
    }
    const remindDays = patch.remindDays;
    await db
      .insert(notificationPrefs)
      .values({ profileId: ctx.userId, remindDays, updatedAt: now })
      .onConflictDoUpdate({ target: notificationPrefs.profileId, set: { remindDays, updatedAt: now } });
  }
  return getOwnClientAccount(ctx);
}
