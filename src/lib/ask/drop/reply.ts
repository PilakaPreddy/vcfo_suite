import 'server-only';

import type { AuthContext } from '@/auth/guards';
import type { AnswerEnvelope } from '@/data/ask/schema';
import type { AskRunRow } from '@/db/repositories/ask-runs';
import { listEngagements } from '@/db/repositories/engagements';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { createRunContext, RunOverBudget, type DoEvent, type DoWorkResult } from '@/lib/ask/do/run-context';
import { assembleDrop, type DropOverride } from './assemble';
import { parseDropReply } from './classify';
import { dropStateOf, dropStatus, loadDropReads } from './run';
import { dropReplyLine } from './summary';
import type { DropState } from './types';

/**
 * The answer to a drop's "Where should these go?" question. The reply ("file 3 is Acme, Karnataka,
 * Aug 2026", "all of them are Routeware") is read by `parseDropReply`; the files it names are sorted
 * again with those answers, and their rows go onto that client's open card, or onto a new card when
 * that one was decided already. Files the reply did not settle keep waiting, so the person can answer
 * in parts. Like the job, it only prepares cards; nothing is saved until the person accepts.
 */

const line = (text: string, extra: Partial<AnswerEnvelope> = {}): AnswerEnvelope => ({ line: text.slice(0, 1200), citations: [], actions: [], origin: 'work', depth: 'normal', ...extra });

const LEFT_OUT = 'Left out at your reply.';

export async function answerDropReply(
  ctx: AuthContext,
  run: AskRunRow,
  message: string,
  opts: { now: Date; emit?: (event: DoEvent) => void },
): Promise<DoWorkResult> {
  const { now } = opts;
  const state = dropStateOf(run);
  const runCtx = createRunContext({ ctx, run, now, emit: opts.emit });
  const asJson = (s: DropState) => ({ state: s as unknown as JsonValue });
  const engagements = (await listEngagements(ctx)).map((e) => ({ id: e.id, slug: e.slug, companyName: e.companyName }));
  const reply = parseDropReply(message, state.unplaced.length, engagements);

  if (!reply) {
    return runCtx.finish(line('Please tell me where these go, for example "file 1 is Acme, Karnataka, Aug 2026" or "all of them are Acme".'), 'waiting_reply');
  }

  if (reply.cancel) {
    const left = new Set(state.unplaced.map((u) => u.attachmentId));
    const files = state.files.map((f) => (left.has(f.attachmentId) && f.status === 'read' ? { ...f, status: 'skipped' as const, reason: LEFT_OUT } : f));
    const next: DropState = { ...state, files, unplaced: [] };
    const status = dropStatus(next);
    const cards = state.groups.length > 0 ? ' The cards I prepared are still there for you to review.' : ' Nothing was saved.';
    return runCtx.finish(line(`All right, I have left ${left.size === 1 ? 'that file' : 'those files'} out.${cards}`, state.groups[0] ? { changesetId: state.groups[0].changesetId } : {}), status, asJson(next));
  }

  // Each instruction applies to the files it numbers; a later one wins for the same file.
  const overrides = new Map<string, DropOverride>();
  for (const assignment of reply.assignments) {
    const targets = assignment.files === 'all' ? state.unplaced : assignment.files.map((n) => state.unplaced[n - 1]).filter((u): u is NonNullable<typeof u> => Boolean(u));
    for (const target of targets) {
      const before = overrides.get(target.attachmentId) ?? {};
      overrides.set(target.attachmentId, {
        ...before,
        ...(assignment.engagementId ? { engagementId: assignment.engagementId } : {}),
        ...(assignment.stateCode ? { stateCode: assignment.stateCode } : {}),
        ...(assignment.period ? { period: assignment.period } : {}),
      });
    }
  }

  const files = state.files.map((f) => ({ ...f }));
  const targeted = files.filter((f) => overrides.has(f.attachmentId));
  const reads = await loadDropReads(ctx, run.id, targeted);
  let next: DropState = { ...state, files };
  try {
    const result = await assembleDrop({
      runCtx,
      conversationId: run.conversationId,
      instruction: state.instruction,
      page: state.page,
      reads,
      files,
      now,
      overrides,
      groups: state.groups,
    });
    // Files the reply did not name keep waiting in their order; the ones it named wait only if still unsettled.
    const again = new Map(result.unplaced.map((u) => [u.attachmentId, u]));
    const unplaced = state.unplaced.flatMap((u) => (!overrides.has(u.attachmentId) ? [u] : again.has(u.attachmentId) ? [again.get(u.attachmentId)!] : []));
    const failed = new Set(result.files.filter((f) => f.status === 'failed').map((f) => f.attachmentId));
    next = {
      ...next,
      files: result.files,
      groups: result.groups,
      unplaced: unplaced.filter((u) => !failed.has(u.attachmentId)),
      notes: result.notes,
      ...(result.overBudget ? { overBudget: true } : {}),
    };
  } catch (error) {
    if (!(error instanceof RunOverBudget)) throw error;
    next = { ...next, overBudget: true };
  }
  const placed = next.files.filter((f) => overrides.has(f.attachmentId) && f.status === 'placed').length;
  const touched = next.groups.filter((g) => next.files.some((f) => overrides.has(f.attachmentId) && f.status === 'placed' && f.engagementId === g.engagementId)).at(-1) ?? next.groups[0];
  return runCtx.finish(line(dropReplyLine(next, placed, { role: ctx.role }), touched ? { changesetId: touched.changesetId } : {}), dropStatus(next), asJson(next));
}
