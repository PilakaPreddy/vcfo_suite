import { inngest } from './client';
import {
  systemCreateRequestListCallTask,
  systemListSentRequestLists,
  systemRecordRequestListReminder,
  type ReminderCandidate,
} from '@/db/repositories/request-lists';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { sendEmail } from '@/lib/email/send-email';
import { queueWhatsAppSends } from '@/lib/notify/send-whatsapp';
import { firstNameOf } from '@/lib/notify/templates';
import { whatsappConsentOf } from '@/lib/reminders/reminder-rules';
import { buildRequestListEmail } from '@/lib/request-lists/emails';
import { decideReminder, isItemDone, requestsPageHref } from '@/lib/request-lists/model';
import { PAUSED, skipWhenPaused, withRunNow } from '@/jobs/dev-controls';

/**
 * Hourly: reminders on sent client request lists until every item is in (IDEAS-PLAN wave 2, A).
 *
 * A person approved each list's first send on its review card (`requests.sendList`); these
 * reminders follow from that approval, so they need no card of their own. For each sent list:
 *
 *  1. Reconcile the document items with their document requests and complete the list when every
 *     item is in (the repository does this as it reads).
 *  2. `decideReminder` says whether a reminder is due: every `cadence_days`, in India daytime only,
 *     at most `MAX_REMINDERS`.
 *  3. Email every client member through `sendEmail` (the system of record). From the second
 *     reminder, WhatsApp is queued afterwards for members who opted in, reusing the
 *     `client_reminder` template event; it never blocks or fails the email.
 *  4. After the third reminder the lead gets one "call the client" task and a bell.
 *
 * Returns early while "Pause all jobs" is on. Registered in app/api/inngest/route.ts.
 */
export const requestListReminders = inngest.createFunction(
  { id: 'request-list-reminders' },
  withRunNow('request-list-reminders', '0 * * * *'),
  async ({ step }) => {
    if (await skipWhenPaused(step)) return PAUSED;
    const ids = (await step.run('due', async () => {
      const now = new Date();
      const lists = await systemListSentRequestLists(now);
      return lists.filter((c) => decideReminder(c.list, c.items, now).kind === 'remind').map((c) => c.list.id);
    })) as string[];

    let reminded = 0;
    for (const id of ids) {
      const done = await step.run(`remind-${id}`, () => remindOne(id));
      if (done) reminded += 1;
    }
    return { due: ids.length, reminded };
  },
);

/** Sends one list's due reminder. Reads the list again so a retried step decides afresh. */
async function remindOne(listId: string): Promise<boolean> {
  const now = new Date();
  const candidate: ReminderCandidate | undefined = (await systemListSentRequestLists(now, listId))[0];
  if (!candidate) return false;
  const decision = decideReminder(candidate.list, candidate.items, now);
  if (decision.kind !== 'remind') return false;
  const { list, companyName, items } = candidate;

  // Count the reminder first: the guarded update means a retry after a crash cannot mail twice.
  if (!(await systemRecordRequestListReminder(list.id, decision.reminder, now))) return false;

  const recipients = await resolveEngagementRecipients(list.engagementId);
  const clients = recipients ? (recipients.clients.length > 0 ? recipients.clients : recipients.client ? [recipients.client] : []) : [];
  const open = items.filter((i) => !isItemDone(i.status));
  const copy = buildRequestListEmail({
    companyName,
    title: list.title,
    dueOn: list.dueOn,
    openItems: open,
    totalItems: items.length,
    reminder: decision.reminder,
  });
  for (const party of clients) {
    await sendEmail({ to: party.email, subject: copy.subject, html: copy.html, text: copy.text, purpose: 'request-list.reminder' }).catch((err: unknown) => {
      console.warn('[request-lists] reminder email failed', err instanceof Error ? err.message : err);
    });
  }

  if (decision.whatsapp) {
    const optedIn = clients.filter((p) => whatsappConsentOf(p) === 'opted_in');
    const day = now.toISOString().slice(0, 10);
    await queueWhatsAppSends(
      optedIn.map((p) => ({
        engagementId: list.engagementId,
        recipientProfileId: p.userId,
        event: 'client_reminder' as const,
        variables: { firstName: firstNameOf(p.name), companyName, stepTitle: list.title },
        dedupeId: `request-list:${list.id}:${decision.reminder}:${p.userId}:${day}`,
      })),
    ).catch((err: unknown) => console.warn('[request-lists] WhatsApp queue failed', err instanceof Error ? err.message : err));
  }

  if (decision.callTask) {
    const leadId = recipients?.lead?.userId ?? null;
    const taskId = await systemCreateRequestListCallTask(
      { listId: list.id, engagementId: list.engagementId, companyName, title: list.title, openCount: open.length, leadProfileId: leadId },
      now,
    );
    if (taskId && leadId) {
      await createNotificationsForUsers([
        {
          userId: leadId,
          kind: 'request.created',
          title: `${companyName}: call the client`,
          body: `${open.length} item(s) on "${list.title}" are still open after three reminders.`,
          engagementId: list.engagementId,
          companyName,
          href: requestsPageHref('intern'),
        },
      ]).catch((err: unknown) => console.warn('[request-lists] call-task bell failed', err));
    }
  }
  return true;
}
