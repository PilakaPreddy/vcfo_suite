import 'server-only';
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  profiles,
  knowledgeBankFiles,
  knowledgeBankFolders,
  documentTemplates,
  emailTemplates,
  documents,
  activity,
  tasks,
  documentRequests,
} from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { initialsFromName, isFirmWideAdmin } from '@/lib/auth';
import { ownAvatarSrc } from '@/lib/account-avatar';
import { isUuid } from '@/lib/slug';
import { systemGetWhatsAppGatePrefs } from '@/db/repositories/notification-prefs';
import type { WhatsAppGatePrefs } from '@/lib/notify/prefs-gate';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { generateTotpSecret, otpauthUri } from '@/lib/totp/totp';
import { encryptTotpSecret, reencryptTotpSecret } from '@/lib/totp/secret-box';
import { checkTotpCode } from '@/lib/totp/check';

/**
 * PROFILES REPOSITORY — intern provisioning + roster listing.
 *
 * Access control (Path A):
 *   - listInternOptions / createInternProfile / createClientProfile: admin or manager
 *   - Interns are scoped by `intern_id` on profiles (mirrors my_intern_id()).
 */

export interface CreateInternProfileInput {
  email: string;
  /** One-time credential for welcome email only — never log or persist plaintext. */
  password: string;
  fullName?: string;
  phone?: string;
  /** Firm admin can assign lead → project manager. */
  reportsToManagerId?: string | null;
}

export interface CreateInternProfileResult {
  userId: string;
  internId: string;
  name: string;
  email: string;
}

export interface InternOptionRow {
  /** Scoping key used on engagements (`intern_id`). */
  id: string;
  /** Profile UUID (for delete / account ops). */
  profileId: string;
  name: string;
  email: string;
  initials: string;
  reportsToManagerId: string | null;
}

function generateInternId(): string {
  return `i${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export async function listInternOptions(ctx: AuthContext): Promise<InternOptionRow[]> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Only admins or managers may list project leads');
  }

  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      internId: profiles.internId,
      reportsToManagerId: profiles.reportsToManagerId,
    })
    .from(profiles)
    .where(eq(profiles.role, 'intern'))
    .orderBy(asc(profiles.name));

  const scoped =
    ctx.role === 'manager'
      ? rows.filter((r) => !r.reportsToManagerId || r.reportsToManagerId === ctx.userId)
      : rows;

  const mapped = scoped.map((row) => {
    const name = row.name?.trim() || 'Project lead';
    return {
      id: row.internId?.trim() || row.id,
      profileId: row.id,
      name,
      email: row.email,
      initials: initialsFromName(name),
      reportsToManagerId: row.reportsToManagerId,
    };
  });
  // Duplicate intern_id keys break Radix Select (same value on two items) and
  // POST internId is a single scoping key — keep the first row per id.
  const seen = new Set<string>();
  return mapped.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export async function createInternProfile(
  ctx: AuthContext,
  input: CreateInternProfileInput,
): Promise<CreateInternProfileResult> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Only admins or managers may create project leads');
  }

  const email = input.email.trim().toLowerCase();
  const name = input.fullName?.trim() || email.split('@')[0] || 'Project lead';
  const phone = input.phone?.trim() || null;
  const internId = generateInternId();

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existing) {
    throw new Error('email_already_registered');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const [row] = await db
    .insert(profiles)
    .values({
      email,
      passwordHash,
      name,
      role: 'intern',
      phone,
      status: 'active',
      internId,
      reportsToManagerId:
        input.reportsToManagerId?.trim() ||
        (ctx.role === 'manager' ? ctx.userId : null),
    })
    .returning({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      internId: profiles.internId,
    });

  return {
    userId: row.id,
    internId: row.internId ?? internId,
    name: row.name ?? name,
    email: row.email,
  };
}

export interface CreateClientProfileInput {
  email: string;
  password: string;
  fullName?: string;
  clientId?: string;
  /** WhatsApp destination in E.164. */
  phoneE164?: string;
  /** Explicit consent ticked on the create form — stamps whatsapp_opt_in_at. */
  whatsappConsent?: boolean;
}

export interface CreateClientProfileResult {
  userId: string;
  clientId: string;
  name: string;
  email: string;
}

function generateClientId(): string {
  return `c${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

/** Admin or manager: provision a client login (bcrypt hash in profiles). */
export async function createClientProfile(
  ctx: AuthContext,
  input: CreateClientProfileInput,
): Promise<CreateClientProfileResult> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Only admins or managers may create client accounts');
  }

  const email = input.email.trim().toLowerCase();
  const name = input.fullName?.trim() || email.split('@')[0] || 'Client';
  const clientId = input.clientId?.trim() || generateClientId();

  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existing) {
    throw new Error('email_already_registered');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const phoneE164 = input.phoneE164?.trim() || null;

  const [row] = await db
    .insert(profiles)
    .values({
      email,
      passwordHash,
      name,
      role: 'client',
      status: 'active',
      clientId,
      phoneE164,
      // Consent is only real when a number came with it.
      whatsappOptInAt: input.whatsappConsent && phoneE164 ? new Date() : null,
    })
    .returning({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      clientId: profiles.clientId,
    });

  return {
    userId: row.id,
    clientId: row.clientId ?? clientId,
    name: row.name ?? name,
    email: row.email,
  };
}

