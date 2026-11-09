import 'server-only';

import type { AskAttachmentRow } from '@/db/repositories/ask-attachments';
import { lockAskRun } from '@/db/repositories/ask-runs';
import { checklistStateFromRow, getEngagementById, listEngagements } from '@/db/repositories/engagements';
import { companiesNamed, lockEngagement } from '@/lib/ask/data-router/lock';
import type { SourceRead } from '@/lib/ask/data-router/place';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { prepareClientCard } from '@/lib/ask/do/entry';
import type { RunContext } from '@/lib/ask/do/run-context';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import type { DropFile, DropGroup, DropUnplaced } from './types';

/**
 * The sorting step of a drop: from every file that was read to one review card per client, plus the
 * files that could not be placed.
 *
 * This is the phase A version. It locks the whole drop to one client, the way the chat's data router
 * does (the message, the page, then the company the documents name), and builds that client's card
 * with the router's own `prepareClientCard`. Phase B replaces the body with `classifyFile` and one
 * card per client; the signature is the contract the job relies on, so it should stay.
 */

export interface DropRead {
  attachment: Pick<AskAttachmentRow, 'id' | 'kind' | 'fileName'>;
  /** The folder path as dropped, or the path inside its ZIP. */
  path: string;
  result: ReadResult;
}

export interface AssembleInput {
  runCtx: Pick<RunContext, 'ctx' | 'runId' | 'provider' | 'progress'>;
  conversationId: string | null;
  instruction: string;
  page?: { path: string };
  reads: readonly DropRead[];
  files: readonly DropFile[];
  now: Date;
}

export interface AssembleResult {
  groups: DropGroup[];
  unplaced: DropUnplaced[];
  /** The files again, with status, client and destination filled in. */
  files: DropFile[];
  /** Short questions or notes for the closing message. */
  notes: string[];
}

export async function assembleDrop(input: AssembleInput): Promise<AssembleResult> {
  const { runCtx, conversationId, instruction, page, reads, now } = input;
  const { ctx } = runCtx;
  const files = input.files.map((f) => ({ ...f }));
  const byId = new Map(files.map((f) => [f.attachmentId, f]));
  const readIds = new Set(reads.map((r) => r.attachment.id));
  const unplacedAll = (reason: string): AssembleResult => {
    const unplaced: DropUnplaced[] = [];
    for (const file of files) {
      if (!readIds.has(file.attachmentId) || file.status !== 'read') continue;
      file.reason = reason;
      unplaced.push({ attachmentId: file.attachmentId, path: file.path, reason });
    }
    return { groups: [], unplaced, files, notes: [] };
  };
  if (reads.length === 0) return { groups: [], unplaced: [], files, notes: [] };

  const engagements = (await listEngagements(ctx)).map((e) => ({ id: e.id, slug: e.slug, companyName: e.companyName }));
  const folderHint = reads.map((r) => r.path).join(' ');
  const lock = lockEngagement({ message: instruction, pagePath: page?.path, engagements });
  let engagement = lock.kind === 'locked' ? lock.engagement : null;
  if (!engagement) {
    const named = [
      ...new Map(
        reads
          .flatMap((r) => (r.result.company ? [r.result.company] : []))
          .concat(folderHint)
          .flatMap((text) => companiesNamed(text, engagements))
          .map((e) => [e.id, e]),
      ).values(),
    ];
    if (named.length === 1) engagement = named[0]!;
    else if (named.length > 1) return unplacedAll(`More than one client matches: ${named.map((e) => e.companyName).join(' and ')}.`);
    else return unplacedAll('I could not tell which client this is for.');
  }

  await lockAskRun(ctx, runCtx.runId, engagement.id);
  const row = await getEngagementById(ctx, engagement.id);
  if (!row) return unplacedAll('That client is not available to you.');
  const sources: SourceRead[] = reads.map((r) => ({ result: r.result, attachment: r.attachment }));
  const card = await prepareClientCard(ctx, runCtx, { row, state: checklistStateFromRow(row), reads: sources, instruction, conversationId, now });
  const notes = card.questions.map(maskIdentityNumbers);
  if (card.kind !== 'card') {
    const reason = card.kind === 'nothing' ? `Nothing new to save for ${row.companyName}.` : 'That client is not available to you.';
    for (const read of reads) {
      const file = byId.get(read.attachment.id);
      if (file && file.status === 'read') Object.assign(file, { status: 'skipped', engagementId: row.id, reason });
    }
    return { groups: [], unplaced: [], files, notes: card.kind === 'nothing' ? [reason, ...notes] : notes };
  }
  for (const read of reads) {
    const file = byId.get(read.attachment.id);
    if (file && file.status === 'read') Object.assign(file, { status: 'placed', engagementId: row.id, destination: 'Checklist' });
  }
  return { groups: [{ engagementId: row.id, companyName: row.companyName, changesetId: card.changesetId }], unplaced: [], files, notes };
}
