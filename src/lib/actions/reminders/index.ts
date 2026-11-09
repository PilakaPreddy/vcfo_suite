import 'server-only';

import { z } from 'zod';
import { lastReminderWithinWindow, resolveReminderTarget } from '@/db/repositories/client-reminders';
import { sendClientReminder } from '@/lib/reminders/send-client-reminder';
import { clientRecipients, jsonTarget, loadEngagement, oneRow, recheckOf, STAFF_ROLES, unavailable } from '../shared';
import { defineAction, type ActionContext, type AnyAction } from '../types';

/**
 * Client reminders from chat.
 *
 * `reminders.client` is the step page's one-click Remind (T3): the card names the clients who get
 * the email, the 24-hour limit is checked again at the click, and the send is `sendClientReminder`.
 * `reminders.draftEmail` only writes a draft (T1): it opens the compose page with the text filled in
 * and sends nothing, so it needs no card.
 */
const remindInput = z.object({
  engagementId: z.string().min(1),
  stepId: z.string().min(1),
  /** An optional note added to the reminder; empty for the standard text. */
  value: z.string().trim().max(1000),
});
type RemindInput = z.infer<typeof remindInput>;

const itemKeyOf = (stepId: string) => `step:${stepId}`;

async function check(actx: ActionContext, input: RemindInput) {
  const loaded = await loadEngagement(actx.auth, input.engagementId);
  if (!loaded) return unavailable();
  const resolved = await resolveReminderTarget(actx.auth, input.engagementId, itemKeyOf(input.stepId));
  if (resolved.ok === false) return unavailable(resolved.reason === 'invalid_item' ? 'This step cannot be reminded.' : undefined);
  const last = await lastReminderWithinWindow(actx.auth, resolved.target, actx.now);
  const recipients = await clientRecipients(loaded.row.id);
  return recheckOf(
    [
      { rule: 'scope', ok: true },
      last ? { rule: 'rate', ok: false, message: 'A reminder for this step went out in the last 24 hours.' } : { rule: 'rate', ok: true },
      recipients.length === 0 ? { rule: 'recipients', ok: false, message: 'No client email on this project.' } : { rule: 'recipients', ok: true },
    ],
    {
      oldValue: '',
      value: input.value,
      displayOld: '',
      displayNew: `Reminder: ${resolved.target.itemTitle}${input.value ? ` · “${input.value}”` : ''}`,
    },
  );
}

const remind = defineAction({
  name: 'reminders.client',
  description: 'Email the client a reminder about one checklist step they still owe, with an optional note. At most one per step per day.',
  capability: 'Send a client a reminder about a step they owe (you see who gets it first)',
  input: remindInput,
  tier: 'T3',
  roles: STAFF_ROLES,
  common: true,
  async preview(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    return oneRow({
      title: `Reminder to ${loaded?.companyName ?? 'the client'}`,
      tier: 'T3',
      engagementId: input.engagementId,
      action: 'reminders.client',
      target: jsonTarget({ engagementId: input.engagementId, stepId: input.stepId }),
      label: 'Reminder email',
      checked: await check(actx, input),
      recipients: loaded ? await clientRecipients(loaded.row.id) : [],
    });
  },
  recheck: (actx, input) => check(actx, input),
  async execute(actx, input) {
    const result = await sendClientReminder(actx.auth, input.engagementId, { itemKey: itemKeyOf(input.stepId), note: input.value || null }, actx.now);
    if (result.ok === false) return { ok: false, error: result.error };
    return { ok: true, summary: `Sent the reminder by ${result.channels.join(' and ')}` };
  },
});

const draftInput = z.object({
  engagementId: z.string().min(1),
  subject: z.string().trim().min(2).max(200),
  /** The email body. */
  value: z.string().trim().min(2).max(4000),
});

const draftEmail = defineAction({
  name: 'reminders.draftEmail',
  description: 'Write an email draft to one client and open it on the compose page. Sends nothing; the person reviews and sends it there.',
  capability: 'Draft an email to a client and open it ready to review (nothing is sent)',
  input: draftInput,
  tier: 'T1',
  roles: STAFF_ROLES,
  async preview() {
    return null;
  },
  async execute(actx, input) {
    const loaded = await loadEngagement(actx.auth, input.engagementId);
    if (!loaded) return { ok: false, error: 'This project is not available.' };
    return { ok: true, summary: `Drafted "${input.subject}" for ${loaded.companyName}` };
  },
});

export const actions: AnyAction[] = [remind, draftEmail];
