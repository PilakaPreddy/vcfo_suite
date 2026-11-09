/**
 * Ask VCFO content contracts — the single source of truth for reviewed
 * topics, the fixed visual component set, answer envelopes, suggestions and
 * glossary terms. The model and the topic files may only emit these shapes;
 * anything else fails zod and the answer renders as text only.
 */
import { z } from 'zod';

const LEGAL_FORMS = ['company', 'llp', 'partnership', 'proprietorship'] as const;
const RESIDENCIES = ['domestic', 'foreign'] as const;
const TOPIC_CATEGORIES = [
  'incorporation',
  'tax',
  'foreign-investment',
  'labour',
  'compliance',
  'your-project',
] as const;
export const ASK_SHELLS = ['client', 'admin', 'super'] as const;
export const ANSWER_DEPTHS = ['normal', 'simple', 'detail'] as const;
const ANSWER_ORIGINS = ['reviewed', 'generated', 'deterministic', 'refusal', 'work'] as const;
export const ANSWER_ACTIONS = [
  'save',
  'simpler',
  'detail',
  'expand',
  'askLead',
  'openStep',
  'openProject',
  'draftReminder',
] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number];
export type Residency = (typeof RESIDENCIES)[number];
export type AskShell = (typeof ASK_SHELLS)[number];
export type AnswerDepth = (typeof ANSWER_DEPTHS)[number];
export type AnswerOrigin = (typeof ANSWER_ORIGINS)[number];
export type AnswerAction = (typeof ANSWER_ACTIONS)[number];

const shortText = z.string().trim().min(1).max(160);

// ---------- Visuals (§3.3) ----------

const flowStageStateSchema = z.enum(['done', 'here', 'next']);

const flowVisualSchema = z.object({
  type: z.literal('flow'),
  stages: z
    .array(
      z.object({
        label: shortText,
        sub: shortText.optional(),
        state: flowStageStateSchema,
        /**
         * Topic files only: checklist steps this stage covers, so "You are here"
         * is recomputed from the viewer's snapshot rather than trusted from copy.
         */
        stepIds: z.array(z.string()).optional(),
      }),
    )
    .min(2)
    .max(5),
});

const stepsVisualSchema = z.object({
  type: z.literal('steps'),
  items: z
    .array(z.object({ label: shortText, form: z.string().trim().max(40).optional() }))
    .min(2)
    .max(8),
});

const comparePanelSchema = z.object({
  title: shortText,
  points: z.array(shortText).min(1).max(5),
});

const compareVisualSchema = z.object({
  type: z.literal('compare'),
  left: comparePanelSchema,
  right: comparePanelSchema,
});

const timelineVisualSchema = z.object({
  type: z.literal('timeline'),
  events: z
    .array(
      z.object({
        label: shortText,
        when: z.string().trim().min(1).max(60),
        source: z.enum(['calendar', 'rule']),
      }),
    )
    .min(2)
    .max(6),
});

const keyFactsVisualSchema = z.object({
  type: z.literal('keyFacts'),
  facts: z
    .array(z.object({ k: z.string().trim().min(1).max(60), v: z.string().trim().min(1).max(200) }))
    .min(2)
    .max(6),
});

const nextStepVisualSchema = z.object({
  type: z.literal('nextStep'),
  stepId: z.string().min(1),
  title: shortText,
  dueLabel: z.string().trim().max(60).optional(),
  items: z.array(z.string().trim().min(1).max(200)).max(8),
});

const projectRowsVisualSchema = z.object({
  type: z.literal('projectRows'),
  rows: z
    .array(
      z.object({
        engagementId: z.string().min(1),
        name: shortText,
        step: z.string().trim().max(160),
        meta: z.string().trim().max(120),
        tone: z.enum(['late', 'waiting', 'plain']),
      }),
    )
    .max(20),
});

const metricsVisualSchema = z.object({
  type: z.literal('metrics'),
  items: z
    .array(z.object({ k: z.string().trim().min(1).max(60), v: z.string().trim().min(1).max(40) }))
    .min(2)
    .max(4),
});

/** Small counts by month or by group. Only metric answers draw it; the model is never offered it. */
const barsVisualSchema = z.object({
  type: z.literal('bars'),
  items: z
    .array(z.object({ k: z.string().trim().min(1).max(40), v: z.number().int().min(0) }))
    .min(2)
    .max(12),
});

export const visualSchema = z.discriminatedUnion('type', [
  flowVisualSchema,
  stepsVisualSchema,
  compareVisualSchema,
  timelineVisualSchema,
  keyFactsVisualSchema,
  nextStepVisualSchema,
  projectRowsVisualSchema,
  metricsVisualSchema,
  barsVisualSchema,
]);

export type Visual = z.infer<typeof visualSchema>;
export type VisualType = Visual['type'];
export type FlowVisual = z.infer<typeof flowVisualSchema>;

