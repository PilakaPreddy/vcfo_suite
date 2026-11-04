import 'server-only';
import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagements, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import {
  coerceOwnershipType,
  normalizeParentIndianRelationship,
  PARENT_ENTITY_ONLY_STEP_IDS,
  type Engagement,
  type OwnershipType,
  type ParentIndianRelationship,
} from '@/data/engagements';
import { isAdminOrManager, isFirmWideAdmin } from '@/lib/auth';
import { resolveCreateProjectManagerAssignment } from '@/lib/projects/create-project-scope';
import { listClientMemberEngagementIds } from '@/db/repositories/engagement-clients';
import { ensureEngagementLead } from '@/db/repositories/engagement-leads-membership';
import { ensureEngagementManager } from '@/db/repositories/engagement-managers-membership';
import { scopeFor } from './scope';
import { toAppEngagement } from './read';
import { createEngagement } from './write';

/** Client provisioning: the client profile lookup for welcome-email resend and the create-project flow. */

/** Load client profile email/name for welcome-email resend. */
export async function getClientProfileForEngagement(
  ctx: AuthContext,
  clientUserId: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  if (!isAdminOrManager(ctx.role)) return null;
  if (ctx.role === 'manager') {
    // Only a client on an engagement in this manager's scope (primary pointer
    // or engagement_clients membership); anything else reads as not found.
    const memberIds = await listClientMemberEngagementIds(clientUserId);
    const clientConds = [eq(engagements.clientUserId, clientUserId)];
    if (memberIds.length > 0) clientConds.push(inArray(engagements.id, memberIds));
    const clientMatch = clientConds.length === 1 ? clientConds[0] : or(...clientConds);
    const scope = await scopeFor(ctx);
    const [inScope] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(and(scope, clientMatch))
      .limit(1);
    if (!inScope) return null;
  }
  const [row] = await db
    .select({ id: profiles.id, email: profiles.email, name: profiles.name })
    .from(profiles)
    .where(and(eq(profiles.id, clientUserId), eq(profiles.role, 'client')))
    .limit(1);
  return row ?? null;
}

export interface CreateProjectWithClientInput {
  companyName: string;
  companyType: string;
  /** Missing = subsidiary (the historical default). */
  ownershipType?: OwnershipType;
  /** Required for Indian subsidiary; forced to null otherwise. */
  parentIndianRelationship?: ParentIndianRelationship | null;
  entityLegalForm?: string;
  /** Optional seed; Part A is the capture point. Ignored for an independent company. */
  parentEntityName?: string;
  parentEntityAddress?: string;
  clientEmail: string;
  clientPassword: string;
  clientName?: string;
  /** WhatsApp destination in E.164. Stored on the client profile, not the engagement. */
  clientPhoneE164?: string;
  /** Explicit WhatsApp consent captured on the create form. */
  clientWhatsappConsent?: boolean;
  /** Primary lead (legacy). Prefer internIds when present. */
  internId?: string;
  /** One or more project leads (profiles.intern_id / profile id). First becomes primary. */
  internIds?: string[];
  /** Primary manager. Prefer managerIds when present. */
  managerId?: string;
  /** One or more project managers (profile UUIDs). First becomes primary. */
  managerIds?: string[];
  stage?: Engagement['stage'];
  health?: Engagement['health'];
  subsidiaryLegalName?: string;
  subsidiaryRegisteredAddress?: string;
  complianceQuestionnaire?: Record<string, boolean | number | string>;
}

export interface CreateProjectWithClientResult {
  engagement: Engagement;
  clientId: string;
  clientUserId: string;
}

