import { notifyTeamAssignmentSoon } from '@/lib/email/send-after-response';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  engagementHealthSchema,
  engagementStageSchema,
  internIdSchema,
} from '@/lib/api/engagement-schemas';
import {
  companyNameSchema,
  companyTypeSchema,
  ownershipTypeSchema,
  parentIndianRelationshipSchema,
  entityLegalFormSchema,
  parentEntityAddressSchema,
  parentEntityNameSchema,
  subsidiaryLegalNameSchema,
  subsidiaryRegisteredAddressSchema,
} from '@/lib/api/schemas';
import {
  getEngagementById,
  softDeleteEngagement,
  toAppEngagement,
  updateEngagement,
} from '@/db/repositories/engagements';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { listManagerOptions, systemGetProfileParty } from '@/db/repositories/profiles';
import {
  ensureEngagementManager,
  removeEngagementManager,
} from '@/db/repositories/engagement-managers-membership';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { isFirmWideAdmin } from '@/lib/auth';
import { emptyEmailDispatch } from '@/lib/email/email-dispatch';

type RouteContext = { params: Promise<{ id: string }> };

/** Optional free text that clears to NULL when sent empty. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const patchBodySchema = z.object({
  companyName: companyNameSchema.optional(),
  companyType: companyTypeSchema.optional(),
  ownershipType: ownershipTypeSchema.optional(),
  /** null clears it; the repository also clears it when no longer Indian subsidiary. */
  parentIndianRelationship: parentIndianRelationshipSchema.nullable().optional(),
  /** Pass null to unassign the delivery lead. */
  internId: z.union([internIdSchema, z.null()]).optional(),
  /** Pass null to unassign the project manager (admin only). */
  managerId: z.union([z.string().uuid(), z.null()]).optional(),
  stage: engagementStageSchema.optional(),
  health: engagementHealthSchema.optional(),
  incorporationDate: z.string().trim().nullable().optional(),
  entityLegalForm: entityLegalFormSchema.optional(),
  /** null clears them — the company was made independent. */
  parentEntityName: z.union([parentEntityNameSchema, z.null()]).optional(),
  parentEntityAddress: z.union([parentEntityAddressSchema, z.null()]).optional(),
  parentEntityRegistrationNumber: nullableText(120),
  subsidiaryLegalName: z.union([subsidiaryLegalNameSchema, z.null()]).optional(),
  subsidiaryRegisteredAddress: z.union([subsidiaryRegisteredAddressSchema, z.null()]).optional(),
  /** Display name of the client contact on this project (not the login). */
  clientName: nullableText(120),
  /** Compliance questionnaire answers — replaces the stored set wholesale. */
  complianceQuestionnaire: z
    .record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
    .optional(),
});

