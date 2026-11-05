import 'server-only';

import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { engagementBoardResolutionVersions, engagementBoardResolutions, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { isAdminOrManager } from '@/lib/auth';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { checklistStateFromRow, getEngagementById, toAppEngagement } from '@/db/repositories/engagements';
import { createDocument } from '@/db/repositories/documents';
import { buildBoardResolutionMergeFields } from '@/lib/board-resolution/board-resolution';
import { directorResponsesFromState } from '@/lib/incorporation/proposed-directors';
import { nocSnapshotFields } from '@/lib/noc/fields';
import {
  NOC_CHECK_STEP,
  isForeignVariant,
  isNocCheckKey,
  nocReceiveChecks,
  withNocVariantOverride,
} from '@/lib/noc/receive';
import {
  buildNocState,
  effectiveNocVariant,
  nocMayAccept,
  parseNocVariant,
  parseReceiveChecks,
  type NocRowInput,
  type NocState,
} from '@/lib/noc/state';
import type { NocVariant } from '@/lib/noc/variant';

/**
 * BOARD RESOLUTION (NOC) REPOSITORY (R-52, docs/ui-port/BR-NOC-API.md).
 *
 * >>> ACCESS CONTROL <<<
 * Every function reads the engagement through `getEngagementById`, which scopes by role, so
 * another tenant's engagement is "not found" and never read or written.
 *   client: reads the state of its own engagement (no staff block); never writes.
 *   intern, manager, admin, super admin: read the staff state; tick checks, Accept, Send back.
 *   manager, admin, super admin only: Change template, turn the notary steps on or off.
 *   developer: refused.
 */

type BrRow = typeof engagementBoardResolutions.$inferSelect;
type EngRow = NonNullable<Awaited<ReturnType<typeof getEngagementById>>>;

const STAFF_ROLES = new Set(['intern', 'manager', 'admin', 'super_admin']);

function isNocStaff(role: string): boolean {
  return STAFF_ROLES.has(role);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function rowInput(row: BrRow | undefined | null): NocRowInput | null {
  if (!row) return null;
  return {
    status: row.status,
    storagePath: row.storagePath,
    draftedAt: iso(row.draftedAt),
    finalizedAt: iso(row.finalizedAt),
    finalizedBy: row.finalizedBy,
    signedStoragePath: row.signedStoragePath,
    signedUploadedAt: iso(row.signedUploadedAt),
    signedUploadedBy: row.signedUploadedBy,
    notarisedAt: iso(row.notarisedAt),
    notarisedBy: row.notarisedBy,
    apostilledAt: iso(row.apostilledAt),
    apostilledBy: row.apostilledBy,
    acceptedAt: iso(row.acceptedAt),
    acceptedBy: row.acceptedBy,
    sentBackAt: iso(row.sentBackAt),
    sentBackBy: row.sentBackBy,
    sentBackReason: row.sentBackReason,
    receiveChecks: row.receiveChecks,
    notaryStepsOff: row.notaryStepsOff,
    templateVariant: row.templateVariant,
    templateChangedAt: iso(row.templateChangedAt),
    templateChangedBy: row.templateChangedBy,
    templateChangeReason: row.templateChangeReason,
    vaultDocumentId: row.vaultDocumentId,
  };
}

async function requireEngagement(ctx: AuthContext, appOrDbId: string): Promise<EngRow> {
  if (ctx.role === 'developer' || ctx.role === 'partner') throw new Error('Engagement not found or not permitted');
  const row = await getEngagementById(ctx, engagementDbId(appOrDbId));
  if (!row) throw new Error('Engagement not found or not permitted');
  return row;
}

function requireStaff(ctx: AuthContext): void {
  if (!isNocStaff(ctx.role)) throw new Error('Only staff may receive the board resolution');
}

function requireTemplateRole(ctx: AuthContext): void {
  if (!isAdminOrManager(ctx.role)) throw new Error('Only a manager or admin may change the template');
}

async function loadRow(engagementId: string): Promise<BrRow | undefined> {
  const [row] = await db
    .select()
    .from(engagementBoardResolutions)
    .where(eq(engagementBoardResolutions.engagementId, engagementId))
    .limit(1);
  return row;
}

async function namesFor(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((v): v is string => Boolean(v && /^[0-9a-f-]{36}$/i.test(v))))];
  if (!uniq.length) return new Map();
  const rows = await db
    .select({ id: profiles.id, name: profiles.name, email: profiles.email })
    .from(profiles)
    .where(inArray(profiles.id, uniq));
  return new Map(rows.map((r) => [r.id, r.name?.trim() || r.email.split('@')[0] || '']));
}

