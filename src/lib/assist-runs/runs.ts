/**
 * VCFO Assist runs — the pure part shared by the repository, the routes and both portals
 * (C-324, C-363, C-377, S-773, S-809). No React, no database.
 *
 * A run is one pass of the VCFO Assist browser extension over a government portal form for
 * one filing period or one registration. Suite never drives the portal itself: "Start
 * filing" stores a requested run, and the extension, running inside a signed-in Suite tab,
 * posts its progress and result to `/api/assist/engagements/[id]/runs`.
 */
import { z } from 'zod';

export type AssistSubjectKind = 'filing' | 'registration';
export type AssistRunState = 'requested' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';
export type AssistStepState = 'done' | 'run' | 'wait';

export interface AssistStep {
  title: string;
  state: AssistStepState;
  /** ISO time the step finished or started. */
  at?: string;
  /** True when a screenshot of the page is stored for this step. */
  shot?: boolean;
}

export interface AssistRunDto {
  id: string;
  engagementId: string;
  subjectKind: AssistSubjectKind;
  subjectKey: string;
  form: string | null;
  state: AssistRunState;
  steps: AssistStep[];
  reference: string | null;
  fieldsWritten: number | null;
  mismatches: Array<{ field: string; expected?: string; actual?: string }>;
  error: string | null;
  startedBy: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export const FINISHED: ReadonlySet<AssistRunState> = new Set(['done', 'failed', 'stopped']);

/** True when the VCFO Assist link is turned on (`VCFO_ASSIST_ENABLED=on`). Server only. */
export function assistSetUp(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.VCFO_ASSIST_ENABLED?.trim().toLowerCase();
  return v === 'on' || v === 'true' || v === '1';
}

/** The chip word and tone of a run (R-13 words; "Not started" when there is no run). */
export function assistWord(run: Pick<AssistRunDto, 'state'> | null | undefined, setUp = true): { label: string; tone: 'ok' | 'prog' | 'idle' | 'teal' | 'bad' } {
  if (!setUp) return { label: 'Not set up', tone: 'idle' };
  if (!run) return { label: 'Not started', tone: 'idle' };
  switch (run.state) {
    case 'requested':
      return { label: 'Requested', tone: 'idle' };
    case 'running':
      return { label: 'Assist running', tone: 'prog' };
    case 'paused':
      return { label: 'Needs you', tone: 'teal' };
    case 'done':
      return { label: 'Filed by Assist', tone: 'ok' };
    case 'failed':
      return { label: 'Stopped', tone: 'bad' };
    default:
      return { label: 'Stopped', tone: 'idle' };
  }
}

/**
 * The five steps shown before the extension reports its own (prototype AssistCard). The
 * person signs in and submits; the extension fills and checks (the extension's human boundary).
 */
function defaultAssistSteps(portal: string, form: string | null): AssistStep[] {
  return [
    `Sign in to the ${/\bportal\b|TRACES|FIRMS|FLAIR/i.test(portal) ? portal : `${portal} portal`}`,
    form ? `Open ${form}` : 'Open the form',
    'Fill the details from VCFO',
    'Check the filled values',
    'Submit and record the reference',
  ].map((title) => ({ title, state: 'wait' as const }));
}

/** The steps to draw: the run's own when it reported any, else the default five. */
export function stepsToShow(run: AssistRunDto | null | undefined, portal: string, form: string | null): AssistStep[] {
  if (run?.steps?.length) return run.steps;
  return defaultAssistSteps(portal, run?.form ?? form);
}

/** "Done · 10:02 am", "Working on it", "Waiting" (prototype AssistSteps note). */
export function stepNote(s: AssistStep): string {
  if (s.state === 'done') {
    if (!s.at) return 'Done';
    const d = new Date(s.at);
    if (Number.isNaN(d.getTime())) return 'Done';
    const ist = new Date(d.getTime() + 330 * 60_000);
    const h = ist.getUTCHours();
    const m = String(ist.getUTCMinutes()).padStart(2, '0');
    return `Done · ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
  }
  return s.state === 'run' ? 'Working on it' : 'Waiting';
}

/** The latest run per subject key, from runs listed newest first. */
export function latestBySubject(runs: AssistRunDto[]): Map<string, AssistRunDto> {
  const out = new Map<string, AssistRunDto>();
  for (const r of runs) if (!out.has(r.subjectKey)) out.set(r.subjectKey, r);
  return out;
}

/* ------------------------------------------------------------------------------------- */
/* What the extension posts                                                               */
/* ------------------------------------------------------------------------------------- */

const SHOT = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
/** Largest screenshot one step may carry, decoded (1.5 MB). */
export const MAX_SHOT_BYTES = 1_500_000;

const ingestStepSchema = z.object({
  title: z.string().trim().min(1).max(160),
  state: z.enum(['done', 'run', 'wait']),
  at: z.string().datetime({ offset: true }).optional(),
  /** A data URL of the page screenshot (png, jpeg or webp). */
  shot: z.string().max(2_100_000).regex(SHOT, 'shot must be a png, jpeg or webp data URL').optional(),
});

/**
 * The body of `POST /api/assist/engagements/[id]/runs`. The extension's existing result post
 * (`SuiteResult`: form, srn, status, capturedAt, fieldsWritten, mismatches, recipeVersion,
 * fieldMapVersion) is accepted as is; the run fields are optional on top of it.
 */
export const ingestSchema = z
  .object({
    runId: z.string().uuid().optional(),
    subjectKind: z.enum(['filing', 'registration']).optional(),
    subjectKey: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.:~-]+$/).optional(),
    form: z.string().trim().min(1).max(80).optional(),
    state: z.enum(['running', 'paused', 'done', 'failed', 'stopped']).optional(),
    steps: z.array(ingestStepSchema).max(40).optional(),
    error: z.string().trim().max(1000).optional(),
    // SuiteResult (the extension's result post).
    srn: z.string().trim().max(80).optional(),
    reference: z.string().trim().max(80).optional(),
    status: z.string().trim().max(40).optional(),
    capturedAt: z.string().max(40).optional(),
    fieldsWritten: z.number().int().min(0).max(100_000).optional(),
    mismatches: z
      .array(z.object({ field: z.string().max(160), expected: z.string().max(400).optional(), actual: z.string().max(400).optional() }).passthrough())
      .max(200)
      .optional(),
    recipeVersion: z.number().int().min(0).optional(),
    fieldMapVersion: z.number().int().min(0).optional(),
  })
  .refine((b) => b.runId || (b.subjectKind && b.subjectKey), { message: 'runId, or subjectKind and subjectKey, is required' });

export type AssistIngest = z.infer<typeof ingestSchema>;

/** The run state an ingest body means: its own `state`, else done when it carries a reference. */
export function ingestState(body: AssistIngest): AssistRunState {
  if (body.state) return body.state;
  if (body.srn || body.reference) return 'done';
  return 'running';
}
