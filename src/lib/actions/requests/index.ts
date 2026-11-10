import 'server-only';

import { z } from 'zod';
import { getActiveCatalogItems } from '@/data/checklist';
import { createDocumentRequest } from '@/db/repositories/document-requests';
import { notifyEngagementEventSoon } from '@/lib/email/send-after-response';
import { clientRecipients, dayInput, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, stepTitle, unavailable } from '../shared';
import { defineAction, type ActionContext, type AnyAction } from '../types';
import { sendList } from './send-list';
import { createListFromTemplate } from './create-list-from-template';

/**
 * Ask the client for a document. The client sees it in their portal and gets an email, so it is
 * outward (T3): the card names every client who will see it. The write and the email are the same
 * calls `POST /api/requests` makes. There is no undo, because the email has already gone.
 */
const createInput = z.object({
  engagementId: z.string().min(1),
  stepId: z.string().min(1).optional(),
  dueAt: dayInput.optional(),
  message: z.string().trim().max(1000).optional(),
  /** What the client is asked for, for example "Utility bill for the registered office". */
  value: z.string().trim().min(2).max(200),
});
type CreateInput = z.infer<typeof createInput>;

async function check(actx: ActionContext, input: CreateInput) {
  const loaded = await loadEngagement(actx.auth, input.engagementId);
  if (!loaded) return unavailable();
  const recipients = await clientRecipients(loaded.row.id);
  const today = actx.now.toISOString().slice(0, 10);
  const shown = [input.value, input.dueAt ? `due ${input.dueAt}` : null, input.message ? `“${input.message}”` : null].filter(Boolean).join(' · ');
  return recheckOf(
    [
      { rule: 'scope', ok: true },
      recipients.length === 0 ? { rule: 'recipients', ok: false, message: 'This client has no portal user to send the request to.' } : { rule: 'recipients', ok: true },
      input.stepId && !getActiveCatalogItems().some((i) => i.id === input.stepId)
        ? { rule: 'step', ok: false, message: 'That step is not on the checklist.' }
        : { rule: 'step', ok: true },
      input.dueAt && input.dueAt < today ? { rule: 'date', ok: false, message: 'The due date is in the past.' } : { rule: 'date', ok: true },
    ],
    { oldValue: '', value: input.value, displayOld: '', displayNew: shown },
  );
}

const create = defineAction({
  name: 'requests.create',
  description: 'Ask one client for a document: it appears in their portal and they get an email. Optional step, due date and note.',
  capability: 'Ask a client for a document (they see it in their portal and by email)',
  input: createInput,
  tier: 'T3',
  roles: STAFF_ROLES,
  common: true,
  async preview(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    const { value: _value, ...target } = input;
    return oneRow({
      title: `Document request to ${loaded?.companyName ?? 'the client'}`,
      tier: 'T3',
      engagementId: input.engagementId,
      action: 'requests.create',
      target: jsonTarget(target),
      label: input.stepId ? `Request · ${stepTitle(input.stepId)}` : 'Request',
      checked: await check(actx, input),
      recipients: loaded ? await clientRecipients(loaded.row.id) : [],
    });
  },
  recheck: (actx, input) => check(actx, input),
  async execute(actx, input) {
    const request = await createDocumentRequest(actx.auth, {
      engagementId: input.engagementId,
      taskId: input.stepId,
      label: input.value,
      message: input.message,
      dueAt: input.dueAt,
    });
    await notifyEngagementEventSoon({
      engagementId: input.engagementId,
      itemId: input.stepId?.trim() || 'document-request',
      event: 'request_created',
      note: input.message,
      requestLabel: input.value,
      actorUserId: actx.auth.userId,
    });
    return { ok: true, summary: `Asked the client for "${request.label}"` };
  },
});

export const actions: AnyAction[] = [create, sendList, createListFromTemplate];