/** The snapshot of the values the answers give today, with the template the draft uses. */
export function currentNocSnapshot(engagement: EngRow, override: NocVariant | null): Record<string, string> {
  const answersEngagement = withNocVariantOverride(toAppEngagement(engagement), override);
  const { pre1 } = directorResponsesFromState(checklistStateFromRow(engagement));
  const fields = buildBoardResolutionMergeFields({ engagement: answersEngagement, pre1 });
  const variant = effectiveNocVariant({ templateVariant: override }, engagement);
  return nocSnapshotFields(fields, variant, Boolean(String(pre1.boardResolutionDate ?? '').trim()));
}

async function latestVersionOf(engagementId: string) {
  const [v] = await db
    .select()
    .from(engagementBoardResolutionVersions)
    .where(eq(engagementBoardResolutionVersions.engagementId, engagementId))
    .orderBy(desc(engagementBoardResolutionVersions.version))
    .limit(1);
  return v ?? null;
}

async function stateFor(ctx: AuthContext, engagement: EngRow, row: BrRow | undefined | null): Promise<NocState> {
  const staff = isNocStaff(ctx.role);
  const input = rowInput(row);
  const latest = await latestVersionOf(engagement.id);
  const ticks = parseReceiveChecks(input?.receiveChecks);
  const names = await namesFor([
    input?.finalizedBy,
    input?.signedUploadedBy,
    input?.notarisedBy,
    input?.apostilledBy,
    input?.acceptedBy,
    input?.sentBackBy,
    staff ? input?.templateChangedBy : null,
    ...(staff ? Object.values(ticks).map((t) => t.by) : []),
  ]);
  const override = parseNocVariant(input?.templateVariant);
  return buildNocState({
    row: input,
    answers: engagement,
    names,
    latestVersion: latest ? { version: latest.version, fields: (latest.fields ?? {}) as Record<string, string> } : null,
    currentFields: staff && input?.status === 'finalized' && latest ? currentNocSnapshot(engagement, override) : null,
    viewer: { staff, canChangeTemplate: isAdminOrManager(ctx.role) },
  });
}

/** GET: the NOC state. A client gets no staff block; a foreign engagement returns null. */
export async function getNocState(ctx: AuthContext, appOrDbId: string): Promise<NocState | null> {
  if (ctx.role === 'developer' || ctx.role === 'partner') return null;
  const engagement = await getEngagementById(ctx, engagementDbId(appOrDbId));
  if (!engagement) return null;
  const row = await loadRow(engagement.id);
  // A client reads the document only after release, the same rule as the board resolution row.
  if (ctx.role === 'client' && row?.status !== 'finalized') return stateFor(ctx, engagement, null);
  return stateFor(ctx, engagement, row);
}

/** The staff template override, for the generate route. Null follows the project answers. */
export async function getNocTemplateOverride(ctx: AuthContext, appOrDbId: string): Promise<NocVariant | null> {
  const engagement = await requireEngagement(ctx, appOrDbId);
  const row = await loadRow(engagement.id);
  return parseNocVariant(row?.templateVariant);
}

