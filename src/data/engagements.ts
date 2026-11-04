import { checklist, StatusCode } from './checklist';
import type { EntityLegalForm } from '@/lib/compliance/types';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';

export type CompanyType = 'domestic' | 'foreign';
/**
 * subsidiary = a parent entity (Indian or overseas) is incorporating this
 * company, so parent details, its board resolution and signatory KYC apply;
 * independent = a standalone company with no parent — none of that is asked.
 */
export type OwnershipType = 'subsidiary' | 'independent';
export type { EntityLegalForm };

/**
 * What an Indian parent does for a group company: lends its name only, or
 * subscribes to shares. Decides which NOC applies (see `src/lib/noc/variant.ts`).
 * Only meaningful for subsidiary + domestic; null everywhere else.
 */
export type ParentIndianRelationship = 'name_only' | 'investing';

export function coerceOwnershipType(value: unknown): OwnershipType {
  return value === 'independent' ? 'independent' : 'subsidiary';
}

export function coerceParentIndianRelationship(value: unknown): ParentIndianRelationship | null {
  return value === 'name_only' || value === 'investing' ? value : null;
}

/** True when the Indian parent's role must be chosen (Indian subsidiary). */
export function requiresParentIndianRelationship(e: {
  ownershipType?: string | null;
  companyType?: string | null;
}): boolean {
  return coerceOwnershipType(e.ownershipType) === 'subsidiary' && e.companyType === 'domestic';
}

/**
 * Applies the invariant: the Indian parent's role survives only for Group
 * company + Indian parent; everywhere else it is forced to null. Returns
 * `missing: true` when it is required but absent, so callers can reject.
 */
export function normalizeParentIndianRelationship(e: {
  ownershipType?: string | null;
  companyType?: string | null;
  parentIndianRelationship?: unknown;
}): { value: ParentIndianRelationship | null; missing: boolean } {
  if (!requiresParentIndianRelationship(e)) return { value: null, missing: false };
  const value = coerceParentIndianRelationship(e.parentIndianRelationship);
  return { value, missing: value === null };
}

/**
 * Ownership as shown on headers and pickers. Standalone rows are stored as
 * `domestic`, so `companyType` alone cannot tell "Indian parent" from
 * "no parent" — this can.
 */
export function ownershipDisplayLabel(
  e: Pick<Engagement, 'ownershipType' | 'companyType' | 'parentIndianRelationship'>,
): string {
  if (coerceOwnershipType(e.ownershipType) === 'independent') return 'Standalone';
  if (e.companyType === 'foreign') return 'Foreign subsidiary';
  switch (coerceParentIndianRelationship(e.parentIndianRelationship)) {
    case 'name_only':
      return 'Indian subsidiary (name use)';
    case 'investing':
      return 'Indian subsidiary (investing)';
    default:
      return 'Indian subsidiary';
  }
}

/** Steps that only exist for a parent entity's board (see pre-1 boardResolutionDate). */
export const PARENT_ENTITY_ONLY_STEP_IDS = ['pre-2', 'pre-3'] as const;

export interface Engagement {
  id: string;
  /** URL slug from company name (Supabase engagements.slug) */
  slug?: string;
  clientId: string;
  companyName: string;
  /** domestic = India-incorporated; foreign = overseas parent / FEMA track */
  companyType: CompanyType;
  /** Dependent (has a parent entity) or Independent (standalone). Missing = subsidiary. */
  ownershipType?: OwnershipType;
  /** Indian parent's role (Indian subsidiary only). null = not applicable or not yet chosen. */
  parentIndianRelationship?: ParentIndianRelationship | null;
  /** Manager-set date windows (incorporation + per step). See `schedule-windows.ts`. */
  schedule?: EngagementSchedule;
  /** The date the firm expects the certificate of incorporation (YYYY-MM-DD; G-13). */
  expectedCoiOn?: string | null;
  /** Indian legal form for compliance calendar filtering */
  entityLegalForm?: EntityLegalForm;
  /** Synced from checklist pre-12 */
  incorporationDate?: string | null;
  /** Full legal name of the parent entity (overseas or group parent). */
  parentEntityName?: string | null;
  /** Full registered address of the parent entity. */
  parentEntityAddress?: string | null;
  /** Registration or incorporation number of the parent entity. */
  parentEntityRegistrationNumber?: string | null;
  /** India subsidiary / GCC legal name (Registration / Compliance start). */
  subsidiaryLegalName?: string | null;
  /** India subsidiary registered address (Registration / Compliance start). */
  subsidiaryRegisteredAddress?: string | null;
  internId: string;
  /** All delivery leads on this project (includes primary). */
  leadIds?: string[];
  /** Firm admin who created/owns the engagement (optional on legacy rows). */
  adminId: string;
  /** Project manager assigned to the engagement. */
  managerId?: string;
  createdAt: string;
  stage: 'Pre-Incorporation' | 'Post-Incorporation' | 'Operational Readiness';
  health: 'on-track' | 'at-risk' | 'overdue';
  /** Supabase auth user for portal client; absent on legacy/local-only rows */
  clientUserId?: string | null;
  clientEmail?: string | null;
  clientDisplayName?: string | null;
  /** Compliance questionnaire answers captured at creation (question id → answer). */
  complianceQuestionnaire?: Record<string, boolean | number | string> | null;
}

