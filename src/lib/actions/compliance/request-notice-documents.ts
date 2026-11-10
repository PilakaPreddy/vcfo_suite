import 'server-only';

import { z } from 'zod';
import { getNoticeCase, updateNoticeCase, type NoticeCaseDto } from '@/db/repositories/notice-cases';
import { createRequestList, getRequestList } from '@/db/repositories/request-lists';
import type { ChangesetDraft, RowCheck } from '@/lib/ask/changeset/types';
import { sendList } from '../requests/send-list';
import { clientRecipients, dayInput, jsonTarget, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck, type ActionResult } from '../types';

/**
 * Ask the client for the documents a notice reply needs (IDEAS-PLAN wave 2, section C). Outward
 * (T3): the card names every client member who gets the email. Execute opens a client request
 * list with one document item per line and sends it through `requests.sendList` itself, so the
 * portal upload path, the email and the reminders are the request list's own. This approved first
 * send is what the reminder job's later reminders rest on. The case moves to "documents
 * requested" and keeps the list's id. No undo: the email has gone. A case whose request list is
 * still live (anything but cancelled) is held, so a second approval never sends a second list and
 * a second set of reminders.
 */

const input = z.object({
  caseId: z.string().uuid(),
  /** The documents to ask for; the case's own list when left out. */
  documents: z.array(z.string().trim().min(2).max(200)).max(30).optional(),
  dueAt: dayInput.optional(),
  /** The list title, shown on the card. */
  value: z.string().trim().max(200).optional(),
});
type Input = z.infer<typeof input>;

const wanted = (i: Input, item: NoticeCaseDto) => (i.documents?.length ? i.documents : item.documentsNeeded).map((d) => d.trim()).filter(Boolean);

/** The request list's due date: the one asked for, else three days before the reply date. */
export function requestDueOn(i: Pick<Input, 'dueAt'>, item: Pick<NoticeCaseDto, 'responseDueOn'>, today: string): string | null {
  if (i.dueAt) return i.dueAt;
  if (!item.responseDueOn) return null;
  const three = new Date(Date.parse(`${item.responseDueOn}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);
  return three >= today ? three : item.responseDueOn >= today ? item.responseDueOn : null;
}

async function check(actx: ActionContext, i: Input): Promise<{ checked: ActionRecheck; item: NoticeCaseDto | null }> {
  const item = await getNoticeCase(actx.auth, i.caseId);
  if (!item) return { checked: unavailable('This notice case is not available.'), item: null };
  const docs = wanted(i, item);
  const recipients = await clientRecipients(item.engagementId);
  const today = actx.now.toISOString().slice(0, 10);
  const due = requestDueOn(i, item, today);
  const earlier = item.requestListId ? await getRequestList(actx.auth, item.requestListId) : null;
  const checks: RowCheck[] = [
    { rule: 'scope', ok: true },
    item.open ? { rule: 'status', ok: true } : { rule: 'status', ok: false, message: 'This case is no longer open.' },
    docs.length > 0 ? { rule: 'items', ok: true } : { rule: 'items', ok: false, message: 'Draft the reply first, or name the documents to ask for.' },
    earlier && earlier.status !== 'cancelled'
      ? { rule: 'duplicate', ok: false, message: `These documents were already requested (the list is ${earlier.status}). Add lines to that list instead.` }
      : { rule: 'duplicate', ok: true },
    recipients.length > 0 ? { rule: 'recipients', ok: true } : { rule: 'recipients', ok: false, message: 'This client has no portal user to send the request to.' },
    i.dueAt && i.dueAt < today ? { rule: 'date', ok: false, message: 'The due date is in the past.' } : { rule: 'date', ok: true },
  ];
  const lines = docs.slice(0, 12).map((d) => `Upload: ${d}`);
  if (docs.length > lines.length) lines.push(`and ${docs.length - lines.length} more`);
  return {
    item,
    checked: recheckOf(checks, {
      oldValue: '',
      value: i.value ?? `Documents for ${item.label}`,
      displayOld: '',
      displayNew: [`${docs.length} document${docs.length === 1 ? '' : 's'} for ${item.label}${due ? ` · due ${due}` : ''}`, ...lines].join('\n'),
    }),
  };
}

export async function previewRequestNoticeDocuments(actx: ActionContext, i: Input): Promise<ChangesetDraft | null> {
  const { checked, item } = await check(actx, i);
  if (!item) return null;
  return oneRow({
    title: `Ask ${item.companyName} for the notice documents`,
    tier: 'T3',
    engagementId: item.engagementId,
    action: 'compliance.requestNoticeDocuments',
    target: jsonTarget({ caseId: i.caseId, documents: i.documents, dueAt: i.dueAt }),
    label: 'Notice desk · client request',
    checked,
    recipients: await clientRecipients(item.engagementId),
  });
}

export async function runRequestNoticeDocuments(actx: ActionContext, i: Input): Promise<ActionResult> {
  const { checked, item } = await check(actx, i);
  if (!item || !checked.canApply) return { ok: false, error: checked.heldReason ?? 'These documents cannot be requested.' };
  const docs = wanted(i, item);
  const list = await createRequestList(actx.auth, {
    engagementId: item.engagementId,
    title: (i.value ?? `Documents for ${item.label}`).slice(0, 200),
    periodLabel: item.periodLabel,
    dueOn: requestDueOn(i, item, actx.now.toISOString().slice(0, 10)),
    items: docs.map((label) => ({ kind: 'document' as const, label })),
  });
  const sent = await sendList.execute(actx, { listId: list.id, value: list.title });
  if (sent.ok === false) return sent;
  await updateNoticeCase(actx.auth, item.id, {
    requestListId: list.id,
    documentsNeeded: docs,
    ...(item.stage === 'received' || item.stage === 'analysed' ? { stage: 'docs_requested' as const } : {}),
  });
  return { ok: true, summary: sent.summary };
}

export const requestNoticeDocuments = defineAction({
  name: 'compliance.requestNoticeDocuments',
  description:
    'Ask the client for the documents a notice reply needs: it sends them a request list by email and in their portal, with reminders until every document is in. Uses the case\'s drafted list unless documents are named.',
  capability: 'Ask a client for the documents a notice reply needs (they get an email and reminders)',
  input,
  tier: 'T3',
  roles: STAFF_ROLES,
  preview: previewRequestNoticeDocuments,
  recheck: async (actx, i) => (await check(actx, i)).checked,
  execute: runRequestNoticeDocuments,
});