/** Authenticated user updates their own password hash. */
export async function updateOwnPassword(
  ctx: AuthContext,
  currentPassword: string,
  newPassword: string,
): Promise<'ok' | 'invalid_credentials' | 'account_not_found'> {
  const [row] = await db
    .select({ passwordHash: profiles.passwordHash })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);

  if (!row?.passwordHash) return 'account_not_found';

  const ok = await bcrypt.compare(currentPassword, row.passwordHash);
  if (!ok) return 'invalid_credentials';

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db
    .update(profiles)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(profiles.id, ctx.userId));

  return 'ok';
}

/** Resolve intern scoping id from intern_id or profile uuid. */
export async function resolveInternScopingId(internKey: string): Promise<string | null> {
  const key = internKey.trim();
  if (!key) return null;

  const [byInternId] = await db
    .select({ id: profiles.id, internId: profiles.internId })
    .from(profiles)
    .where(and(eq(profiles.role, 'intern'), eq(profiles.internId, key)))
    .limit(1);

  if (byInternId) return byInternId.internId?.trim() || byInternId.id;

  // profiles.id is uuid — skip id lookup for legacy intern keys like `i550…`.
  if (!isUuid(key)) return null;

  const [byId] = await db
    .select({ id: profiles.id, internId: profiles.internId })
    .from(profiles)
    .where(and(eq(profiles.role, 'intern'), eq(profiles.id, key)))
    .limit(1);

  if (!byId) return null;
  return byId.internId?.trim() || byId.id;
}

export type StaffPersonRow = {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'manager' | 'intern' | 'client' | 'developer';
  internId: string | null;
  clientId: string | null;
  reportsToManagerId: string | null;
  status: string;
  /** Two-step sign-in is on (`totp_enabled_at` is set), so a firm admin may reset it. */
  twoStepOn?: boolean;
};

/**
 * Firm admin / super admin: list all accounts. Client partner logins (receivables) are left out:
 * they are not firm people and are managed on the receivables Partners tab.
 */
export async function listStaffPeople(ctx: AuthContext): Promise<StaffPersonRow[]> {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm admins may list all staff');
  }
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      role: profiles.role,
      internId: profiles.internId,
      clientId: profiles.clientId,
      reportsToManagerId: profiles.reportsToManagerId,
      status: profiles.status,
      totpEnabledAt: profiles.totpEnabledAt,
    })
    .from(profiles)
    .where(ne(profiles.role, 'partner'))
    .orderBy(asc(profiles.role), asc(profiles.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email,
    email: r.email,
    role: r.role as StaffPersonRow['role'],
    internId: r.internId,
    clientId: r.clientId,
    reportsToManagerId: r.reportsToManagerId,
    status: r.status,
    twoStepOn: Boolean(r.totpEnabledAt),
  }));
}

async function assertEmailAvailable(email: string): Promise<void> {
  const [existing] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (existing) throw new Error('email_already_registered');
}

/** Firm admin / super admin: create another firm admin. */
export async function createAdminProfile(
  ctx: AuthContext,
  input: { email: string; password: string; fullName?: string },
): Promise<{ userId: string; name: string; email: string }> {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm admins may create admins');
  }
  const email = input.email.trim().toLowerCase();
  const name = input.fullName?.trim() || email.split('@')[0] || 'Admin';
  await assertEmailAvailable(email);

  const passwordHash = await bcrypt.hash(input.password, 10);
  const [row] = await db
    .insert(profiles)
    .values({
      email,
      passwordHash,
      name,
      role: 'admin',
      status: 'active',
    })
    .returning({ id: profiles.id, email: profiles.email, name: profiles.name });

  return { userId: row.id, name: row.name ?? name, email: row.email };
}

/** Firm admin / super admin: create a project manager account. */
export async function createManagerProfile(
  ctx: AuthContext,
  input: { email: string; password: string; fullName?: string },
): Promise<{ userId: string; name: string; email: string }> {
  if (!isFirmWideAdmin(ctx.role)) {
    throw new Error('Only firm admins may create project managers');
  }
  const email = input.email.trim().toLowerCase();
  const name = input.fullName?.trim() || email.split('@')[0] || 'Project Manager';
  await assertEmailAvailable(email);

  const passwordHash = await bcrypt.hash(input.password, 10);
  const [row] = await db
    .insert(profiles)
    .values({
      email,
      passwordHash,
      name,
      role: 'manager',
      status: 'active',
    })
    .returning({ id: profiles.id, email: profiles.email, name: profiles.name });

  return { userId: row.id, name: row.name ?? name, email: row.email };
}