export interface TaskInstance {
  id: string;
  engagementId: string;
  checklistKey: string;
  status: StatusCode;
  assigneeId?: string;
  dueAt?: string;
  notes?: string;
  /** Stored task title; set on rows from `/api/tasks` (an assigned task has no checklist key). */
  title?: string;
  /** Last change, ISO; set on rows from `/api/tasks`. */
  updatedAt?: string;
  /** When the task moved to done, ISO (`tasks.completed_at`); absent while open or when done before it was kept. */
  completedAt?: string;
  /** Who assigned the task to its holder (`tasks.assigned_by`, migration 0028); absent when self-assigned or older. */
  assignedById?: string;
  assignedByName?: string;
  /** The card's place in its Work board column (`tasks.sort_order`); absent keeps the default order. */
  sortOrder?: number | null;
}

export interface DocRequest {
  id: string;
  engagementId: string;
  taskId: string;
  label: string;
  status: 'pending' | 'uploaded' | 'approved' | 'rejected';
  fileName?: string;
  uploadedAt?: string;
  dueAt?: string;
  requestedBy: string;
  message?: string;
}

export interface ActivityEvent {
  id: string;
  engagementId?: string;
  actor: string;
  verb: string;
  target?: string;
  at: string;
}

/** Empty by default — projects come from Supabase or user-created local state. */
export const seedEngagements: Engagement[] = [];

// Map each starting phase to which buckets are completed, active, or upcoming.
// Operational Readiness = Phase 4 registrations (statutory bucket).
const PHASE_BUCKET_PLAN: Record<Engagement['stage'], {
  completed: Array<'pre-inc' | 'post-inc' | 'fema' | 'statutory'>;
  active: Array<'pre-inc' | 'post-inc' | 'fema' | 'statutory'>;
}> = {
  'Pre-Incorporation':   { completed: [],                      active: ['pre-inc'] },
  'Post-Incorporation':  { completed: ['pre-inc'],             active: ['post-inc'] },
  'Operational Readiness': { completed: ['pre-inc', 'post-inc'], active: ['statutory'] },
};

export function seedTasksFor(engagementId: string, stage: Engagement['stage']): TaskInstance[] {
  const plan = PHASE_BUCKET_PLAN[stage];

  // Track per-bucket counters so the first item in an active bucket becomes
  // in-progress, the next is awaiting-client, and the rest stay not-started.
  const activeBucketCounts: Record<string, number> = {};

  return checklist.map((it, i) => {
    let status: StatusCode = 'not-started';

    if (plan.completed.includes(it.bucket)) {
      status = 'completed';
    } else if (plan.active.includes(it.bucket)) {
      const n = activeBucketCounts[it.bucket] ?? 0;
      activeBucketCounts[it.bucket] = n + 1;
      if (n === 0) status = 'in-progress';
      else if (n === 1) status = 'awaiting-client';
      else status = 'not-started';
    }

    return {
      id: `${engagementId}-${it.id}`,
      engagementId,
      checklistKey: it.id,
      status,
      assigneeId: ['tm1', 'tm2', 'tm3'][i % 3],
    };
  });
}
