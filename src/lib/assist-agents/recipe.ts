import { z } from 'zod';

/**
 * RECIPE FORMAT — the cached, versioned field map one sub-agent fills a portal form from
 * (docs/specs/vcfo-assist-agents/PLAN.md §1). Pure: no db, no fetch, so the extension builder can
 * mirror the schema and the tests can parse every recipe file.
 *
 * A recipe never carries a value. `fields[].key` names a key in the Assist profile
 * (`src/lib/assist-profile/types.ts`, dotted, `[n]` for an array entry); the filler reads the value
 * from the profile inside the browser. `som` is the AEM Adaptive Forms SOM path the main-world
 * filler hands to `guideBridge.resolveNode`; `css` is the DOM fallback.
 */

/** The transforms the filler knows. Each maps one profile value to the portal's wording. */
export const RECIPE_TRANSFORMS = [
  'none',
  /** `DD/MM/YYYY` (the profile's date shape) to the portal's date. */
  'toMcaDate',
  /** A number to a rupee amount with no decimals. */
  'rupeeAmount',
  /** A Suite word to the MCA list word (`src/lib/assist-profile/vocabulary.ts`). */
  'vocabulary',
  /** A NIC-2008 code to its two-digit main division. */
  'nicDivision',
  /** A boolean to the portal's Yes / No. */
  'yesNo',
  'upper',
] as const;
export type RecipeTransform = (typeof RECIPE_TRANSFORMS)[number];

/** Human-only gates: the run stops and the panel shows a "You do this" card. */
export const RECIPE_GATES = ['LOGIN', 'DSC', 'SUBMIT', 'PAY'] as const;
export type RecipeGate = (typeof RECIPE_GATES)[number];

const SEMVER = /^\d+\.\d+\.\d+$/;
const KEY = /^[a-z][a-zA-Z0-9]*(\[\d+\])?(\.[a-zA-Z][a-zA-Z0-9]*(\[\d+\])?)*$/;
const ID = /^[a-z0-9][a-z0-9-]*$/;

/** How to find one element: a SOM path, a CSS selector, or the visible text of a button. */
const matchSchema = z
  .object({
    som: z.string().min(1).optional(),
    css: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .strict()
  .refine((m) => Boolean(m.som || m.css || m.text), { message: 'match_needs_som_css_or_text' });

const pageSchema = z
  .object({
    id: z.string().regex(ID),
    title: z.string().min(1),
    /** A glob on the path after the host, for example `/content/mca/.../spice-plus*`. */
    urlPattern: z.string().min(1),
    /** The page is ready when this element exists. */
    ready: matchSchema,
  })
  .strict();

const fieldSchema = z
  .object({
    key: z.string().regex(KEY, { message: 'field_key_shape' }),
    page: z.string().regex(ID).optional(),
    som: z.string().min(1),
    css: z.string().min(1).optional(),
    label: z.string().min(1),
    transform: z.enum(RECIPE_TRANSFORMS).optional(),
    required: z.boolean(),
    /**
     * The profile cannot supply this field, so the panel asks the user to answer it on the portal.
     * The agent highlights it and never types into it.
     */
    askUser: z.boolean().optional(),
    note: z.string().optional(),
  })
  .strict();

const actionSchema = z
  .object({
    id: z.string().regex(ID),
    label: z.string().min(1),
    /** `safe` the agent may click (Save draft, Check form); `human` it only highlights. */
    kind: z.enum(['safe', 'human']),
    match: matchSchema,
  })
  .strict();

const expectSchema = z
  .object({
    id: z.string().regex(ID),
    /** `srn`: the pattern's first match is the SRN to write back. `text`: a success message. */
    kind: z.enum(['srn', 'text']),
    pattern: z.string().min(1),
  })
  .strict()
  .refine(
    (e) => {
      try {
        new RegExp(e.pattern);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'expect_pattern_invalid' },
  );

export const recipeSchema = z
  .object({
    id: z.string().regex(ID),
    version: z.string().regex(SEMVER, { message: 'version_semver' }),
    title: z.string().min(1),
    /** The catalog sub-agent this recipe drives. */
    subAgent: z.string().regex(ID),
    /** Which portal build the SOM paths were checked against. `mock` until a supervised live run. */
    verifiedAgainst: z.enum(['mock', 'live']),
    pages: z.array(pageSchema).min(1),
    fields: z.array(fieldSchema).min(1),
    actions: z.array(actionSchema),
    gates: z.array(z.enum(RECIPE_GATES)),
    expect: z.array(expectSchema),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    const pageIds = new Set(recipe.pages.map((p) => p.id));
    const keys = new Set<string>();
    recipe.fields.forEach((field, i) => {
      if (keys.has(field.key)) ctx.addIssue({ code: 'custom', path: ['fields', i, 'key'], message: 'field_key_duplicate' });
      keys.add(field.key);
      if (field.page && !pageIds.has(field.page)) ctx.addIssue({ code: 'custom', path: ['fields', i, 'page'], message: 'field_page_unknown' });
    });
    // Submit and Pay are never the agent's to click (PLAN §4): such an action must be `human`.
    recipe.actions.forEach((action, i) => {
      const words = `${action.id} ${action.label} ${action.match.text ?? ''}`;
      if (action.kind === 'safe' && /submit|pay|final|sign/i.test(words)) {
        ctx.addIssue({ code: 'custom', path: ['actions', i, 'kind'], message: 'action_must_be_human' });
      }
    });
  });

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeField = Recipe['fields'][number];

/** Parses a recipe and throws a readable error naming the first problem. */
export function parseRecipe(raw: unknown): Recipe {
  const parsed = recipeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`invalid_recipe: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim());
  }
  return parsed.data;
}

/**
 * The canonical JSON of a value: object keys sorted at every depth, no whitespace. The signature
 * is over this string, so the extension can re-create it from the recipe it received.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