/**
 * Delete an account.
 * - Admin: anyone except self; cannot delete the last admin.
 * - Manager: project leads that report to them (or unassigned).
 *
 * Clears/reassigns FK references first (KB uploads, templates, tasks, etc.)
 * so hard-delete is not blocked by RESTRICT / NO ACTION constraints.
 */
export async function deleteProfileAccount(
  ctx: AuthContext,
  profileId: string,
): Promise<{ deletedId: string; email: string; role: string; name: string }> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }
  if (profileId === ctx.userId) {
    throw new Error('cannot_delete_self');
  }

  const [target] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      reportsToManagerId: profiles.reportsToManagerId,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!target) throw new Error('not_found');

  if (ctx.role === 'manager') {
    if (target.role !== 'intern') {
      throw new Error('managers_may_only_delete_leads');
    }
    if (target.reportsToManagerId && target.reportsToManagerId !== ctx.userId) {
      throw new Error('lead_not_in_your_roster');
    }
  }

  // Only the super admin removes a super admin or a developer account (developers are
  // created by the super admin only).
  if ((target.role === 'super_admin' || target.role === 'developer') && ctx.role !== 'super_admin') {
    throw new Error('cannot_edit_super_admin');
  }

  if (target.role === 'admin') {
    const admins = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, 'admin'));
    if (admins.length <= 1) {
      throw new Error('cannot_delete_last_admin');
    }
  }

  try {
    await db.transaction(async (tx) => {
      // Clear org-chart pointers at this user.
      await tx
        .update(profiles)
        .set({ reportsToManagerId: null, updatedAt: new Date() })
        .where(eq(profiles.reportsToManagerId, profileId));
      // And the "Reports to admin" lines (G-20), which have no foreign key.
      await tx
        .update(profiles)
        .set({ reportsToAdminId: null, updatedAt: new Date() })
        .where(eq(profiles.reportsToAdminId, profileId));

      // RESTRICT FKs — reassign ownership to the actor deleting the account.
      await tx
        .update(knowledgeBankFiles)
        .set({ uploadedBy: ctx.userId })
        .where(eq(knowledgeBankFiles.uploadedBy, profileId));
      await tx
        .update(knowledgeBankFolders)
        .set({ createdBy: ctx.userId })
        .where(eq(knowledgeBankFolders.createdBy, profileId));
      await tx
        .update(documentTemplates)
        .set({ uploadedBy: ctx.userId })
        .where(eq(documentTemplates.uploadedBy, profileId));
      await tx
        .update(emailTemplates)
        .set({ createdBy: ctx.userId })
        .where(eq(emailTemplates.createdBy, profileId));
      await tx
        .update(emailTemplates)
        .set({ updatedBy: ctx.userId })
        .where(eq(emailTemplates.updatedBy, profileId));

      // NO ACTION FKs — null out.
      await tx
        .update(documents)
        .set({ uploadedBy: null })
        .where(eq(documents.uploadedBy, profileId));
      await tx.update(activity).set({ actorId: null }).where(eq(activity.actorId, profileId));
      await tx.update(tasks).set({ assignedTo: null }).where(eq(tasks.assignedTo, profileId));
      await tx
        .update(documentRequests)
        .set({ requestedBy: null })
        .where(eq(documentRequests.requestedBy, profileId));

      await tx.delete(profiles).where(eq(profiles.id, profileId));
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (/foreign key|violates foreign key/i.test(raw)) {
      throw new Error('account_still_referenced', { cause: err });
    }
    throw err instanceof Error ? err : new Error(raw);
  }

  return {
    deletedId: target.id,
    email: target.email,
    role: target.role,
    name: target.name?.trim() || target.email,
  };
}

/** Authenticated user: load own profile fields for settings. */
export async function getOwnProfile(ctx: AuthContext): Promise<{
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneE164: string | null;
  whatsappOptIn: boolean;
  whatsappStatus: string;
  role: string;
  avatarUrl: string | null;
  /** Staff title and ICAI or ICSI membership number (P-617); null for clients and when unset. */
  designation: string | null;
  membershipNo: string | null;
}> {
  const [row] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      phone: profiles.phone,
      designation: profiles.designation,
      membershipNo: profiles.membershipNo,
      phoneE164: profiles.phoneE164,
      whatsappOptInAt: profiles.whatsappOptInAt,
      whatsappOptOutAt: profiles.whatsappOptOutAt,
      whatsappStatus: profiles.whatsappStatus,
      role: profiles.role,
      avatarObjectKey: profiles.avatarObjectKey,
      updatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);

  if (!row) throw new Error('account_not_found');
  return {
    id: row.id,
    name: row.name?.trim() || row.email.split('@')[0] || 'User',
    email: row.email,
    phone: row.phone,
    phoneE164: row.phoneE164,
    whatsappOptIn: Boolean(row.whatsappOptInAt && !row.whatsappOptOutAt),
    whatsappStatus: row.whatsappStatus,
    role: row.role,
    avatarUrl: row.avatarObjectKey ? ownAvatarSrc(row.updatedAt) : null,
    designation: row.designation ?? null,
    membershipNo: row.membershipNo ?? null,
  };
}

