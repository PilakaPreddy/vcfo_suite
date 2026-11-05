import 'server-only';
import { after } from 'next/server';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { opensClientOutgoingDraft } from '@/lib/email/engagement-event-fanout';
import {
  emailDispatchNotice,
  emptyEmailDispatch,
  type EmailDispatchResult,
  type EmailDispatchToastMeta,
} from '@/lib/email/email-dispatch';
import { notifyEngagementEvent } from '@/lib/email/notify-engagement-event';
import { notifyTeamAssignment, notifyTeamAssignments } from '@/lib/email/notify-team-assignment';

/*
 * Outbound email after the response (finding 8 of the 2026-11-04 audit). The route saves its
 * change, answers at once, and the provider call runs in `after` from next/server. Inngest is
 * not used because its cloud keys are not set on App Runner. The sender still learns the
 * outcome: the same "Email sent" or "Email didn't send" bell row the browser used to write from
 * the response is written here once the send is done, and `sendEmail` keeps a failed mail for
 * the developer console's retry as before. The route answers with an empty dispatch, so the
 * browser shows no toast for it.
 */

/** Run `send` after the response and leave its outcome in the bell of `actorUserId`. */
export function emailAfterResponse(
  actorUserId: string | undefined,
  send: () => Promise<EmailDispatchResult | null | undefined>,
  meta?: EmailDispatchToastMeta,
): EmailDispatchResult {
  after(async () => {
    try {
      const email = await send();
      const notice = email ? emailDispatchNotice(email, meta) : null;
      if (notice && actorUserId) await createNotificationsForUsers([{ ...notice, userId: actorUserId }]);
    } catch (err) {
      console.error('[email] send after response failed', err);
    }
  });
  return emptyEmailDispatch();
}

type NotifyInput = Parameters<typeof notifyEngagementEvent>[0];

/**
 * `notifyEngagementEvent` without holding the response. An event that opens the compose window
 * for a staff email to the client still runs in the request, because the browser needs the
 * draft from the answer.
 */
export async function notifyEngagementEventSoon(input: NotifyInput): Promise<EmailDispatchResult> {
  if (!input.inAppOnly && opensClientOutgoingDraft(input.event, input.itemId)) return notifyEngagementEvent(input);
  return emailAfterResponse(input.actorUserId, () => notifyEngagementEvent(input), { itemId: input.itemId });
}

/** `notifyTeamAssignment` after the response. */
export async function notifyTeamAssignmentSoon(input: Parameters<typeof notifyTeamAssignment>[0]): Promise<EmailDispatchResult> {
  return emailAfterResponse(input.actor.userId, () => notifyTeamAssignment(input));
}

/** `notifyTeamAssignments` after the response. */
export async function notifyTeamAssignmentsSoon(input: Parameters<typeof notifyTeamAssignments>[0]): Promise<EmailDispatchResult> {
  return emailAfterResponse(input.actor.userId, () => notifyTeamAssignments(input));
}
