/**
 * Client health score and SLA escalation ladder (docs/specs/automation/IDEAS-PLAN.md, wave 2,
 * section E). Re-exported from src/db/schema.ts so drizzle-kit and the
 * repositories see one schema. Additive only: two new tables, no change to existing ones.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `profiles` and
 * `engagements` may only be touched lazily, inside `.references(() => base.x.id)` callbacks.
 *
 * Tables:
 *  - client_health_scores — one row per engagement: the computed score and band from the nightly
 *                           job (src/jobs/client-health-nightly.ts), the signals behind it, the
 *                           band before the last run, and an optional manual override that a
 *                           manager or admin sets through the `statuses.setClientHealth` card.
 *  - sla_escalations      — one row per SLA ladder notice already sent (item, stage, level), so a
 *                           rerun of the nightly job never notifies the same person twice.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import * as base from './schema';
import type { HealthSignals } from '@/lib/client-health/score';

export const clientHealthScores = pgTable(
  'client_health_scores',
  {
    engagementId: uuid('engagement_id')
      .primaryKey()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** 0 to 100; higher is healthier (src/lib/client-health/score.ts). */
    score: integer('score').notNull(),
    /** good | watch | at_risk | critical, as computed. */
    band: text('band').notNull(),
    /** The inputs and the points each one took off, for the tooltip. */
    signals: jsonb('signals').$type<HealthSignals>().notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    /** A manager's or admin's band, shown instead of the computed one while it is set. */
    overrideBand: text('override_band'),
    overrideReason: text('override_reason'),
    overrideBy: uuid('override_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    overrideAt: timestamp('override_at', { withTimezone: true }),
    /** The computed band before the latest run; null on the first run. */
    previousBand: text('previous_band'),
    /** The partner check-in task opened by the latest fall of two bands or more. */
    checkInTaskId: uuid('check_in_task_id'),
  },
  (t) => ({
    bandIdx: index('client_health_scores_band_idx').on(t.band),
  }),
);

export const slaEscalations = pgTable(
  'sla_escalations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    /** `step:<itemId>`, `instance:<compliance_instances.id>` or `task:<compliance_tasks.id>`. */
    itemKey: text('item_key').notNull(),
    /** The stage and the day its clock started, e.g. `awaiting-client@2026-11-02`. */
    stageLabel: text('stage_label').notNull(),
    /** lead | manager | partner. */
    level: text('level').notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    oncePerLevel: uniqueIndex('sla_escalations_once_idx').on(t.engagementId, t.itemKey, t.stageLabel, t.level),
    engIdx: index('sla_escalations_engagement_idx').on(t.engagementId),
  }),
);

export type ClientHealthRow = typeof clientHealthScores.$inferSelect;
export type SlaEscalationRow = typeof slaEscalations.$inferSelect;