/** Own avatar S3 key only — never another user’s. */
export async function getOwnAvatarObjectKey(ctx: AuthContext): Promise<string | null> {
  const [row] = await db
    .select({ avatarObjectKey: profiles.avatarObjectKey })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);
  if (!row) throw new Error('account_not_found');
  return row.avatarObjectKey ?? null;
}

/** Persist the signed-in user’s avatar key (upload / Outlook / remove). */
export async function setOwnAvatarObjectKey(
  ctx: AuthContext,
  objectKey: string | null,
): Promise<{ avatarUrl: string | null }> {
  const [updated] = await db
    .update(profiles)
    .set({ avatarObjectKey: objectKey, updatedAt: new Date() })
    .where(eq(profiles.id, ctx.userId))
    .returning({
      avatarObjectKey: profiles.avatarObjectKey,
      updatedAt: profiles.updatedAt,
    });
  if (!updated) throw new Error('account_not_found');
  return {
    avatarUrl: updated.avatarObjectKey ? ownAvatarSrc(updated.updatedAt) : null,
  };
}

/**
 * Authenticated user updates name / phone / email.
 * Email change requires currentPassword.
 */
export async function updateOwnProfile(
  ctx: AuthContext,
  input: {
    name: string;
    phone?: string | null;
    /** WhatsApp destination. Normalised to E.164 by the caller; null clears it. */
    phoneE164?: string | null;
    /** Explicit consent toggle. true stamps opt-in, false stamps withdrawal. */
    whatsappOptIn?: boolean;
    email?: string;
    currentPassword?: string;
    /** Staff only (P-617). Omitted leaves it; null or "" clears it. A client's value is ignored. */
    designation?: string | null;
    membershipNo?: string | null;
  },
): Promise<
  | { ok: true; name: string; email: string; phone: string | null; designation?: string | null; membershipNo?: string | null }
  | { ok: false; error: 'account_not_found' | 'invalid_credentials' | 'email_already_registered' }
> {
  const [row] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      passwordHash: profiles.passwordHash,
      phoneE164: profiles.phoneE164,
      whatsappOptInAt: profiles.whatsappOptInAt,
      role: profiles.role,
    })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);

  if (!row) return { ok: false, error: 'account_not_found' };

  // Designation and membership number belong to staff (and the developer); a client has neither.
  const staffFields: { designation?: string | null; membershipNo?: string | null } = {};
  if (row.role !== 'client') {
    if (input.designation !== undefined) staffFields.designation = input.designation?.trim() || null;
    if (input.membershipNo !== undefined) staffFields.membershipNo = input.membershipNo?.trim().toUpperCase() || null;
  }

  const name = input.name.trim();
  if (!name) throw new Error('name_required');

  const phone = input.phone?.trim() ? input.phone.trim() : null;

  /**
   * Consent bookkeeping (DPDP): opting in stamps opt-in and clears any prior
   * withdrawal; withdrawing stamps opt-out and leaves the original opt-in
   * timestamp in place as evidence of what was consented to and when.
   */
  const whatsappPatch: {
    phoneE164?: string | null;
    whatsappOptInAt?: Date | null;
    whatsappOptOutAt?: Date | null;
    whatsappStatus?: 'unknown' | 'verified' | 'failed';
  } = {};

  if (input.phoneE164 !== undefined) {
    const nextPhone = input.phoneE164?.trim() ? input.phoneE164.trim() : null;
    whatsappPatch.phoneE164 = nextPhone;
    // A changed number is unproven again — clear a previous `failed` verdict.
    if (nextPhone !== row.phoneE164) whatsappPatch.whatsappStatus = 'unknown';
  }

  if (input.whatsappOptIn !== undefined) {
    if (input.whatsappOptIn) {
      whatsappPatch.whatsappOptInAt = row.whatsappOptInAt ?? new Date();
      whatsappPatch.whatsappOptOutAt = null;
    } else {
      whatsappPatch.whatsappOptOutAt = new Date();
    }
  }
  const nextEmail = input.email?.trim().toLowerCase();
  const emailChanging = Boolean(nextEmail && nextEmail !== row.email);

  if (emailChanging) {
    if (!input.currentPassword || !row.passwordHash) {
      return { ok: false, error: 'invalid_credentials' };
    }
    const ok = await bcrypt.compare(input.currentPassword, row.passwordHash);
    if (!ok) return { ok: false, error: 'invalid_credentials' };
    try {
      await assertEmailAvailable(nextEmail!);
    } catch {
      return { ok: false, error: 'email_already_registered' };
    }
  }

  const [updated] = await db
    .update(profiles)
    .set({
      name,
      phone,
      ...whatsappPatch,
      ...staffFields,
      ...(emailChanging ? { email: nextEmail } : {}),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, ctx.userId))
    .returning({
      name: profiles.name,
      email: profiles.email,
      phone: profiles.phone,
      designation: profiles.designation,
      membershipNo: profiles.membershipNo,
    });

  return {
    ok: true,
    name: updated.name?.trim() || name,
    email: updated.email,
    phone: updated.phone,
    designation: updated.designation ?? null,
    membershipNo: updated.membershipNo ?? null,
  };
}

