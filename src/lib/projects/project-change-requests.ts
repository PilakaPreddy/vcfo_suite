import 'server-only';
import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import type { ChangeRequestKind, ChangeRequestRow } from '@/db/repositories/engagement-change-requests';
import {
  getEngagementById,
  softDeleteEngagement,
  updateEngagement,
} from '@/db/repositories/engagements';
import { substituteEngagementClient } from '@/db/repositories/engagement-clients';
import {
  ensureEngagementManager,
  removeEngagementManager,
} from '@/db/repositories/engagement-managers-membership';
import { listManagerOptions } from '@/db/repositories/profiles';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { sendClientEmailChangedEmail } from '@/lib/email/client-email-changed';
import { clientPasswordSchema, emailSchema } from '@/lib/api/schemas';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';

/**
 * Payload shapes, one per request kind. These are validated twice: when the
 * manager files the request, and again at approval time — the row sat in the
 * database in between, and the executor must never trust stored JSON.
 */
const deleteProjectPayloadSchema = z.object({});

const changeManagerPayloadSchema = z.object({
  managerId: z.string().uuid().nullable(),
});

const changeClientPayloadSchema = z.object({
  replaceUserId: z.string().uuid(),
  email: emailSchema,
  fullName: z.string().trim().max(120).optional(),
  password: clientPasswordSchema,
});

const CHANGE_REQUEST_PAYLOAD_SCHEMA: Record<ChangeRequestKind, z.ZodTypeAny> = {
  delete_project: deleteProjectPayloadSchema,
  change_manager: changeManagerPayloadSchema,
  change_client: changeClientPayloadSchema,
};

export function parseChangeRequestPayload(
  kind: ChangeRequestKind,
  payload: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const parsed = CHANGE_REQUEST_PAYLOAD_SCHEMA[kind].safeParse(payload ?? {});
  if (!parsed.success) return { ok: false, error: 'invalid_payload' };
  return { ok: true, data: parsed.data };
}

export type ApplyResult = {
  applied: true;
  /** Set when the project is no longer reachable after the change. */
  projectRemoved?: boolean;
  summary: string;
};

/**
 * Execute an approved request. Runs with the APPROVING ADMIN's context, not the
 * requesting manager's — that is what lets a manager's delete or PM reassignment
 * go through at all, and it keeps the audit trail pointing at who decided.
 *
 * Throws on failure so the caller can re-open the request rather than leaving it
 * marked approved with nothing actually changed.
 */
export async function applyChangeRequest(
  adminCtx: AuthContext,
  request: ChangeRequestRow,
): Promise<ApplyResult> {
  const kind = request.kind as ChangeRequestKind;
  const parsed = parseChangeRequestPayload(kind, request.payload);
  if (parsed.ok === false) throw new Error('invalid_payload');

  const engagement = await getEngagementById(adminCtx, request.engagementId);
  if (!engagement) throw new Error('engagement_not_found');

  if (kind === 'delete_project') {
    const row = await softDeleteEngagement(adminCtx, request.engagementId);
    await recordAuditEvent(adminCtx, {
      engagementId: row.id,
      action: 'project.deleted',
      summary: `Deleted project ${row.companyName} (approved request from ${request.requestedByName ?? 'a manager'})`,
      metadata: {
        companyName: row.companyName,
        slug: row.slug,
        softDelete: true,
        changeRequestId: request.id,
        requestedBy: request.requestedBy,
      },
    });
    return { applied: true, projectRemoved: true, summary: `Deleted ${row.companyName}` };
  }

  if (kind === 'change_manager') {
    const data = parsed.data as z.infer<typeof changeManagerPayloadSchema>;
    if (data.managerId !== null) {
      const managers = await listManagerOptions(adminCtx);
      if (!managers.some((m) => m.id === data.managerId)) {
        throw new Error('manager_not_found');
      }
    }

    const previousManagerId = engagement.managerId;
    const row = await updateEngagement(adminCtx, engagementDbId(request.engagementId), {
      managerId: data.managerId,
    });

    if (previousManagerId && previousManagerId !== data.managerId) {
      // The engagement already moved, so a failure here is logged rather than undoing it.
      await removeEngagementManager({
        engagementDbId: row.id,
        managerId: previousManagerId,
      }).catch((e) => console.error('[project-change-requests] previous manager membership not removed', e));
    }
    if (data.managerId) {
      await ensureEngagementManager({
        engagementDbId: row.id,
        managerId: data.managerId,
        invitedBy: adminCtx.userId,
      });
    }

    await recordAuditEvent(adminCtx, {
      engagementId: row.id,
      action: 'project.manager_changed',
      summary: `Changed project manager on ${row.companyName} (approved request from ${request.requestedByName ?? 'a manager'})`,
      metadata: {
        from: previousManagerId,
        to: data.managerId,
        changeRequestId: request.id,
        requestedBy: request.requestedBy,
      },
    });
    return { applied: true, summary: `Project manager updated on ${row.companyName}` };
  }

  // change_client
  const data = parsed.data as z.infer<typeof changeClientPayloadSchema>;
  const result = await substituteEngagementClient(adminCtx, {
    engagementId: request.engagementId,
    replaceUserId: data.replaceUserId,
    email: data.email,
    fullName: data.fullName,
    password: data.password,
  });

  // The outgoing address hears about it on the approval path too.
  await sendClientEmailChangedEmail({
    previousEmail: result.replacedEmail,
    previousName: result.replacedName,
    newEmail: result.email,
    companyName: engagement.companyName,
    actorName: adminCtx.name,
    actorEmail: adminCtx.email,
  }).catch(() => null);

  await recordAuditEvent(adminCtx, {
    engagementId: request.engagementId,
    action: 'project.client_changed',
    summary: `Changed client on ${engagement.companyName} (approved request from ${request.requestedByName ?? 'a manager'})`,
    metadata: {
      replacedEmail: result.replacedEmail,
      newEmail: result.email,
      createdNewUser: result.createdNewUser,
      changeRequestId: request.id,
      requestedBy: request.requestedBy,
    },
  });

  return {
    applied: true,
    summary: `Client on ${engagement.companyName} is now ${result.email}`,
  };
}
