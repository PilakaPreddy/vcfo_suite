import { z } from 'zod';
import { containsPersonalData } from './pii';
import { ASSIST_AGENT_RUN_STATUSES, ASSIST_HEAL_TIERS, ASSIST_PATCH_TIERS } from './types';

/**
 * Request bodies of the VCFO Assist agent routes (docs/specs/vcfo-assist-agents/API.md). Pure, so
 * the extension builder and the tests read the same shapes. Every free-text part is labels only:
 * a body that looks like it carries personal data is refused with `personal_data`.
 */

/**
 * Refuses personal data in the body's free text only. `texts` picks the label-like strings (names,
 * labels, refusal targets, errors, patch evidence); ids, versions, enums and the SRN are never
 * checked, because a uuid whose first group is all digits looks like a DIN or an Aadhaar number,
 * and the SRN is a filing reference that can look like a passport number.
 */
const labelsOnly = <T extends z.ZodTypeAny>(schema: T, texts: (value: z.infer<T>) => unknown) =>
  schema.refine((value) => !containsPersonalData(texts(value)), { message: 'personal_data' });

const SRN = /^[A-Z0-9]{6,20}$/;
const STATE = /^[A-Z][A-Z0-9_]{0,39}$/;

export const createAgentRunSchema = z
  .object({
    subAgent: z.string().trim().min(1).max(40),
    /** The host of the portal tab the run fills; live hosts are refused until enabled. */
    portalHost: z.string().trim().min(1).max(200),
    /** The recipe version the extension holds; a stale one is refused with `recipe_outdated`. */
    recipeVersion: z.string().trim().max(20).optional(),
    fieldsTotal: z.number().int().min(0).max(1000).optional(),
    state: z.string().regex(STATE).optional(),
  })
  .strict();

const healSchema = z.object({ field: z.string().min(1).max(120), tier: z.enum(ASSIST_HEAL_TIERS), ok: z.boolean() }).strict();
const refusalSchema = z.object({ kind: z.string().min(1).max(40), target: z.string().max(200).optional(), at: z.string().max(40).optional() }).strict();

export const updateAgentRunSchema = labelsOnly(
  z
    .object({
      status: z.enum(ASSIST_AGENT_RUN_STATUSES).optional(),
      state: z.string().regex(STATE).optional(),
      fieldsTotal: z.number().int().min(0).max(1000).optional(),
      fieldsFilled: z.number().int().min(0).max(1000).optional(),
      heals: z.array(healSchema).max(200).optional(),
      refusals: z.array(refusalSchema).max(100).optional(),
      srn: z.string().trim().toUpperCase().regex(SRN, { message: 'srn_shape' }).nullable().optional(),
      error: z.string().max(500).nullable().optional(),
    })
    .strict(),
  (body) => [body.error, body.heals?.map((h) => h.field), body.refusals?.map((r) => [r.kind, r.target])],
);

export const proposePatchSchema = labelsOnly(
  z
    .object({
      recipeId: z.string().trim().min(1).max(60),
      recipeVersion: z.string().trim().min(1).max(20),
      fieldKey: z.string().trim().min(1).max(120),
      proposed: z
        .object({ som: z.string().max(400).optional(), css: z.string().max(400).optional(), label: z.string().max(200).optional() })
        .strict()
        .refine((p) => Boolean(p.som || p.css || p.label), { message: 'proposed_empty' }),
      evidence: z
        .object({
          fieldLabel: z.string().max(200).optional(),
          candidateLabels: z.array(z.string().max(200)).max(40).optional(),
          chosenLabel: z.string().max(200).optional(),
          confidence: z.number().min(0).max(1).optional(),
          note: z.string().max(500).optional(),
        })
        .strict()
        .default({}),
      sourceTier: z.enum(ASSIST_PATCH_TIERS),
      runId: z.string().uuid().optional(),
    })
    .strict(),
  (body) => [body.fieldKey, body.proposed, body.evidence],
);

export const reviewPatchSchema = z.object({ decision: z.enum(['approved', 'rejected']) }).strict();
