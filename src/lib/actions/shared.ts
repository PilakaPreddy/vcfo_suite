import 'server-only';

import { z } from 'zod';
import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { getOwnAskAttachments, type AskAttachmentRow } from '@/db/repositories/ask-attachments';
import { resolveEngagementRecipients } from '@/db/repositories/engagement-recipients';
import { checklistStateFromRow, getEngagementById } from '@/db/repositories/engagements';
import type { ChangesetDraft, ChangesetRecipient, JsonValue, RowCheck, RowSource } from '@/lib/ask/changeset/types';
import { engagementDbId } from '@/lib/projects/legacy-engagement-ids';
import { getObjectBuffer } from '@/storage/s3';
import type { ActionContext, ActionRecheck } from './types';

/**
 * Helpers the chat actions share. Every read goes through a scoped repository as the person, so an
 * action on a client outside their scope fails here exactly as the screen would.
 */

export const STAFF_ROLES = ['super_admin', 'admin', 'manager', 'intern'] as const;

/** A calendar day as the screens store it. */
export const dayInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30');

export async function loadEngagement(auth: AuthContext, engagementId: string) {
  const row = await getEngagementById(auth, engagementDbId(engagementId));
  return row ? { row, state: checklistStateFromRow(row), companyName: row.companyName } : null;
}

/** The client members who will see an outward action; read only after the scope check above. */
export async function clientRecipients(engagementId: string): Promise<ChangesetRecipient[]> {
  const found = await resolveEngagementRecipients(engagementId);
  if (!found) return [];
  const parties = found.clients.length > 0 ? found.clients : found.client ? [found.client] : [];
  return parties.map((p) => ({ name: p.name || p.email, email: p.email, role: 'client' }));
}

export const stepTitle = (stepId: string | undefined) => (stepId ? (getItem(stepId)?.title ?? stepId) : null);

export const unavailable = (message = 'This project is not available.'): ActionRecheck => ({
  checks: [{ rule: 'scope', ok: false, message }],
  heldReason: message,
  canApply: false,
  oldValue: '',
  value: '',
  displayOld: '',
  displayNew: '',
  sensitive: false,
});

/** One-row card: the shape every non-checklist action proposes. */
export function oneRow(input: {
  title: string;
  tier: 'T2' | 'T3';
  engagementId: string;
  action: string;
  target: { [key: string]: JsonValue };
  label: string;
  checked: ActionRecheck;
  recipients?: ChangesetRecipient[];
  /** Where the change came from; a file action names its chat attachment. Defaults to the message. */
  source?: RowSource;
}): ChangesetDraft {
  const { checked } = input;
  return {
    title: input.title,
    tier: input.tier,
    engagementId: input.engagementId,
    ...(input.recipients ? { recipients: input.recipients } : {}),
    rows: [
      {
        action: input.action,
        target: input.target,
        label: input.label,
        oldValue: checked.oldValue,
        newValue: checked.value,
        displayOld: checked.displayOld,
        displayNew: checked.displayNew,
        sensitive: false,
        source: input.source ?? { kind: 'message' },
        checks: checked.checks,
        ...(checked.heldReason ? { heldReason: checked.heldReason } : {}),
      },
    ],
  };
}

export function recheckOf(checks: RowCheck[], fields: Pick<ActionRecheck, 'oldValue' | 'value' | 'displayOld' | 'displayNew'>): ActionRecheck {
  const failed = checks.find((c) => !c.ok);
  return { checks, heldReason: failed?.message ?? null, canApply: !failed, sensitive: false, ...fields };
}

/** Drops undefined keys so a target stays valid JSON for the changeset hash. */
export function jsonTarget(input: Record<string, unknown>): { [key: string]: JsonValue } {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as { [key: string]: JsonValue };
}

/**
 * A file the person attached in chat, read as that person: `getOwnAskAttachments` only returns the
 * caller's own uploads, so a row naming somebody else's file finds nothing. It reads the row only;
 * `copyAskAttachment` reads the bytes too.
 */
export async function findAskAttachment(actx: Pick<ActionContext, 'auth'>, attachmentId: string): Promise<AskAttachmentRow | null> {
  const [row] = await getOwnAskAttachments(actx.auth, [attachmentId]);
  return row?.s3Key ? row : null;
}

export interface CopiedAttachment {
  bytes: Buffer;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
}

/**
 * The bytes of a chat attachment, for an action that files them somewhere else. Each action writes
 * them under its own key (milestone documents, the vault, a labour batch), so this only reads.
 */
export async function copyAskAttachment(actx: Pick<ActionContext, 'auth'>, attachmentId: string): Promise<CopiedAttachment | null> {
  const row = await findAskAttachment(actx, attachmentId);
  const bytes = row?.s3Key ? await getObjectBuffer(row.s3Key) : null;
  if (!row || !bytes) return null;
  return { bytes, fileName: row.fileName, contentType: row.contentType ?? null, sizeBytes: bytes.byteLength };
}

