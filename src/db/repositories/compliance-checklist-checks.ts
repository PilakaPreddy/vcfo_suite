import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { complianceChecklistChecks, profiles } from '@/db/schema';
import type { AuthContext } from '@/auth/guards';
import { assertEngagementAccess } from '@/db/repositories/engagements';

/**
 * COMPLIANCE CHECKLIST CHECKS (migration 0028, S-783, S-816): the ticks on the "Before
 * filing" list of an obligation period or a registration. The lines themselves are static
 * data in `src/data/before-filing.ts`; a row here means "this line is done", and unticking
 * deletes the row.
 *
 * subjectKind 'obligation' keys the list by the compliance instance id (one period of one
 * client); 'registration' keys it by the registration step id within the engagement.
 *
 * >>> ACCESS CONTROL (Path A) <<<
 *   Staff only ("Staff only" on the card): super admin and admin on every engagement, a
 *   manager on owned or co-managed engagements, a lead on assigned engagements, all through
 *   `assertEngagementAccess`. Clients and developers are refused before any query. A foreign
 *   engagement reads as no ticks and a write to it changes nothing. Writes go against the
 *   approved engagement id, never the id the caller sent.
 */

export type ChecklistSubjectKind = 'obligation' | 'registration';

export interface ChecklistTick {
  itemKey: string;
  checkedBy: string | null;
  checkedAt: string;
}

class ChecklistForbiddenError extends Error {
  readonly status = 403;
  constructor() {
    super('Only firm staff can use the checklist');
  }
}

const STAFF = new Set(['super_admin', 'admin', 'manager', 'intern']);
const KEY = /^[A-Za-z0-9_.:~-]{1,120}$/;

function assertStaff(ctx: AuthContext) {
  if (!STAFF.has(ctx.role)) throw new ChecklistForbiddenError();
}

export interface ChecklistSubject {
  engagementId: string;
  subjectKind: ChecklistSubjectKind;
  subjectKey: string;
}

function validSubject(s: ChecklistSubject): boolean {
  return (s.subjectKind === 'obligation' || s.subjectKind === 'registration') && KEY.test(s.subjectKey);
}

/** The ticks of one list. A foreign engagement reads as none. */
export async function listChecklistTicks(ctx: AuthContext, subject: ChecklistSubject): Promise<ChecklistTick[]> {
  assertStaff(ctx);
  if (!validSubject(subject)) return [];
  const access = await assertEngagementAccess(ctx, subject.engagementId);
  if (!access.ok) return [];
  const rows = await db
    .select({
      itemKey: complianceChecklistChecks.itemKey,
      checkedBy: profiles.name,
      checkedAt: complianceChecklistChecks.checkedAt,
    })
    .from(complianceChecklistChecks)
    .leftJoin(profiles, eq(profiles.id, complianceChecklistChecks.checkedBy))
    .where(
      and(
        eq(complianceChecklistChecks.engagementId, access.dbId),
        eq(complianceChecklistChecks.subjectKind, subject.subjectKind),
        eq(complianceChecklistChecks.subjectKey, subject.subjectKey),
      ),
    );
  return rows.map((r) => ({
    itemKey: r.itemKey,
    checkedBy: r.checkedBy ?? null,
    checkedAt: r.checkedAt instanceof Date ? r.checkedAt.toISOString() : String(r.checkedAt),
  }));
}

/** Tick or untick one line. Returns false when the engagement is outside the caller's scope. */
export async function setChecklistTick(
  ctx: AuthContext,
  subject: ChecklistSubject & { itemKey: string; checked: boolean },
): Promise<boolean> {
  assertStaff(ctx);
  if (!validSubject(subject) || !KEY.test(subject.itemKey)) return false;
  const access = await assertEngagementAccess(ctx, subject.engagementId);
  if (!access.ok) return false;
  const match = and(
    eq(complianceChecklistChecks.engagementId, access.dbId),
    eq(complianceChecklistChecks.subjectKind, subject.subjectKind),
    eq(complianceChecklistChecks.subjectKey, subject.subjectKey),
    eq(complianceChecklistChecks.itemKey, subject.itemKey),
  );
  if (subject.checked) {
    await db
      .insert(complianceChecklistChecks)
      .values({
        engagementId: access.dbId,
        subjectKind: subject.subjectKind,
        subjectKey: subject.subjectKey,
        itemKey: subject.itemKey,
        checkedBy: ctx.userId,
      })
      .onConflictDoNothing();
  } else {
    await db.delete(complianceChecklistChecks).where(match);
  }
  return true;
}
