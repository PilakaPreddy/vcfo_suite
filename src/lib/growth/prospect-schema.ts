import { z } from 'zod';
import { PROSPECT_SERVICES, PROSPECT_SOURCES, PROSPECT_STAGES } from './pipeline';

/**
 * Request bodies for `app/api/super/growth/prospects/**` (G-21). Blank optional strings are
 * stored as null. There is no fee field (R-37).
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null));

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

const prospectFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(160),
  company: optionalText(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email')
    .max(200)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  phone: optionalText(40),
  source: z.enum(PROSPECT_SOURCES).optional(),
  stage: z.enum(PROSPECT_STAGES).optional(),
  service: z.enum(PROSPECT_SERVICES).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  notes: optionalText(4000),
  nextStepOn: day,
});

export const prospectCreateSchema = z.union([
  z.object({ demoRequestId: z.string().uuid(), ownerId: z.string().uuid().nullable().optional() }),
  prospectFieldsSchema,
]);

export const prospectPatchSchema = prospectFieldsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const prospectConvertSchema = z.object({
  engagementId: z.string().trim().min(1, 'Pick an engagement').max(80),
});