/** Visuals a client may receive; staff-only shapes never reach a client answer. */
export const CLIENT_VISUAL_TYPES: readonly VisualType[] = [
  'flow',
  'steps',
  'compare',
  'timeline',
  'keyFacts',
  'nextStep',
];
/** Visuals a staff (admin / super) answer may carry. */
export const STAFF_VISUAL_TYPES: readonly VisualType[] = [
  'flow',
  'steps',
  'compare',
  'timeline',
  'keyFacts',
  'projectRows',
  'metrics',
];

// ---------- Topics (§3.2) ----------

const appliesToSchema = z.object({
  legalForms: z.array(z.enum(LEGAL_FORMS)),
  residency: z.array(z.enum(RESIDENCIES)),
});
export type AppliesTo = z.infer<typeof appliesToSchema>;

const citationSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(200),
  url: z.string().url().optional(),
});

export const TOPIC_BODY_LIMITS = { normal: 400, simple: 250 } as const;

export const topicSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
    title: shortText,
    question: z.string().trim().min(1).max(200),
    category: z.enum(TOPIC_CATEGORIES),
    audience: z.enum(['client', 'staff', 'both']),
    appliesTo: appliesToSchema,
    alternateFor: z
      .array(z.object({ legalForms: z.array(z.enum(LEGAL_FORMS)).min(1), slug: z.string().min(1) }))
      .optional(),
    stepIds: z.array(z.string().min(1)).optional(),
    /** C1: how long the client's part takes, e.g. "About 5 minutes". */
    effortLabel: z.string().trim().max(40).optional(),
    body: z.object({
      normal: z.string().trim().min(1).max(TOPIC_BODY_LIMITS.normal),
      simple: z.string().trim().min(1).max(TOPIC_BODY_LIMITS.simple),
      detail: z.string().trim().min(1).max(1200),
      why: z.string().trim().min(1).max(400),
    }),
    visual: visualSchema.optional(),
    citations: z.array(citationSchema).min(1),
    related: z.array(z.string().min(1)).max(3),
    status: z.enum(['draft', 'published']),
    version: z.number().int().min(1),
    reviewedBy: z.string().trim().min(1).optional(),
    reviewedAt: z.string().date().optional(),
  })
  .superRefine((t, ctx) => {
    if (t.status !== 'published') return;
    if (!t.reviewedBy) {
      ctx.addIssue({ code: 'custom', message: 'published topic needs reviewedBy', path: ['reviewedBy'] });
    }
    if (!t.reviewedAt) {
      ctx.addIssue({ code: 'custom', message: 'published topic needs reviewedAt', path: ['reviewedAt'] });
    }
  });
export type Topic = z.infer<typeof topicSchema>;

// ---------- Go-there links (§7.7) ----------

/** The list pages a metric answer may open, resolved per role in `resolveHref`. */
export const METRIC_LISTS = [
  'projects',
  'approvals',
  'filings',
  'obligations',
  'requests',
  'tasks',
  'documents',
  'registrations',
  'labour',
  'people',
  'updates',
  'receivables',
] as const;
export type MetricList = (typeof METRIC_LISTS)[number];
/** The lists a client has a page for. */
export const CLIENT_METRIC_LISTS: readonly MetricList[] = ['filings', 'obligations', 'requests', 'documents', 'registrations', 'labour', 'updates'];

/** The only link shapes an answer may carry. Navigate / focus / prefill — never act. */
const destinationSchema = z.discriminatedUnion('to', [
  // client
  z.object({ to: z.literal('incorporation'), focusStepId: z.string().min(1).optional() }),
  z.object({ to: z.literal('step'), stepId: z.string().min(1), section: z.enum(['upload', 'form']).optional() }),
  z.object({ to: z.literal('inbox'), itemId: z.string().min(1).optional() }),
  z.object({ to: z.literal('compliances'), itemId: z.string().min(1).optional() }),
  z.object({ to: z.literal('documents'), docId: z.string().min(1).optional() }),
  z.object({ to: z.literal('library'), itemId: z.string().min(1).optional() }),
  z.object({ to: z.literal('learn'), slug: z.string().min(1) }),
  // admin / super
  z.object({ to: z.literal('project'), engagementId: z.string().min(1) }),
  z.object({ to: z.literal('projectStep'), engagementId: z.string().min(1), stepId: z.string().min(1) }),
  z.object({ to: z.literal('approvals') }),
  z.object({ to: z.literal('compliance'), filter: z.enum(['overdue', 'dueSoon']).optional() }),
  // A drafted email carries its own text; without it the standard reminder text is used.
  z.object({
    to: z.literal('composeReminder'),
    engagementId: z.string().min(1),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().max(4000).optional(),
  }),
  // every shell, narrowed by `checkDestination`
  z.object({
    to: z.literal('list'),
    list: z.enum(METRIC_LISTS),
    status: z.enum(['overdue', 'due-soon', 'filed']).optional(),
    view: z.enum(['overdue', 'waiting']).optional(),
    company: z.string().min(1).optional(),
  }),
]);
export type Destination = z.infer<typeof destinationSchema>;

