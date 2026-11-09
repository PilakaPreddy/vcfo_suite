/**
 * VCFO Assist agents (docs/specs/vcfo-assist-agents/PLAN.md): the run log and the recipe patch
 * review queue. Re-exported from src/db/schema.ts.
 *
 * Circular import note: this file is evaluated BEFORE schema.ts's body, so `base.*` may only be
 * touched lazily, inside `.references(() => base.profiles.id)` callbacks.
 *
 * Tables:
 *  - assist_agent_runs      one sub-agent run in the extension, with its counters and the SRN it read.
 *  - assist_recipe_patches  a field fix the heal ladder found (T1, T3 or T4); staff approve or reject it.
 *
 * `assist_agent_runs` is not `assist_runs` (0029, `schema-portal-compliances.ts`): that older table is
 * the "Start filing" state per filing period or registration, which clients also read. Agent runs
 * are staff-only telemetry (heals, refusals, tokens) keyed by catalog sub-agent and recipe.
 *
 * Neither table holds a profile value. Heals and evidence carry field keys and labels only.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { AssistHeal, AssistPatchEvidence, AssistPatchProposal, AssistRefusal } from '@/lib/assist-agents/types';
import * as base from './schema';

export const assistAgentRuns = pgTable(
  'assist_agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    engagementId: uuid('engagement_id')
      .notNull()
      .references(() => base.engagements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => base.profiles.id, { onDelete: 'cascade' }),
    /** Catalog agent id, for example `incorporation`. */
    agent: text('agent').notNull(),
    /** Catalog sub-agent id, for example `spice-a`. */
    subAgent: text('sub_agent').notNull(),
    recipeId: text('recipe_id').notNull(),
    recipeVersion: text('recipe_version').notNull(),
    status: text('status').notNull().default('running'), // running|waiting_user|done|failed|cancelled
    /** The run engine's state name, for example `FILL` or `WAIT_DSC`. */
    state: text('state').notNull().default('READY'),
    fieldsTotal: integer('fields_total').notNull().default(0),
    fieldsFilled: integer('fields_filled').notNull().default(0),
    heals: jsonb('heals').$type<AssistHeal[]>().notNull().default([]),
    refusals: jsonb('refusals').$type<AssistRefusal[]>().notNull().default([]),
    aiCalls: integer('ai_calls').notNull().default(0),
    aiTokens: integer('ai_tokens').notNull().default(0),
    srn: text('srn'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    engagementIdx: index('assist_agent_runs_engagement_idx').on(t.engagementId, t.startedAt),
    userIdx: index('assist_agent_runs_user_idx').on(t.userId),
    startedIdx: index('assist_agent_runs_started_idx').on(t.startedAt),
  }),
);

export const assistRecipePatches = pgTable(
  'assist_recipe_patches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: text('recipe_id').notNull(),
    recipeVersion: text('recipe_version').notNull(),
    fieldKey: text('field_key').notNull(),
    /** `{ som?, css?, label? }`: what the recipe field should become. */
    proposed: jsonb('proposed').$type<AssistPatchProposal>().notNull(),
    /** Labels only, never a value. */
    evidence: jsonb('evidence').$type<AssistPatchEvidence>().notNull().default({}),
    sourceTier: text('source_tier').notNull(), // T1|T3|T4
    runId: uuid('run_id').references((): AnyPgColumn => assistAgentRuns.id, { onDelete: 'set null' }),
    proposedBy: uuid('proposed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('proposed'), // proposed|approved|rejected
    reviewedBy: uuid('reviewed_by').references(() => base.profiles.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('assist_recipe_patches_status_idx').on(t.status, t.createdAt),
    recipeIdx: index('assist_recipe_patches_recipe_idx').on(t.recipeId, t.fieldKey),
    runIdx: index('assist_recipe_patches_run_idx').on(t.runId),
    proposedByIdx: index('assist_recipe_patches_proposed_by_idx').on(t.proposedBy),
    reviewedByIdx: index('assist_recipe_patches_reviewed_by_idx').on(t.reviewedBy),
  }),
);
