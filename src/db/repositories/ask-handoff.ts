import 'server-only';

import { staffAssignedBy } from '@/lib/metrics/trend-stamps';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { profiles, tasks } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { createNotificationsForUsers } from '@/db/repositories/notifications';
import { queueIndexRefresh } from '@/lib/ask/index-cards/queue';

/**
 * "ASK MY LEAD" (T5) — a client's question Ask VCFO could not settle becomes a
 * task on the engagement's delivery lead, with a bell notification.
 *
 * Owner decision (Phase 0): reuse the `tasks` table the way client change
 * requests do, but never touch `checklist_state` or reopen a step.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 * Client only. `assertEngagementAccess` is the only door, the task is written
 * against the approved id, and the assignee comes from the engagement's own
 * lead — the caller cannot choose who gets the work.
 */

const TITLE_PREFIX = 'Client question';
export const ASK_HANDOFF_MAX_QUESTION = 2000;

export interface AskHandoffInput {
  engagementId: string;
  question: string;
  conversationId?: string | null;
  /** Short transcript excerpt ("Ask VCFO said: …") for the lead's context. */
  context?: string | null;
}

export interface AskHandoff {
  id: string;
  assigned: boolean;
  createdAt: string;
}

async function resolveLead(internId: string | null): Promise<string | null> {
  const key = internId?.trim();
  if (!key) return null;
  const [row] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.internId, key)).limit(1);
  return row?.id ?? null;
}

export async function createAskHandoff(
  ctx: AuthContext,
  input: AskHandoffInput,
): Promise<AskHandoff | null> {
  if (ctx.role !== 'client') throw new Error('Only clients ask their lead from Ask VCFO');
  const question = input.question.trim();
  if (!question) throw new Error('A question is required');
  if (question.length > ASK_HANDOFF_MAX_QUESTION) throw new Error('That question is too long');

  const access = await assertEngagementAccess(ctx, input.engagementId);
  if (!access.ok) return null;
  const assignedTo = await resolveLead(access.row.internId);

  const description = [
    question,
    input.context?.trim() ? `\n— Ask VCFO context —\n${input.context.trim().slice(0, 2000)}` : '',
    input.conversationId ? `\nAsk VCFO conversation: ${input.conversationId}` : '',
  ].join('');

  const title = `${TITLE_PREFIX}: ${question.replace(/\s+/g, ' ').slice(0, 80)}${question.length > 80 ? '…' : ''}`;
  const [row] = await db
    .insert(tasks)
    .values({ engagementId: access.dbId, assignedTo, assignedBy: staffAssignedBy(ctx.role, ctx.userId, assignedTo), title, description, stepId: null, status: 'open' })
    .returning();
  if (!row) throw new Error('Could not send the question');
  queueIndexRefresh('task', row.id);

  if (assignedTo) {
    try {
      await createNotificationsForUsers([
        {
          userId: assignedTo,
          kind: 'request.created',
          title: `${access.row.companyName}: client question`,
          body: question.slice(0, 280),
          engagementId: access.dbId,
          companyName: access.row.companyName,
          href: '/app/intern/tasks',
        },
      ]);
    } catch (error) {
      // The task is the record; a missed bell must not lose the question.
      console.warn('[ask-vcfo] handoff notification failed', error);
    }
  }

  await recordAuditEvent(ctx, {
    engagementId: access.dbId,
    action: 'client.ask_handoff',
    summary: 'Client asked their lead from Ask VCFO',
    metadata: { taskId: row.id, conversationId: input.conversationId ?? null },
  });

  return { id: row.id, assigned: Boolean(assignedTo), createdAt: row.createdAt.toISOString() };
}