async function update(engagementId: string, set: Partial<typeof engagementBoardResolutions.$inferInsert>): Promise<BrRow> {
  const [row] = await db
    .update(engagementBoardResolutions)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(engagementBoardResolutions.engagementId, engagementId))
    .returning();
  if (!row) throw new Error('Board resolution not found');
  return row;
}

async function requireReceivable(ctx: AuthContext, appOrDbId: string) {
  requireStaff(ctx);
  const engagement = await requireEngagement(ctx, appOrDbId);
  const row = await loadRow(engagement.id);
  if (!row || row.status !== 'finalized') throw new Error('Board resolution is not finalized');
  if (!row.signedStoragePath?.trim()) throw new Error('no_signed_copy');
  if (row.acceptedAt) throw new Error('already_accepted');
  return { engagement, row };
}

/**
 * T5: tick or untick one receive check. The notary stamp also stamps Notarised and the
 * apostille certificate stamps Apostilled (cleared again when unticked).
 */
export async function setNocCheck(
  ctx: AuthContext,
  appOrDbId: string,
  key: string,
  ticked: boolean,
): Promise<NocState> {
  const { engagement, row } = await requireReceivable(ctx, appOrDbId);
  const foreign = isForeignVariant(effectiveNocVariant(rowInput(row), engagement));
  if (!isNocCheckKey(key) || !nocReceiveChecks(foreign, row.notaryStepsOff).some((c) => c.key === key)) {
    throw new Error('unknown_check');
  }
  const now = new Date();
  const checks = parseReceiveChecks(row.receiveChecks);
  if (ticked) checks[key] = { by: ctx.userId, at: now.toISOString() };
  else delete checks[key];
  const set: Partial<typeof engagementBoardResolutions.$inferInsert> = { receiveChecks: checks };
  const step = NOC_CHECK_STEP[key];
  if (step === 'notarised') Object.assign(set, ticked ? { notarisedAt: now, notarisedBy: ctx.userId } : { notarisedAt: null, notarisedBy: null });
  if (step === 'apostilled') Object.assign(set, ticked ? { apostilledAt: now, apostilledBy: ctx.userId } : { apostilledAt: null, apostilledBy: null });
  const next = await update(engagement.id, set);
  return stateFor(ctx, engagement, next);
}

/**
 * T5 and T6: Accept the signed copy. Refused until every check is ticked. Files the copy to the
 * Vault under the signed board resolution step (pre-3), shared with the client.
 */
export async function acceptNoc(ctx: AuthContext, appOrDbId: string): Promise<NocState> {
  const { engagement, row } = await requireReceivable(ctx, appOrDbId);
  if (!nocMayAccept(rowInput(row), engagement)) throw new Error('checks_incomplete');
  const objectKey = row.signedStoragePath!.trim();
  let vaultDocumentId: string | null = row.vaultDocumentId ?? null;
  try {
    const doc = await createDocument(ctx, {
      engagementId: engagement.id,
      fileName: objectKey.split('/').pop()?.replace(/^\d+-/, '') || 'board-resolution-signed.pdf',
      objectKey,
      category: 'Board resolution',
      contentType: /\.pdf$/i.test(objectKey) ? 'application/pdf' : null,
      stepId: 'pre-3',
      sharedWithClient: true,
    });
    vaultDocumentId = doc.id;
  } catch (err) {
    // The Vault index is secondary: the Accept itself must not fail on it.
    console.error('[board-resolution] could not file the signed copy to the Vault', err);
  }
  const now = new Date();
  const next = await update(engagement.id, {
    acceptedAt: now,
    acceptedBy: ctx.userId,
    sentBackAt: null,
    sentBackBy: null,
    sentBackReason: null,
    vaultDocumentId,
  });
  return stateFor(ctx, engagement, next);
}