async function uniqueEngagementSlug(companyName: string): Promise<string> {
  const { slugifyCompanyName } = await import('@/lib/slug');
  const base = slugifyCompanyName(companyName);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const [hit] = await db
      .select({ id: engagements.id })
      .from(engagements)
      .where(eq(engagements.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

/**
 * Admin or manager: create client profile + engagement in one flow.
 * Caller sends welcome email separately (password is one-time, never logged here).
 */
export async function createProjectWithClient(
  ctx: AuthContext,
  input: CreateProjectWithClientInput,
): Promise<CreateProjectWithClientResult> {
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') {
    throw new Error('Only admins or managers may create projects');
  }

  // Checked before any write so a rejected create leaves no orphan client profile.
  const ownershipType = coerceOwnershipType(input.ownershipType);
  const independent = ownershipType === 'independent';
  const companyType = independent ? 'domestic' : input.companyType;
  const parentIndianRelationship = normalizeParentIndianRelationship({
    ownershipType,
    companyType,
    parentIndianRelationship: input.parentIndianRelationship,
  });
  if (parentIndianRelationship.missing) {
    throw new Error('parent_indian_relationship_required');
  }

  const { primaryManagerId, uniqueManagerIds } = resolveCreateProjectManagerAssignment({
    role: ctx.role,
    userId: ctx.userId,
    managerId: input.managerId,
    managerIds: input.managerIds,
  });

  const leadKeysRaw = [
    ...(input.internIds ?? []),
    ...(input.internId ? [input.internId] : []),
  ]
    .map((id) => id.trim())
    .filter(Boolean);
  const uniqueLeadKeys = [...new Set(leadKeysRaw)];
  if (uniqueLeadKeys.length === 0) {
    throw new Error('Invalid internId — at least one project lead is required');
  }

  const {
    createClientProfile,
    resolveInternScopingId,
  } = await import('@/db/repositories/profiles');

  const resolvedLeadIds: string[] = [];
  for (const key of uniqueLeadKeys) {
    const resolved = await resolveInternScopingId(key);
    if (!resolved) {
      throw new Error('Invalid internId — no intern profile found');
    }
    if (!resolvedLeadIds.includes(resolved)) resolvedLeadIds.push(resolved);
  }
  const primaryLeadId = resolvedLeadIds[0];

  const clientName =
    input.clientName?.trim() || input.companyName.trim() || input.clientEmail.trim();

  const client = await createClientProfile(ctx, {
    email: input.clientEmail,
    password: input.clientPassword,
    fullName: clientName,
    phoneE164: input.clientPhoneE164,
    // Consent only counts when a number was actually given.
    whatsappConsent: Boolean(input.clientWhatsappConsent && input.clientPhoneE164?.trim()),
  });

  const slug = await uniqueEngagementSlug(input.companyName);
  const stage = input.stage ?? 'Pre-Incorporation';
  const health = input.health ?? 'on-track';
  const needsSubsidiary =
    (stage === 'Post-Incorporation' || stage === 'Operational Readiness') &&
    coerceOwnershipType(input.ownershipType) !== 'independent';
  const subsidiaryLegalName = input.subsidiaryLegalName?.trim() || null;
  const subsidiaryRegisteredAddress = input.subsidiaryRegisteredAddress?.trim() || null;
  if (needsSubsidiary) {
    if (!subsidiaryLegalName) {
      throw new Error('subsidiary_legal_name_required');
    }
    if (!subsidiaryRegisteredAddress) {
      throw new Error('subsidiary_registered_address_required');
    }
  }


  try {
    const row = await createEngagement(ctx, {
      slug,
      companyName: input.companyName.trim(),
      // A standalone company has no overseas parent, whatever the form sent.
      companyType,
      ownershipType,
      parentIndianRelationship: parentIndianRelationship.value,
      entityLegalForm: input.entityLegalForm ?? 'company',
      // Captured in SPICe+ Part A for a dependent company; a caller may still
      // seed them here. Never stored as empty strings.
      parentEntityName: independent ? null : input.parentEntityName?.trim() || null,
      parentEntityAddress: independent ? null : input.parentEntityAddress?.trim() || null,
      subsidiaryLegalName: needsSubsidiary && !independent ? subsidiaryLegalName : null,
      subsidiaryRegisteredAddress:
        needsSubsidiary && !independent ? subsidiaryRegisteredAddress : null,
      clientId: client.clientId,
      clientUserId: client.userId,
      internId: primaryLeadId,
      managerId: primaryManagerId,
      adminId: isFirmWideAdmin(ctx.role) ? ctx.userId : null,
      clientName,
      stage,
      health,
      // No parent board → no board resolution to draft or sign. Marking the
      // two steps N/A up front keeps the sequential gate flowing past them.
      checklistState: independent
        ? Object.fromEntries(
            PARENT_ENTITY_ONLY_STEP_IDS.map((id) => [id, { status: 'not-applicable' }]),
          )
        : {},
      complianceQuestionnaire: input.complianceQuestionnaire ?? {},
    });

    for (const leadId of resolvedLeadIds) {
      await ensureEngagementLead({
        engagementDbId: row.id,
        internId: leadId,
        invitedBy: ctx.userId,
      });
    }
    for (const mid of uniqueManagerIds.length ? uniqueManagerIds : [primaryManagerId]) {
      await ensureEngagementManager({
        engagementDbId: row.id,
        managerId: mid,
        invitedBy: ctx.userId,
      });
    }

    return {
      engagement: toAppEngagement(row, { email: client.email, name: client.name }),
      clientId: client.clientId,
      clientUserId: client.userId,
    };
  } catch (err) {
    // Best-effort cleanup of the orphaned client profile.
    await db.delete(profiles).where(eq(profiles.id, client.userId));
    throw err;
  }
}
