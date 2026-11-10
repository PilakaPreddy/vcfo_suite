import 'server-only';

import { z } from 'zod';
import { getNoticeCase, updateNoticeCase } from '@/db/repositories/notice-cases';
import type { JsonValue } from '@/lib/ask/changeset/types';
import { DraftUnavailable, draftNoticeReply as writeDraft } from '@/lib/notices/draft-reply';
import { noticesHref } from '@/lib/notices/model';
import { STAFF_ROLES } from '../shared';
import { defineAction, type ActionContext, type ActionResult } from '../types';

/**
 * Draft a reply to a notice case and list the documents it needs (IDEAS-PLAN wave 2, section C).
 * A draft (T1): it runs on its own, saves the draft and the list on the case, and sends nothing.
 * Undo puts back the draft and list the case had before. The partner approves the final reply
 * when the case moves to "submitted".
 */

const input = z.object({
  caseId: z.string().uuid(),
});
type Input = z.infer<typeof input>;

interface UndoData {
  caseId: string;
  replyDraft: string | null;
  documentsNeeded: string[];
}

export async function runDraftNoticeReply(actx: ActionContext, i: Input): Promise<ActionResult> {
  const item = await getNoticeCase(actx.auth, i.caseId);
  if (!item) return { ok: false, error: 'This notice case is not available.' };
  if (item.stage === 'closed') return { ok: false, error: 'This case is closed.' };
  let drafted;
  try {
    drafted = await writeDraft(actx.auth, item, actx.now);
  } catch (error) {
    if (error instanceof DraftUnavailable) return { ok: false, error: error.message };
    throw error;
  }
  const { previous } = await updateNoticeCase(actx.auth, item.id, { replyDraft: drafted.reply, documentsNeeded: drafted.documents });
  const undo: UndoData = { caseId: item.id, replyDraft: previous.replyDraft, documentsNeeded: previous.documentsNeeded };
  const sources = drafted.sources.length > 0 ? ` It drew on ${drafted.sources.slice(0, 3).join(', ')}.` : '';
  return {
    ok: true,
    summary: `Drafted a reply to ${item.label} and listed ${drafted.documents.length} documents.${sources} Nothing was sent.`,
    href: `${noticesHref(actx.auth.role)}?case=${item.id}`,
    undo: undo as unknown as JsonValue,
  };
}

export const draftNoticeReply = defineAction({
  name: 'compliance.draftNoticeReply',
  description:
    'Write a first draft reply to an open notice case, with the list of documents needed from the client, from the notice text and the firm\'s knowledge bank. It saves the draft on the case and sends nothing.',
  capability: 'Draft a reply to a tax or GST notice, with the documents it needs',
  input,
  tier: 'T1',
  roles: STAFF_ROLES,
  preview: async () => null,
  execute: runDraftNoticeReply,
  async undo(actx, raw) {
    const data = raw as unknown as UndoData;
    const item = await getNoticeCase(actx.auth, data.caseId);
    if (!item) return { ok: false, error: 'This notice case is not available.' };
    await updateNoticeCase(actx.auth, data.caseId, { replyDraft: data.replyDraft, documentsNeeded: data.documentsNeeded });
    return { ok: true, summary: 'Put back the earlier reply draft' };
  },
});
