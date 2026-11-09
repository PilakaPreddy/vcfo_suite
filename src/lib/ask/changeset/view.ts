import 'server-only';

import type { AuthContext } from '@/auth/guards';
import { getItem } from '@/data/checklist';
import { getAskChangesetSummary } from '@/db/repositories/ask-changesets';
import { fieldOf, rowCanApply, type ResponseTarget } from '@/lib/actions/checklist/rules';
import { canDecideRow } from './apply';
import type { ChangesetRowStatus, ChangesetStatus } from './types';
import type { ChangesetRowView, ChangesetView } from './view-types';

export async function loadChangesetView(ctx: AuthContext, id: string): Promise<ChangesetView | null> {
  const found = await getAskChangesetSummary(ctx, id);
  if (!found) return null;
  const { changeset } = found;
  const rows = found.rows.map((row): ChangesetRowView => {
    const target = row.target as unknown as ResponseTarget;
    const field = target.stepId ? fieldOf(target) : null;
    const pageNote = row.source?.page ? `page ${row.source.page}` : '';
    const source =
      row.source?.kind === 'attachment' ? [row.source.fileName, pageNote].filter(Boolean).join(', ') || 'Attached file' : row.source?.kind === 'paste' ? 'Pasted text' : row.source?.kind === 'message' ? 'Your message' : null;
    const open = row.status === 'proposed' || row.status === 'edited' || row.status === 'held' || row.status === 'failed';
    return {
      id: row.id,
      stepId: target.stepId ?? null,
      stepTitle: target.stepId ? (getItem(target.stepId)?.title ?? target.stepId) : null,
      label: row.label,
      displayOld: row.displayOld,
      displayNew: row.displayNew,
      sensitive: row.sensitive,
      source,
      checks: row.checks,
      status: row.status as ChangesetRowStatus,
      heldReason: row.heldReason,
      error: row.error,
      canDecide: canDecideRow(found, row),
      canAccept: open && rowCanApply(row.checks),
      needsLook: row.checks.some((check) => !check.ok),
      editable: open && row.action === 'checklist.setResponse',
      ...(field?.options?.length ? { options: field.options.map((o) => ({ value: o.value, label: o.label })) } : {}),
      inputType: field?.options?.length ? 'choice' : field?.type === 'date' ? 'date' : 'text',
    };
  });
  return {
    id: changeset.id,
    title: changeset.title,
    tier: changeset.tier === 'T3' ? 'T3' : 'T2',
    recipients: (changeset.recipients ?? []).map((r) => ({ name: r.name, ...(r.email ? { email: r.email } : {}) })),
    companyName: found.companyName,
    engagementId: changeset.engagementId,
    status: changeset.status as ChangesetStatus,
    contentHash: changeset.contentHash,
    expiresAt: changeset.expiresAt.toISOString(),
    canUndo: (found.owner || changeset.decidedById === ctx.userId) && found.rows.some((row) => row.status === 'applied'),
    rows,
  };
}