export const CLIENT_DESTINATIONS = ['incorporation', 'step', 'inbox', 'compliances', 'documents', 'library', 'learn', 'list'] as const;
export const STAFF_DESTINATIONS = ['project', 'projectStep', 'approvals', 'compliance', 'composeReminder', 'list'] as const;

export const answerLinkSchema = z.object({
  dest: destinationSchema,
  /** Verb + place: "Open Incorporation", "Upload KYC now". */
  label: z.string().trim().min(1).max(60),
  primary: z.boolean().optional(),
});
export type AnswerLink = z.infer<typeof answerLinkSchema>;

export const MAX_ANSWER_LINKS = 2;

// ---------- Answer envelope (§6.5) ----------

const answerCitationSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(200),
  url: z.string().url().optional(),
});

export const answerEnvelopeSchema = z.object({
  line: z.string().trim().min(1).max(1200),
  why: z.string().trim().max(600).optional(),
  visual: visualSchema.optional(),
  citations: z.array(answerCitationSchema),
  related: z.array(z.string()).max(3).optional(),
  actions: z.array(z.enum(ANSWER_ACTIONS)),
  origin: z.enum(ANSWER_ORIGINS),
  depth: z.enum(ANSWER_DEPTHS),
  topicSlug: z.string().optional(),
  topicVersion: z.number().int().optional(),
  /** Served from a draft topic: never badged "Reviewed". */
  draft: z.boolean().optional(),
  /** Go-there links (max 2, max 1 primary), already scope-checked on the server. */
  links: z.array(answerLinkSchema).max(MAX_ANSWER_LINKS).optional(),
  /** Title shown on library cards and the reader H1; falls back to `line`. */
  title: z.string().trim().max(160).optional(),
  /** Step / project the openStep / openProject / draftReminder actions point at. */
  target: z
    .object({
      stepId: z.string().optional(),
      engagementId: z.string().optional(),
    })
    .optional(),
  /** The review card this answer carries, and the fixed workflow or agent run behind it. */
  changesetId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
});
export type AnswerEnvelope = z.infer<typeof answerEnvelopeSchema>;

// ---------- Suggestions (§3.5) ----------

const STAFF_QUERIES = [
  'waitingOnClient',
  'overdueAndDueSoon',
  'pendingApprovals',
  'firmPulse',
  'atRisk',
] as const;
export type StaffQuery = (typeof STAFF_QUERIES)[number];

export const suggestionSchema = z.object({
  id: z.string().min(1),
  shell: z.enum(ASK_SHELLS),
  group: z.string().min(1),
  label: z.string().min(1).max(120),
  handler: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('topic'), slug: z.string().min(1) }),
    z.object({ kind: z.literal('nextStep') }),
    z.object({ kind: z.literal('phaseProgress') }),
    z.object({ kind: z.literal('query'), query: z.enum(STAFF_QUERIES) }),
    z.object({ kind: z.literal('previewClient') }),
  ]),
  appliesTo: appliesToSchema.optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

// ---------- Glossary (§8.2) ----------

export const glossaryTermSchema = z.object({
  term: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  short: z.string().trim().min(1).max(120),
  topicSlug: z.string().optional(),
  appliesTo: appliesToSchema.optional(),
});
export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;

// ---------- Project snapshot (§6.3) ----------

const ASK_PHASES = [
  'SPICe+ Part A',
  'SPICe+ Part B',
  'Post-incorporation',
  'Registration',
  'Compliance',
] as const;
export type AskPhase = (typeof ASK_PHASES)[number];

/**
 * The only project facts that may reach the model. No PAN, TAN, CIN, DIN,
 * identity numbers, addresses, bank details, director names or emails.
 */
export const projectSnapshotSchema = z
  .object({
    companyName: z.string(),
    legalForm: z.enum(LEGAL_FORMS),
    residency: z.enum(RESIDENCIES),
    hasForeignParent: z.boolean(),
    currentPhase: z.enum(ASK_PHASES),
    currentStep: z
      .object({
        id: z.string(),
        title: z.string(),
        owner: z.enum(['client', 'lead']),
        status: z.string(),
        dueLabel: z.string().optional(),
      })
      .strict()
      .nullable(),
    completedStepCount: z.number().int().min(0),
    totalActiveSteps: z.number().int().min(0),
    incorporated: z.boolean(),
    upcomingCompliances: z
      .array(z.object({ name: z.string(), dueDate: z.string() }).strict())
      .optional(),
  })
  .strict();
export type ProjectSnapshot = z.infer<typeof projectSnapshotSchema>;
