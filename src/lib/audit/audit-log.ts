import type { DbRole } from '@/lib/auth';
import { getItem } from '@/data/checklist';

/**
 * Audit log — PURE display/formatting half.
 *
 * The original file also held `recordAuditEvent`, which wrote to Postgres
 * through a Supabase client. Writing now lives behind the seam in
 * src/db/repositories/audit-events.ts, because only repositories may touch
 * `db`. Everything in THIS file is pure and client-safe, which is what the
 * Audit Log view and the app provider actually import.
 *
 * Keep it that way: no `@/db/*` or `@/storage/*` imports here.
 */

type AuditAction =
  | 'engagement.create'
  | 'engagement.update'
  | 'engagement.progress_cc_update'
  | 'checklist.submit'
  | 'checklist.review'
  | 'checklist.unlock'
  | 'checklist.deliver'
  | 'board_resolution.generate'
  | 'board_resolution.finalize'
  | 'board_resolution.signed_upload'
  | 'dir_2.generate'
  | 'incorporation_docs.generate'
  | 'milestone_document.upload'
  | 'milestone_document.remove'
  | 'knowledge_bank.upload'
  | 'knowledge_bank.delete'
  | 'intern.create'
  | 'welcome_email.send'
  | 'welcome_email.resend'
  | 'client.invite'
  | 'client.substitute';

/**
 * Shape returned by the audit API. Field names stay snake_case to match the
 * original row shape the Audit Log view renders.
 */
export interface AuditEventRow {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_role: DbRole;
  actor_email: string | null;
  actor_name: string | null;
  engagement_id: string | null;
  action: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  /** What happened to the action: ok, failed or denied (G-28). Older rows read as ok. */
  result?: AuditResult;
}

export type AuditResult = 'ok' | 'failed' | 'denied';

/** The stored result as one of the three words; anything unknown reads as ok. */
export function auditResultOf(row: Pick<AuditEventRow, 'result'>): AuditResult {
  return row.result === 'failed' || row.result === 'denied' ? row.result : 'ok';
}

export interface RecordAuditEventInput {
  engagementId?: string | null;
  action: AuditAction | string;
  summary: string;
  metadata?: Record<string, unknown>;
  /** Defaults to ok. Write denied when a guard refused the action, failed when it threw. */
  result?: AuditResult;
  actorUserId?: string;
  actorRole?: DbRole;
  actorEmail?: string | null;
  actorName?: string | null;
}

export function checklistItemLabel(itemId: string): string {
  return getItem(itemId)?.title ?? itemId;
}

export function formatActorDisplay(
  row: Pick<AuditEventRow, 'actor_name' | 'actor_email' | 'actor_role'>,
): string {
  const name = row.actor_name?.trim();
  const email = row.actor_email?.trim();
  if (name && email) return `${name} (${email})`;
  return name || email || row.actor_role;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'engagement.create': 'Project created',
  'engagement.update': 'Project updated',
  'engagement.progress_cc_update': 'Progress CC recipients updated',
  'checklist.submit': 'Milestone submitted',
  'checklist.review': 'Milestone reviewed',
  'checklist.unlock': 'Milestone unlocked',
  'checklist.deliver': 'Milestone delivered to client',
  'board_resolution.generate': 'Board resolution generated',
  'board_resolution.finalize': 'Board resolution finalized',
  'board_resolution.signed_upload': 'Signed board resolution uploaded',
  'dir_2.generate': 'DIR-2 generated',
  'incorporation_docs.generate': 'Incorporation document generated',
  'incorporation_docs.patch': 'Incorporation document edited',
  'incorporation_docs.share': 'Incorporation document shared',
  'incorporation_docs.share_all': 'All incorporation documents shared',
  'milestone_document.upload': 'Milestone document uploaded',
  'milestone_document.remove': 'Milestone document removed',
  'knowledge_bank.upload': 'Knowledge bank file uploaded',
  'knowledge_bank.delete': 'Knowledge bank file deleted',
  'intern.create': 'Team member created',
  'intern.delete': 'Team member deleted',
  'manager.create': 'Manager account created',
  'manager.delete': 'Manager account deleted',
  'account.update': 'Account updated',
  'welcome_email.send': 'Welcome email sent',
  'welcome_email.resend': 'Welcome email resent',
  'client.invite': 'Client invited to project',
  'client.substitute': 'Client substituted on project',
  'email_templates.create': 'Email template created',
  'email_templates.update': 'Email template updated',
  'email_templates.delete': 'Email template deleted',
  'email_templates.binding_create': 'Email binding created',
  'email_templates.binding_update': 'Email binding updated',
  'email_templates.binding_delete': 'Email binding deleted',
  'email_templates.fire': 'Checklist email sent',
  'email_templates.fire_skip': 'Checklist email skipped',
};

export type AuditActionCategory =
  | 'engagement'
  | 'checklist'
  | 'documents'
  | 'admin'
  | 'email'
  | 'other';

export function formatAuditActionLabel(action: string): string {
  const trimmed = action.trim();
  if (AUDIT_ACTION_LABELS[trimmed]) return AUDIT_ACTION_LABELS[trimmed];
  return trimmed
    .split('.')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

export function getAuditActionCategory(action: string): AuditActionCategory {
  const prefix = action.split('.')[0];
  switch (prefix) {
    case 'engagement':
      return 'engagement';
    case 'checklist':
      return 'checklist';
    case 'board_resolution':
    case 'dir_2':
    case 'incorporation_docs':
    case 'milestone_document':
    case 'knowledge_bank':
      return 'documents';
    case 'intern':
    case 'manager':
    case 'account':
    case 'client':
      return 'admin';
    case 'welcome_email':
    case 'email_templates':
      return 'email';
    default:
      return 'other';
  }
}

export function getAuditTargetType(action: string): string {
  const category = getAuditActionCategory(action);
  switch (category) {
    case 'engagement':
      return 'Project';
    case 'checklist':
      return 'Milestone';
    case 'documents':
      if (action.startsWith('board_resolution')) return 'Board resolution';
      if (action.startsWith('dir_2')) return 'DIR-2';
      if (action.startsWith('incorporation_docs')) return 'Incorporation docs';
      if (action.startsWith('knowledge_bank')) return 'Knowledge bank';
      return 'Document';
    case 'admin':
      return 'Team member';
    case 'email':
      return 'Email';
    default:
      return 'System';
  }
}

export function formatAuditMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata || !Object.keys(metadata).length) return null;
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}
