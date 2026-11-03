import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { assistRuns, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { ENGAGEMENT_DOCUMENTS_BUCKET } from '@/lib/board-resolution/board-resolution-storage';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';
import { bucketKey, getObjectBuffer, putObject } from '@/storage/s3';
import {
  FINISHED,
  MAX_SHOT_BYTES,
  ingestState,
  type AssistIngest,
  type AssistRunDto,
  type AssistRunState,
  type AssistStep,
  type AssistSubjectKind,
} from '@/lib/assist-runs/runs';
import { isStaff, scopeEngagement, subjectInEngagement } from '@/db/repositories/compliance-subject-scope';

/**
 * ASSIST RUNS (migration 0029; C-324, C-363, C-377, S-773, S-809) — the VCFO Assist run
 * state per filing period or registration.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   Reads: staff on engagements `assertEngagementAccess` allows, and a client on its own
 *   engagement (the client portal shows the state, the steps and the replay). Writes ("Start
 *   filing" and the extension's posts) are staff only: the extension posts from inside a
 *   signed-in Suite tab, so it carries the lead's own session. A run key from another
 *   engagement reads as not found and writes nothing. Every write uses the approved
 *   engagement id, never the one the caller sent.
 */

export class AssistForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Only firm staff can run VCFO Assist') {
    super(message);
  }
}

type Row = typeof assistRuns.$inferSelect;
interface StoredStep extends Omit<AssistStep, 'shot'> {
  shotKey?: string;
}

const iso = (d: Date | string | null | undefined): string | null => (d ? (d instanceof Date ? d.toISOString() : String(d)) : null);

function storedSteps(raw: unknown): StoredStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is StoredStep => Boolean(s) && typeof s === 'object' && typeof (s as StoredStep).title === 'string')
    .map((s) => ({ title: s.title, state: s.state === 'done' || s.state === 'run' ? s.state : 'wait', at: s.at, shotKey: s.shotKey }));
}

function toDto(row: Row, startedByName: string | null): AssistRunDto {
  return {
    id: row.id,
    engagementId: appEngagementId(row.engagementId),
    subjectKind: row.subjectKind === 'registration' ? 'registration' : 'filing',
    subjectKey: row.subjectKey,
    form: row.form ?? null,
    state: row.state as AssistRunState,
    steps: storedSteps(row.steps).map((s) => ({ title: s.title, state: s.state, ...(s.at ? { at: s.at } : {}), shot: Boolean(s.shotKey) })),
    reference: row.reference ?? null,
    fieldsWritten: row.fieldsWritten ?? null,
    mismatches: Array.isArray(row.mismatches) ? (row.mismatches as AssistRunDto['mismatches']) : [],
    error: row.error ?? null,
    startedBy: startedByName,
    startedAt: iso(row.startedAt)!,
    updatedAt: iso(row.updatedAt)!,
    finishedAt: iso(row.finishedAt),
  };
}

/** Runs of one engagement, newest first; narrowed to one subject, or to a list of keys. */
export async function listAssistRuns(
  ctx: AuthContext,
  input: { engagementId?: string | null; subjectKind?: AssistSubjectKind; subjectKey?: string; subjectKeys?: string[] },
): Promise<AssistRunDto[] | null> {
  const scope = await scopeEngagement(ctx, input.engagementId);
  if (!scope) return null;
  const where = [eq(assistRuns.engagementId, scope.dbId)];
  if (input.subjectKind) where.push(eq(assistRuns.subjectKind, input.subjectKind));
  if (input.subjectKey) where.push(eq(assistRuns.subjectKey, input.subjectKey));
  if (input.subjectKeys?.length) where.push(inArray(assistRuns.subjectKey, input.subjectKeys.slice(0, 500)));
  const rows = await db
    .select({ run: assistRuns, startedByName: profiles.name })
    .from(assistRuns)
    .leftJoin(profiles, eq(profiles.id, assistRuns.startedBy))
    .where(and(...where))
    .orderBy(desc(assistRuns.startedAt))
    .limit(500);
  return rows.map((r) => toDto(r.run, r.startedByName ?? null));
}

/**
 * "Start filing": a requested run for the subject. When a run is already open (requested,
 * running or paused) that run comes back instead of a second one. Staff only.
 */
export async function requestAssistRun(
  ctx: AuthContext,
  input: { engagementId: string; subjectKind: AssistSubjectKind; subjectKey: string; form?: string | null },
): Promise<AssistRunDto | null> {
  if (!isStaff(ctx)) throw new AssistForbiddenError();
  const scope = await scopeEngagement(ctx, input.engagementId);
  if (!scope) return null;
  if (!(await subjectInEngagement(scope.dbId, input.subjectKind, input.subjectKey))) return null;
  const open = await db
    .select()
    .from(assistRuns)
    .where(
      and(
        eq(assistRuns.engagementId, scope.dbId),
        eq(assistRuns.subjectKind, input.subjectKind),
        eq(assistRuns.subjectKey, input.subjectKey),
        inArray(assistRuns.state, ['requested', 'running', 'paused']),
      ),
    )
    .orderBy(desc(assistRuns.startedAt))
    .limit(1);
  if (open[0]) return toDto(open[0], null);
  const [row] = await db
    .insert(assistRuns)
    .values({
      engagementId: scope.dbId,
      subjectKind: input.subjectKind,
      subjectKey: input.subjectKey,
      form: input.form?.trim() || null,
      state: 'requested',
      startedBy: ctx.userId,
    })
    .returning();
  return row ? toDto(row, ctx.name ?? null) : null;
}

