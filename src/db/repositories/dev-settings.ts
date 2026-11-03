import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles } from '@/db/schema';
import { devSettings } from '@/db/schema-firm';
import type { AuthContext } from '@/auth/guards';
import { recordAuditEvent } from './audit-events';
import { maskEmail } from '@/lib/dev/mask';
import { assertDeveloper } from './dev-scope';

/**
 * DEV SETTINGS — the developer console's switches (`dev_settings`), one row per key (G-01).
 *
 * Access: developer or super admin read and write through `*ForDev`. The background jobs
 * read through `systemJobsPaused`, which takes no AuthContext because no person runs a job.
 * Every change writes a `dev.setting.change` audit row with the value before and after.
 */

/** The keys the console knows. A new switch adds its key here. */
const DEV_SETTING_KEYS = ['jobs.paused', 'connections.test_to'] as const;
export type DevSettingKey = (typeof DEV_SETTING_KEYS)[number];

export interface DevSwitch {
  on: boolean;
  by: string | null;
  at: string | null;
}

function onOf(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { on?: unknown }).on === true);
}

export async function getDevSwitchForDev(ctx: AuthContext, key: DevSettingKey): Promise<DevSwitch> {
  assertDeveloper(ctx);
  const [row] = await db
    .select({ value: devSettings.value, at: devSettings.updatedAt, by: profiles.name })
    .from(devSettings)
    .leftJoin(profiles, eq(profiles.id, devSettings.updatedBy))
    .where(eq(devSettings.key, key))
    .limit(1);
  return { on: onOf(row?.value), by: row?.by ?? null, at: row?.at ? row.at.toISOString() : null };
}

export async function setDevSwitchForDev(ctx: AuthContext, key: DevSettingKey, on: boolean): Promise<DevSwitch> {
  assertDeveloper(ctx);
  const before = await getDevSwitchForDev(ctx, key);
  const now = new Date();
  await db
    .insert(devSettings)
    .values({ key, value: { on }, updatedBy: ctx.userId, updatedAt: now })
    .onConflictDoUpdate({ target: devSettings.key, set: { value: { on }, updatedBy: ctx.userId, updatedAt: now } });
  await recordAuditEvent(ctx, {
    action: 'dev.setting.change',
    summary: `${key} turned ${on ? 'on' : 'off'}`,
    metadata: { key, before: before.on ? 'On' : 'Off', after: on ? 'On' : 'Off' },
  });
  return { on, by: ctx.name || null, at: now.toISOString() };
}

/**
 * True while "Pause all jobs" is on. For the Inngest functions in `src/jobs/`: a job that
 * sends reminders or mail should return early when this is true. A read failure counts as
 * not paused, so a database hiccup never silences reminders by itself.
 */
export async function systemJobsPaused(): Promise<boolean> {
  try {
    const [row] = await db.select({ value: devSettings.value }).from(devSettings).where(eq(devSettings.key, 'jobs.paused')).limit(1);
    return onOf(row?.value);
  } catch {
    return false;
  }
}

/** The address "Send a test" uses by default (Access › Console settings), or null. */
export async function getTestMailToForDev(ctx: AuthContext): Promise<string | null> {
  assertDeveloper(ctx);
  const [row] = await db.select({ value: devSettings.value }).from(devSettings).where(eq(devSettings.key, 'connections.test_to')).limit(1);
  const v = row?.value as { to?: unknown } | undefined;
  return typeof v?.to === 'string' && v.to ? v.to : null;
}

/** Save the test mail address (null clears it). Audited with the addresses masked. */
export async function setTestMailToForDev(ctx: AuthContext, to: string | null): Promise<void> {
  assertDeveloper(ctx);
  const before = await getTestMailToForDev(ctx);
  const now = new Date();
  await db
    .insert(devSettings)
    .values({ key: 'connections.test_to', value: { to }, updatedBy: ctx.userId, updatedAt: now })
    .onConflictDoUpdate({ target: devSettings.key, set: { value: { to }, updatedBy: ctx.userId, updatedAt: now } });
  await recordAuditEvent(ctx, {
    action: 'dev.setting.change',
    summary: 'Test mail address changed',
    metadata: { key: 'connections.test_to', before: before ? maskEmail(before) : 'None', after: to ? maskEmail(to) : 'None' },
  });
}
