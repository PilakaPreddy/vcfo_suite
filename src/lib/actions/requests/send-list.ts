import 'server-only';

import { z } from 'zod';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { getRequestList, markRequestListSent, type RequestListDetail } from '@/db/repositories/request-lists';
import { sendEmail } from '@/lib/email/send-email';
import { buildRequestListEmail } from '@/lib/request-lists/emails';
import { isItemDone } from '@/lib/request-lists/model';
import type { ChangesetDraft } from '@/lib/ask/changeset/types';
import { clientRecipients, jsonTarget, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type ActionRecheck } from '../types';

/**
 * Send a draft request list to the client (IDEAS-PLAN wave 2, A). Outward (T3): the card names
 * every client member who gets the email. Execute creates one document request per document
 * item (so uploads use the portal's request path), marks the list sent, emails the summary with
 * the portal link through `sendEmail`, and writes an audit event. The reminder job takes over from
 * here, so this first send is the approval the later reminders rest on. No undo: the email is out.
 */
const input = z.object({
  listId: z.string().uuid(),
  /** The list title, shown as the card's new value. */
  value: z.string().trim().max(200).optional(),
});
type Input = z.infer<typeof input>;

const KIND: Record<string, string> = { document: 'Upload', answer: 'Answer', confirmation: 'Confirm' };

export function describeItems(list: Pick<RequestListDetail, 'items'>): string {
  const open = list.items.filter((i) => !isItemDone(i.status));
  const head = `${open.length} item${open.length === 1 ? '' : 's'}`;
  const lines = open.slice(0, 12).map((i) => `${KIND[i.kind] ?? 'Send'}: ${i.label}`);
  const more = open.length > lines.length ? [`and ${open.length - lines.length} more`] : [];
  return [head, ...lines, ...more].join('\n');
}

async function check(actx: ActionContext, value: Input): Promise<{ checked: ActionRecheck; list: RequestListDetail | null }> {
  const list = await getRequestList(actx.auth, value.listId).catch(() => null);
  if (!list) return { checked: unavailable('This list is not available.'), list: null };
  const recipients = await clientRecipients(list.engagementId);
  const today = actx.now.toISOString().slice(0, 10);
  const checked = recheckOf(
    [
      { rule: 'scope', ok: true },
      list.status === 'draft' ? { rule: 'status', ok: true } : { rule: 'status', ok: false, message: 'This list has already been sent or closed.' },
      list.items.length > 0 ? { rule: 'items', ok: true } : { rule: 'items', ok: false, message: 'The list has no items.' },
      recipients.length > 0 ? { rule: 'recipients', ok: true } : { rule: 'recipients', ok: false, message: 'This client has no portal user to send the list to.' },
      list.dueOn && list.dueOn < today ? { rule: 'date', ok: false, message: 'The due date is in the past.' } : { rule: 'date', ok: true },
    ],
    {
      oldValue: list.status,
      value: list.title,
      displayOld: 'Draft',
      displayNew: `${list.title}${list.dueOn ? ` · due ${list.dueOn}` : ''}\n${describeItems(list)}`,
    },
  );
  return { checked, list };
}

export async function previewSendList(actx: ActionContext, value: Input): Promise<ChangesetDraft | null> {
  const { checked, list } = await check(actx, value);
  if (!list) return null;
  return oneRow({
    title: `Send "${list.title}" to ${list.companyName}`,
    tier: 'T3',
    engagementId: list.engagementId,
    action: 'requests.sendList',
    target: jsonTarget({ listId: value.listId }),
    label: 'Request list',
    checked,
    recipients: await clientRecipients(list.engagementId),
  });
}

export const sendList = defineAction({
  name: 'requests.sendList',
  description:
    'Send a draft client request list (documents, answers and confirmations) to the client: they get one email with the list and a portal link, and reminders follow until every item is in.',
  capability: 'Send a request list to a client, with reminders until it is complete',
  input,
  tier: 'T3',
  roles: STAFF_ROLES,
  preview: previewSendList,
  recheck: async (actx, value) => (await check(actx, value)).checked,
  async execute(actx, value) {
    const { checked } = await check(actx, value);
    if (!checked.canApply) return { ok: false, error: checked.heldReason ?? 'This list cannot be sent.' };
    const sent = await markRequestListSent(actx.auth, value.listId, actx.now);
    const recipients = await clientRecipients(sent.engagementId);
    const copy = buildRequestListEmail({
      companyName: sent.companyName,
      title: sent.title,
      dueOn: sent.dueOn,
      openItems: sent.items.filter((i) => !isItemDone(i.status)),
      totalItems: sent.items.length,
      reminder: 0,
      senderName: actx.auth.name,
    });
    let emailed = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      const res = await sendEmail({ to: r.email, subject: copy.subject, html: copy.html, text: copy.text, purpose: 'request-list.sent' }).catch(() => ({ ok: false as const }));
      if (res.ok) emailed += 1;
    }
    await recordAuditEvent(actx.auth, {
      engagementId: sent.engagementId,
      action: 'request_list.sent',
      summary: `Sent the request list "${sent.title}" (${sent.items.length} items)`,
      metadata: { listId: sent.id, items: sent.items.length, recipients: recipients.length, emailed, via: actx.via },
    });
    return {
      ok: true,
      summary: emailed > 0 ? `Sent "${sent.title}" to ${emailed} client contact${emailed === 1 ? '' : 's'}` : `Marked "${sent.title}" sent; the email could not go out`,
    };
  },
});