/** Decode a screenshot data URL; null when it is not one or is too large. */
function decodeShot(dataUrl: string): { bytes: Buffer; contentType: string; ext: string } | null {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = Buffer.from(m[2]!, 'base64');
  if (!bytes.length || bytes.length > MAX_SHOT_BYTES) return null;
  return { bytes, contentType: `image/${m[1]}`, ext: m[1] === 'jpeg' ? 'jpg' : m[1]! };
}

/**
 * The extension's post: progress or result for one run. The run is found by `runId`, then by
 * the Idempotency-Key, then as the subject's open run; otherwise a new run starts. Screenshots
 * go to storage and the step keeps only their key. Staff only.
 */
export async function ingestAssistRun(
  ctx: AuthContext,
  engagementParam: string,
  body: AssistIngest,
  idempotencyKey?: string | null,
): Promise<{ run: AssistRunDto; created: boolean } | null> {
  if (!isStaff(ctx)) throw new AssistForbiddenError();
  const scope = await scopeEngagement(ctx, engagementParam);
  if (!scope) return null;
  const dbId = scope.dbId;
  const idem = idempotencyKey?.trim().slice(0, 200) || null;

  let existing: Row | undefined;
  if (body.runId) {
    [existing] = await db
      .select()
      .from(assistRuns)
      .where(and(eq(assistRuns.id, body.runId), eq(assistRuns.engagementId, dbId)))
      .limit(1);
    if (!existing) return null;
  }
  if (!existing && idem) {
    [existing] = await db
      .select()
      .from(assistRuns)
      .where(and(eq(assistRuns.engagementId, dbId), eq(assistRuns.idempotencyKey, idem)))
      .limit(1);
  }
  const kind = existing ? (existing.subjectKind as AssistSubjectKind) : body.subjectKind!;
  const key = existing ? existing.subjectKey : body.subjectKey!;
  if (!existing) {
    if (!kind || !key || !(await subjectInEngagement(dbId, kind, key))) return null;
    [existing] = await db
      .select()
      .from(assistRuns)
      .where(
        and(
          eq(assistRuns.engagementId, dbId),
          eq(assistRuns.subjectKind, kind),
          eq(assistRuns.subjectKey, key),
          inArray(assistRuns.state, ['requested', 'running', 'paused']),
        ),
      )
      .orderBy(desc(assistRuns.startedAt))
      .limit(1);
  }

  const now = new Date();
  const state = ingestState(body);
  const created = !existing;
  let runId = existing?.id;
  if (!runId) {
    const [row] = await db
      .insert(assistRuns)
      .values({ engagementId: dbId, subjectKind: kind, subjectKey: key, form: body.form ?? null, state, startedBy: ctx.userId, idempotencyKey: idem })
      .returning({ id: assistRuns.id });
    runId = row!.id;
  }

  // Steps: the posted list replaces the stored one; a step posted without a new screenshot
  // keeps the screenshot it had at the same position.
  let steps: StoredStep[] | undefined;
  if (body.steps) {
    const before = storedSteps(existing?.steps);
    steps = [];
    for (const [i, s] of body.steps.entries()) {
      let shotKey = before[i]?.title === s.title ? before[i]?.shotKey : undefined;
      if (s.shot) {
        const shot = decodeShot(s.shot);
        if (shot) {
          shotKey = bucketKey(ENGAGEMENT_DOCUMENTS_BUCKET, `${dbId}/assist/${runId}/${i}-${now.getTime()}.${shot.ext}`);
          await putObject(shotKey, shot.bytes, shot.contentType);
        }
      }
      steps.push({ title: s.title, state: s.state, ...(s.at ? { at: s.at } : {}), ...(shotKey ? { shotKey } : {}) });
    }
  }
  const versions =
    body.recipeVersion !== undefined || body.fieldMapVersion !== undefined
      ? [body.recipeVersion !== undefined ? `recipe ${body.recipeVersion}` : null, body.fieldMapVersion !== undefined ? `map ${body.fieldMapVersion}` : null].filter(Boolean).join(' · ')
      : undefined;
  const [row] = await db
    .update(assistRuns)
    .set({
      state,
      ...(body.form ? { form: body.form } : {}),
      ...(steps ? { steps } : {}),
      ...(body.srn || body.reference ? { reference: (body.reference ?? body.srn)! } : {}),
      ...(body.fieldsWritten !== undefined ? { fieldsWritten: body.fieldsWritten } : {}),
      ...(body.mismatches ? { mismatches: body.mismatches } : {}),
      ...(body.error !== undefined ? { error: body.error || null } : {}),
      ...(versions ? { versions } : {}),
      ...(idem && !existing?.idempotencyKey ? { idempotencyKey: idem } : {}),
      updatedAt: now,
      finishedAt: FINISHED.has(state) ? now : null,
    })
    .where(and(eq(assistRuns.id, runId), eq(assistRuns.engagementId, dbId)))
    .returning();
  if (!row) return null;
  return { run: toDto(row, null), created };
}

/** The bytes of one step's screenshot, for the replay. Same read scope as the runs. */
export async function readAssistShot(
  ctx: AuthContext,
  runId: string,
  index: number,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !Number.isInteger(index) || index < 0 || index > 40) return null;
  const [row] = await db.select().from(assistRuns).where(eq(assistRuns.id, runId)).limit(1);
  if (!row) return null;
  const scope = await scopeEngagement(ctx, row.engagementId);
  if (!scope || scope.dbId !== row.engagementId) return null;
  const step = storedSteps(row.steps)[index];
  if (!step?.shotKey || !step.shotKey.startsWith(`${ENGAGEMENT_DOCUMENTS_BUCKET}/${row.engagementId}/assist/`)) return null;
  const bytes = await getObjectBuffer(step.shotKey);
  if (!bytes) return null;
  const ext = step.shotKey.split('.').pop();
  return { bytes, contentType: ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png' };
}