/** T5: Send back with a reason. The route tells the client. */
export async function sendBackNoc(ctx: AuthContext, appOrDbId: string, reason: string): Promise<NocState> {
  const text = reason.trim();
  if (!text) throw new Error('reason_required');
  const { engagement } = await requireReceivable(ctx, appOrDbId);
  const next = await update(engagement.id, {
    sentBackAt: new Date(),
    sentBackBy: ctx.userId,
    sentBackReason: text.slice(0, 2000),
  });
  return stateFor(ctx, engagement, next);
}

/** T2: Change template (manager, admin, super admin) with a reason; the route writes the audit line. */
export async function changeNocTemplate(
  ctx: AuthContext,
  appOrDbId: string,
  variant: string,
  reason: string,
): Promise<NocState> {
  requireTemplateRole(ctx);
  const chosen = parseNocVariant(variant);
  if (!chosen) throw new Error('unknown_variant');
  const text = reason.trim();
  if (!text) throw new Error('reason_required');
  const engagement = await requireEngagement(ctx, appOrDbId);
  const row = await loadRow(engagement.id);
  if (!row) throw new Error('Board resolution draft not found — generate it first');
  if (row.acceptedAt) throw new Error('already_accepted');
  const next = await update(engagement.id, {
    templateVariant: chosen,
    templateChangedAt: new Date(),
    templateChangedBy: ctx.userId,
    templateChangeReason: text.slice(0, 2000),
  });
  return stateFor(ctx, engagement, next);
}

/** D1: turn the notary and apostille steps off (or on) for one foreign-parent client. */
export async function setNocNotarySteps(ctx: AuthContext, appOrDbId: string, off: boolean): Promise<NocState> {
  requireTemplateRole(ctx);
  const engagement = await requireEngagement(ctx, appOrDbId);
  const row = await loadRow(engagement.id);
  if (!row) throw new Error('Board resolution draft not found — generate it first');
  if (!isForeignVariant(effectiveNocVariant(rowInput(row), engagement))) throw new Error('not_foreign_parent');
  const next = await update(engagement.id, { notaryStepsOff: off });
  return stateFor(ctx, engagement, next);
}

export interface NocVersionDto {
  version: number;
  variant: string;
  createdAt: string;
  byName?: string;
  fields: Record<string, string>;
}

/**
 * Record a draft version (T4) after a generate. Staff only; skipped when the snapshot equals the
 * latest one, so saving inline edits or re-making an unchanged draft adds no noise.
 */
export async function recordBoardResolutionVersion(
  ctx: AuthContext,
  appOrDbId: string,
  input: { variant: string; fields: Record<string, string> },
): Promise<number | null> {
  requireStaff(ctx);
  const engagement = await requireEngagement(ctx, appOrDbId);
  const latest = await latestVersionOf(engagement.id);
  if (latest && JSON.stringify(latest.fields) === JSON.stringify(input.fields)) return latest.version;
  const version = (latest?.version ?? 0) + 1;
  await db.insert(engagementBoardResolutionVersions).values({
    engagementId: engagement.id,
    version,
    variant: input.variant,
    fields: input.fields,
    createdBy: ctx.userId,
  });
  return version;
}

/** T4: every version, newest first. Staff only. */
export async function listBoardResolutionVersions(ctx: AuthContext, appOrDbId: string): Promise<NocVersionDto[]> {
  requireStaff(ctx);
  const engagement = await requireEngagement(ctx, appOrDbId);
  const rows = await db
    .select()
    .from(engagementBoardResolutionVersions)
    .where(eq(engagementBoardResolutionVersions.engagementId, engagement.id))
    .orderBy(desc(engagementBoardResolutionVersions.version));
  const names = await namesFor(rows.map((r) => r.createdBy));
  return rows.map((r) => ({
    version: r.version,
    variant: r.variant,
    createdAt: r.createdAt.toISOString(),
    ...(r.createdBy && names.get(r.createdBy) ? { byName: names.get(r.createdBy) } : {}),
    fields: (r.fields ?? {}) as Record<string, string>,
  }));
}