/**
 * Admin/manager changes another person's sign-in email.
 * Permission matrix mirrors deleteProfileAccount.
 */
export async function updatePersonEmail(
  ctx: AuthContext,
  profileId: string,
  newEmail: string,
): Promise<{ id: string; name: string; email: string; previousEmail: string }> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }

  const email = newEmail.trim().toLowerCase();
  if (!email) throw new Error('email_required');

  const [target] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      reportsToManagerId: profiles.reportsToManagerId,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!target) throw new Error('not_found');

  if (ctx.role === 'manager') {
    if (target.role !== 'intern') {
      throw new Error('managers_may_only_edit_leads');
    }
    if (target.reportsToManagerId && target.reportsToManagerId !== ctx.userId) {
      throw new Error('lead_not_in_your_roster');
    }
  }

  if ((target.role === 'super_admin' || target.role === 'developer') && ctx.role !== 'super_admin') {
    throw new Error('cannot_edit_super_admin');
  }

  if (email === target.email) {
    return {
      id: target.id,
      name: target.name?.trim() || target.email,
      email: target.email,
      previousEmail: target.email,
    };
  }

  await assertEmailAvailable(email);

  const [updated] = await db
    .update(profiles)
    .set({ email, updatedAt: new Date() })
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id, name: profiles.name, email: profiles.email });

  return {
    id: updated.id,
    name: updated.name?.trim() || updated.email,
    email: updated.email,
    previousEmail: target.email,
  };
}

/** Manager options for admin project-create picker. */
export async function listManagerOptions(
  ctx: AuthContext,
): Promise<{ id: string; name: string; email: string }[]> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.role, 'manager'))
    .orderBy(asc(profiles.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email,
    email: r.email,
  }));
}

/** Profile contacts for assignment emails (create-project fan-out). */
export async function listStaffContactsByIds(
  ctx: AuthContext,
  ids: string[],
): Promise<{ id: string; email: string; name: string }[]> {
  if (!isFirmWideAdmin(ctx.role) && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: profiles.id, email: profiles.email, name: profiles.name })
    .from(profiles)
    .where(inArray(profiles.id, unique));
  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email,
    email: r.email,
  }));
}

/** Admin or manager: list active client portal accounts (removed ones excluded). */
export async function listClientAccounts(
  ctx: AuthContext,
): Promise<{ id: string; name: string; email: string; clientId: string | null }[]> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      clientId: profiles.clientId,
    })
    .from(profiles)
    .where(and(eq(profiles.role, 'client'), ne(profiles.status, 'removed')))
    .orderBy(asc(profiles.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email,
    email: r.email,
    clientId: r.clientId,
  }));
}

export type RemovedClientRow = {
  id: string;
  name: string;
  email: string;
  clientId: string | null;
  phone: string | null;
  removedAt: string | null;
  removedReason: string | null;
};

/**
 * Admin or manager: clients taken off their last project. They keep their
 * record — People > Removed clients is where the history stays readable.
 */
export async function listRemovedClients(ctx: AuthContext): Promise<RemovedClientRow[]> {
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin' && ctx.role !== 'manager') {
    throw new Error('Not permitted');
  }
  const rows = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      clientId: profiles.clientId,
      phone: profiles.phoneE164,
      removedAt: profiles.removedAt,
      removedReason: profiles.removedReason,
    })
    .from(profiles)
    .where(and(eq(profiles.role, 'client'), eq(profiles.status, 'removed')))
    .orderBy(desc(profiles.removedAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name?.trim() || r.email,
    email: r.email,
    clientId: r.clientId,
    phone: r.phone,
    removedAt: r.removedAt ? r.removedAt.toISOString() : null,
    removedReason: r.removedReason,
  }));
}