export async function GET(_request: Request, context: RouteContext) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const row = await getEngagementById(guard.ctx, engagementDbId(id));
  if (!row) {
    return NextResponse.json({ engagement: null }, { status: 404 });
  }

  return NextResponse.json({ engagement: toAppEngagement(row) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await requireAnyRole('admin', 'manager', 'intern', 'super_admin');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request, patchBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  try {
    const before = await getEngagementById(guard.ctx, engagementDbId(id));
    if (!before) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const patch: Parameters<typeof updateEngagement>[2] = {};
    if (body.data.companyName !== undefined) patch.companyName = body.data.companyName;
    if (body.data.internId !== undefined) patch.internId = body.data.internId;
    if (body.data.managerId !== undefined) {
      if (!isFirmWideAdmin(guard.ctx.role)) {
        return NextResponse.json({ error: 'manager_reassign_admin_only' }, { status: 403 });
      }
      if (body.data.managerId !== null) {
        const managers = await listManagerOptions(guard.ctx);
        if (!managers.some((m) => m.id === body.data.managerId)) {
          return NextResponse.json({ error: 'manager_not_found' }, { status: 400 });
        }
      }
      patch.managerId = body.data.managerId;
    }
    if (body.data.stage !== undefined) patch.stage = body.data.stage;
    if (body.data.health !== undefined) patch.health = body.data.health;
    if (body.data.entityLegalForm !== undefined) patch.entityLegalForm = body.data.entityLegalForm;
    if (body.data.incorporationDate !== undefined) {
      patch.incorporationDate = body.data.incorporationDate;
    }
    if (body.data.companyType !== undefined) patch.companyType = body.data.companyType;
    if (body.data.ownershipType !== undefined) patch.ownershipType = body.data.ownershipType;
    if (body.data.parentIndianRelationship !== undefined) {
      patch.parentIndianRelationship = body.data.parentIndianRelationship;
    }
    if (body.data.parentEntityName !== undefined) {
      patch.parentEntityName = body.data.parentEntityName;
    }
    if (body.data.parentEntityAddress !== undefined) {
      patch.parentEntityAddress = body.data.parentEntityAddress;
    }
    if (body.data.parentEntityRegistrationNumber !== undefined) {
      patch.parentEntityRegistrationNumber = body.data.parentEntityRegistrationNumber;
    }
    if (body.data.subsidiaryLegalName !== undefined) {
      patch.subsidiaryLegalName = body.data.subsidiaryLegalName;
    }
    if (body.data.subsidiaryRegisteredAddress !== undefined) {
      patch.subsidiaryRegisteredAddress = body.data.subsidiaryRegisteredAddress;
    }
    if (body.data.clientName !== undefined) patch.clientName = body.data.clientName;
    if (body.data.complianceQuestionnaire !== undefined) {
      patch.complianceQuestionnaire = body.data.complianceQuestionnaire;
    }

    const row = await updateEngagement(guard.ctx, engagementDbId(id), patch);
    const engagement = toAppEngagement(row);
    const email = emptyEmailDispatch();

    if (body.data.managerId !== undefined) {
      const prevId = before.managerId;
      const nextId = body.data.managerId;
      const actor = {
        userId: guard.ctx.userId,
        name: guard.ctx.name,
        email: guard.ctx.email,
      };

      if (prevId && prevId !== nextId) {
        await removeEngagementManager({
          engagementDbId: row.id,
          managerId: prevId,
        }).catch(() => undefined);
        const prev = await systemGetProfileParty(prevId);
        if (prev) {
          const part = await notifyTeamAssignmentSoon({
            engagementAppId: engagement.id,
            engagementSlug: engagement.slug,
            companyName: engagement.companyName,
            role: 'project manager',
            party: prev,
            action: 'removed',
            actor,
          });
          email.attempted += part.attempted;
          email.sent.push(...part.sent);
          email.skipped.push(...part.skipped);
          email.failed.push(...part.failed);
        }
      }

      if (nextId) {
        await ensureEngagementManager({
          engagementDbId: row.id,
          managerId: nextId,
          invitedBy: guard.ctx.userId,
        });
        if (nextId !== prevId) {
          const next = await systemGetProfileParty(nextId);
          if (next) {
            const part = await notifyTeamAssignmentSoon({
              engagementAppId: engagement.id,
              engagementSlug: engagement.slug,
              companyName: engagement.companyName,
              role: 'project manager',
              party: next,
              action: 'assigned',
              actor,
            });
            email.attempted += part.attempted;
            email.sent.push(...part.sent);
            email.skipped.push(...part.skipped);
            email.failed.push(...part.failed);
          }
        }
      }
    }

    email.sent = [...new Set(email.sent)];
    email.skipped = [...new Set(email.skipped)];
    email.failed = [...new Set(email.failed)];

    return NextResponse.json({ engagement, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/engagements/:id — soft delete a project (firm admin only).
 *
 * Sets `deleted_at`, which every repository scope already filters on, so the
 * project disappears from staff lists and the client portal at once while
 * documents, checklist history, and the audit trail stay intact. Managers do
 * not reach this route — they file a `delete_project` change request instead.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const guard = await requireAnyRole('admin', 'super_admin');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;
  try {
    const before = await getEngagementById(guard.ctx, engagementDbId(id));
    if (!before) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const row = await softDeleteEngagement(guard.ctx, id);
    await recordAuditEvent(guard.ctx, {
      engagementId: row.id,
      action: 'project.deleted',
      summary: `Deleted project ${row.companyName}`,
      metadata: { companyName: row.companyName, slug: row.slug, softDelete: true },
    });

    return NextResponse.json({ ok: true, deletedId: toAppEngagement(row).id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'delete_failed';
    const status = message.includes('not found') ? 404 : message.includes('Only firm admins') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
