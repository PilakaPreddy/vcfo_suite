import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { decideCalendarProposal, systemMovedAudience, type DecidedProposal } from '@/db/repositories/reg-proposals';
import { systemWatchPeople } from '@/db/repositories/reg-updates';
import { obligationName } from './affected';
import { watchHref } from './recipients';
import { formatSourceDate } from './source-status';

const dayOf = (iso: string): string => formatSourceDate(new Date(`${iso}T12:00:00+05:30`));

/**
 * Tells each person with a moved filing which of their clients moved, once, in one row. Code picks
 * them from the filing's owner and the client's manager. The date has moved by now, so a failed bell
 * is logged and does not turn an approval into an error.
 */
async function tellOwners(ctx: AuthContext, { proposal, moved }: DecidedProposal): Promise<void> {
  const audience = await systemMovedAudience(moved.map((row) => row.engagementId));
  const clientsOf = new Map<string, Set<string>>();
  for (const row of moved) {
    const client = audience.get(row.engagementId);
    if (!client) continue;
    for (const person of [row.ownerId, client.managerId]) {
      if (person && person !== ctx.userId) clientsOf.set(person, (clientsOf.get(person) ?? new Set()).add(client.companyName));
    }
  }
  const people = await systemWatchPeople();
  await createNotificationsForUsers(
    people.flatMap((person) => {
      const clients = clientsOf.get(person.id);
      if (!clients) return [];
      return [
        {
          userId: person.id,
          kind: 'watch.update' as const,
          title: `Due date moved: ${obligationName(proposal.obligationId)}`.slice(0, 160),
          body: `${proposal.period} is now due ${dayOf(proposal.newDueDate)}. Your clients: ${[...clients].join(', ')}.`.slice(0, 400),
          engagementId: '',
          companyName: '',
          href: watchHref(person.role),
        },
      ];
    }),
  );
}

export async function decideProposal(ctx: AuthContext, id: string, decision: 'approved' | 'rejected'): Promise<DecidedProposal | null> {
  const decided = await decideCalendarProposal(ctx, id, decision);
  if (decided?.moved.length) await tellOwners(ctx, decided).catch((err) => console.error('[watch] could not tell owners about a moved date', err));
  return decided;
}