/**
 * SYSTEM WRITER — EUM SNS inbound-message webhook (documented deviation).
 *
 * The webhook is unauthenticated (SNS-signature-verified only), so there is no
 * AuthContext to scope by. Narrow on purpose: a single-row update keyed by the
 * E.164 number Meta reports, writing nothing but the opt-out timestamp.
 * Inbound message bodies are never persisted.
 *
 * Returns the number of profiles marked (0 when the number is unknown to us).
 */
export async function systemRecordWhatsAppOptOut(
  phoneE164: string,
): Promise<number> {
  const phone = phoneE164.trim();
  if (!phone) return 0;

  try {
    const rows = await db
      .update(profiles)
      .set({ whatsappOptOutAt: new Date(), updatedAt: new Date() })
      .where(eq(profiles.phoneE164, phone))
      .returning({ id: profiles.id });
    return rows.length;
  } catch (err) {
    console.error('[profiles] whatsapp opt-out failed', err);
    return 0;
  }
}

/**
 * SYSTEM WRITER — EUM SNS delivery-status webhook (documented deviation).
 * Marks reachability so staff can see a dead number without guessing.
 */
export async function systemMarkWhatsAppStatus(
  phoneE164: string,
  status: 'unknown' | 'verified' | 'failed',
): Promise<void> {
  const phone = phoneE164.trim();
  if (!phone) return;

  try {
    await db
      .update(profiles)
      .set({ whatsappStatus: status, updatedAt: new Date() })
      .where(eq(profiles.phoneE164, phone));
  } catch (err) {
    console.error('[profiles] whatsapp status update failed', err);
  }
}

/**
 * SYSTEM READER — the name and email of a person for a team assignment email.
 *
 * Called by `PATCH /api/engagements/[id]` after its own guard has admitted an admin changing
 * the project manager; it reads only the id, email and name of the old or new manager it was
 * given. Null when the id is empty or the person has no email.
 */
export async function systemGetProfileParty(id: string | null | undefined): Promise<{ userId: string; email: string; name: string } | null> {
  if (!id) return null;
  const [row] = await db
    .select({ id: profiles.id, email: profiles.email, name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);
  if (!row?.email?.trim()) return null;
  return { userId: row.id, email: row.email.trim(), name: row.name?.trim() || row.email.trim() };
}

/**
 * SYSTEM READER — background WhatsApp job (documented deviation).
 *
 * The Inngest job runs after the request that queued it has already returned,
 * so there is no session. Consent is re-read here rather than trusted from the
 * queued payload: a person who opts out between queue and send must not be
 * messaged.
 */
export async function systemGetNotifyRecipient(profileId: string): Promise<{
  profileId: string;
  name: string;
  email: string;
  phoneE164: string | null;
  whatsappOptInAt: Date | null;
  whatsappOptOutAt: Date | null;
  /** WhatsApp categories and quiet hours from `notification_prefs` (G-25). */
  prefs: WhatsAppGatePrefs | null;
} | null> {
  const id = profileId.trim();
  if (!id || !isUuid(id)) return null;

  const [row] = await db
    .select({
      id: profiles.id,
      name: profiles.name,
      email: profiles.email,
      phoneE164: profiles.phoneE164,
      whatsappOptInAt: profiles.whatsappOptInAt,
      whatsappOptOutAt: profiles.whatsappOptOutAt,
      status: profiles.status,
    })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1);

  if (!row || row.status !== 'active') return null;

  return {
    profileId: row.id,
    name: row.name?.trim() || row.email,
    email: row.email,
    phoneE164: row.phoneE164,
    whatsappOptInAt: row.whatsappOptInAt,
    whatsappOptOutAt: row.whatsappOptOutAt,
    prefs: await systemGetWhatsAppGatePrefs(row.id),
  };
}

/* ------------------------------------------------------------------------ */
/* Sign-in check and two-step sign-in (G-25)                                 */
/* ------------------------------------------------------------------------ */

/** A real bcrypt hash of a random string, so an unknown email costs the same time as a wrong password. */
const DUMMY_BCRYPT_HASH = '$2a$10$FRW41IOXAH9HuTeeEawcDeCcuozNhUwy2EZImk8vzyoP0E7f1AlSC';

export type SignInCandidate = {
  id: string;
  email: string;
  name: string | null;
  role: (typeof profiles.$inferSelect)['role'];
  internId: string | null;
  clientId: string | null;
  avatarObjectKey: string | null;
  updatedAt: Date;
  /** True when two-step sign-in is confirmed for this person. */
  twoStepOn: boolean;
  totpSecretEnc: string | null;
};

/**
 * SYSTEM READER — sign-in (documented deviation; there is no session yet).
 *
 * Returns the person when the email and password match an active account that
 * may sign in, and null otherwise. It never says which part was wrong, and an
 * unknown email still runs one bcrypt comparison so the timing does not tell
 * either. Used by the Credentials `authorize`.
 */
export async function systemCheckSignInPassword(emailInput: string, password: string): Promise<SignInCandidate | null> {
  const email = String(emailInput ?? '').trim().toLowerCase();
  if (!email || !password) return null;
  const [row] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      name: profiles.name,
      role: profiles.role,
      internId: profiles.internId,
      clientId: profiles.clientId,
      status: profiles.status,
      passwordHash: profiles.passwordHash,
      avatarObjectKey: profiles.avatarObjectKey,
      updatedAt: profiles.updatedAt,
      totpSecretEnc: profiles.totpSecretEnc,
      totpEnabledAt: profiles.totpEnabledAt,
    })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  const ok = await bcrypt.compare(password, row?.passwordHash || DUMMY_BCRYPT_HASH);
  if (!row?.passwordHash || !ok) return null;
  if (row.status !== 'active') return null;
  // Interns without a scoping key see an empty portfolio — refuse login.
  if (row.role === 'intern' && !row.internId?.trim()) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    internId: row.internId,
    clientId: row.clientId,
    avatarObjectKey: row.avatarObjectKey,
    updatedAt: row.updatedAt,
    twoStepOn: Boolean(row.totpEnabledAt && row.totpSecretEnc),
    totpSecretEnc: row.totpSecretEnc,
  };
}

/**
 * SYSTEM READER — sign-in (documented deviation; there is no session yet).
 *
 * The two-step secret of an active account with two-step on, looked up by email alone, and
 * null for every other email. It takes no password on purpose: the code pre-check route and
 * `authorize` ask for and check the code before the password, so no answer ever depends on
 * whether a password was right (audit finding 2).
 */
export async function systemSignInTwoStep(emailInput: string): Promise<{ id: string; totpSecretEnc: string } | null> {
  const email = String(emailInput ?? '').trim().toLowerCase();
  if (!email) return null;
  const [row] = await db
    .select({ id: profiles.id, status: profiles.status, totpSecretEnc: profiles.totpSecretEnc, totpEnabledAt: profiles.totpEnabledAt })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (!row || row.status !== 'active' || !row.totpEnabledAt || !row.totpSecretEnc) return null;
  return { id: row.id, totpSecretEnc: row.totpSecretEnc };
}

export type TwoStepStatus = {
  /** Confirmed with a first code; sign-in asks for a code. */
  enabled: boolean;
  enabledAt: string | null;
};

async function readOwnTwoStepRow(ctx: AuthContext) {
  const [row] = await db
    .select({
      email: profiles.email,
      totpSecretEnc: profiles.totpSecretEnc,
      totpEnabledAt: profiles.totpEnabledAt,
    })
    .from(profiles)
    .where(eq(profiles.id, ctx.userId))
    .limit(1);
  if (!row) throw new Error('account_not_found');
  return row;
}

/** The caller's own two-step state. */
export async function getOwnTwoStep(ctx: AuthContext): Promise<TwoStepStatus> {
  const row = await readOwnTwoStepRow(ctx);
  const enabled = Boolean(row.totpEnabledAt && row.totpSecretEnc);
  return { enabled, enabledAt: enabled ? row.totpEnabledAt!.toISOString() : null };
}

/**
 * Starts setup for the caller: a new secret is sealed onto their row with
 * `totp_enabled_at` still null, so sign-in does not ask for a code until the
 * first code confirms it. Starting again replaces an unconfirmed secret.
 * Returns the base32 key and the `otpauth://` link, shown once.
 */
export async function startOwnTwoStepSetup(
  ctx: AuthContext,
): Promise<{ secret: string; uri: string } | 'already_on'> {
  const row = await readOwnTwoStepRow(ctx);
  if (row.totpEnabledAt && row.totpSecretEnc) return 'already_on';
  const secret = generateTotpSecret();
  await db
    .update(profiles)
    .set({ totpSecretEnc: encryptTotpSecret(ctx.userId, secret), totpEnabledAt: null })
    .where(and(eq(profiles.id, ctx.userId), isNull(profiles.totpEnabledAt)));
  return { secret, uri: otpauthUri({ issuer: 'VCFO Suite', account: row.email, secret }) };
}

/** Confirms setup with a first code and turns two-step sign-in on. */
export async function confirmOwnTwoStep(
  ctx: AuthContext,
  code: string,
): Promise<{ ok: true; status: TwoStepStatus } | { ok: false; error: 'not_started' | 'already_on' | 'invalid_code' | 'locked' }> {
  const row = await readOwnTwoStepRow(ctx);
  if (row.totpEnabledAt && row.totpSecretEnc) return { ok: false, error: 'already_on' };
  if (!row.totpSecretEnc) return { ok: false, error: 'not_started' };
  const check = checkTotpCode(ctx.userId, row.totpSecretEnc, code);
  if (check === 'locked') return { ok: false, error: 'locked' };
  if (check === 'invalid') return { ok: false, error: 'invalid_code' };
  const now = new Date();
  await db
    .update(profiles)
    .set({ totpEnabledAt: now })
    .where(and(eq(profiles.id, ctx.userId), isNull(profiles.totpEnabledAt)));
  await recordAuditEvent(ctx, { action: 'account.two_step_on', summary: 'Turned on two-step sign-in' });
  return { ok: true, status: { enabled: true, enabledAt: now.toISOString() } };
}

/** Turns two-step sign-in off for the caller; needs a current code. */
export async function disableOwnTwoStep(
  ctx: AuthContext,
  code: string,
): Promise<{ ok: true } | { ok: false; error: 'not_on' | 'invalid_code' | 'locked' }> {
  const row = await readOwnTwoStepRow(ctx);
  if (!row.totpEnabledAt || !row.totpSecretEnc) return { ok: false, error: 'not_on' };
  const check = checkTotpCode(ctx.userId, row.totpSecretEnc, code);
  if (check === 'locked') return { ok: false, error: 'locked' };
  if (check === 'invalid') return { ok: false, error: 'invalid_code' };
  await db
    .update(profiles)
    .set({ totpSecretEnc: null, totpEnabledAt: null })
    .where(eq(profiles.id, ctx.userId));
  await recordAuditEvent(ctx, { action: 'account.two_step_off', summary: 'Turned off two-step sign-in' });
  return { ok: true };
}

/**
 * A firm admin or the super admin turns off another person's two-step sign-in,
 * for a lost phone or for a secret no key can open. A firm admin cannot reset
 * the super admin; nobody resets their own here (they use a code instead).
 */
export async function resetTwoStepFor(
  ctx: AuthContext,
  profileId: string,
): Promise<'ok' | 'forbidden' | 'not_found' | 'self'> {
  if (!isFirmWideAdmin(ctx.role)) return 'forbidden';
  if (!isUuid(profileId)) return 'not_found';
  if (profileId === ctx.userId) return 'self';
  const [target] = await db
    .select({ id: profiles.id, role: profiles.role, email: profiles.email, name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!target) return 'not_found';
  if (target.role === 'super_admin' && ctx.role !== 'super_admin') return 'forbidden';
  await db
    .update(profiles)
    .set({ totpSecretEnc: null, totpEnabledAt: null })
    .where(eq(profiles.id, profileId));
  await recordAuditEvent(ctx, {
    action: 'account.two_step_reset',
    summary: `Reset two-step sign-in for ${target.name?.trim() || target.email}`,
    metadata: { profileId },
  });
  return 'ok';
}

export interface TotpReencryptReport {
  /** Rows with a stored two-step secret. */
  checked: number;
  /** Rows moved from `t1` (AUTH_SECRET key) to `t2` (CREDENTIALS_ENCRYPTION_KEY). */
  moved: number;
  /** Rows already on `t2`. */
  current: number;
  /** Profile ids whose secret no key opens; an admin resets their two-step sign-in. */
  unreadable: string[];
  /** Rows that changed while the script ran and were left for the next run. */
  skipped: number;
}

/**
 * M7 one-time move of every stored TOTP secret to the CREDENTIALS_ENCRYPTION_KEY key
 * (`scripts/reencrypt-totp.ts`). SYSTEM: no AuthContext, because it runs from a shell
 * inside the VPC, never from a request. Each update matches the old value too, so a person
 * who sets up two-step sign-in during the run is not overwritten. `dryRun` writes nothing.
 * Throws when CREDENTIALS_ENCRYPTION_KEY is unset.
 */
export async function systemReencryptTotpSecrets(opts: { dryRun?: boolean } = {}): Promise<TotpReencryptReport> {
  const rows = await db
    .select({ id: profiles.id, enc: profiles.totpSecretEnc })
    .from(profiles)
    .where(isNotNull(profiles.totpSecretEnc));
  const report: TotpReencryptReport = { checked: rows.length, moved: 0, current: 0, unreadable: [], skipped: 0 };
  for (const row of rows) {
    if (!row.enc) continue;
    const out = reencryptTotpSecret(row.id, row.enc);
    if (out.state === 'current') report.current += 1;
    else if (out.state === 'unreadable') report.unreadable.push(row.id);
    else if (opts.dryRun) report.moved += 1;
    else {
      const done = await db
        .update(profiles)
        .set({ totpSecretEnc: out.enc })
        .where(and(eq(profiles.id, row.id), eq(profiles.totpSecretEnc, row.enc)))
        .returning({ id: profiles.id });
      if (done.length) report.moved += 1;
      else report.skipped += 1;
    }
  }
  return report;
}
