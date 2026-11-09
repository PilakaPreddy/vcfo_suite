'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Undo2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { BoardResolutionDocPreview } from '@/components/board-resolution/BoardResolutionDocPreview';
import { FitToWidth } from '@/components/board-resolution/FitToWidth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useApp } from '@/context/AppContext';
import { getItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import { isLeadRequestPending } from '@/lib/checklist/checklist-item-review';
import {
  extractItemResponses,
  fieldsForOwnership,
  getClientResponseFields,
} from '@/lib/checklist/checklist-responses';
import { isRepeatField, repeatEntries } from '@/lib/checklist/checklist-repeat';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { approveBoardResolutionInDb } from '@/lib/projects/engagements-db';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';

/**
 * The manager's side of the one pre-incorporation approval (`pre-2`): the
 * board resolution the project lead sent, a download, and the Client Details
 * it was built from — read-only. "Approve and send to client" releases it;
 * "Send back" returns it to the lead with a note. The lead's editor is never
 * opened to the manager.
 */
export function ManagerBoardResolutionReview({
  engagement,
  pre2State,
  pre1State,
}: {
  engagement: Engagement;
  pre2State?: ChecklistItemStateSlice;
  pre1State?: ChecklistItemStateSlice;
}) {
  const { reviewChecklistItem, refreshEngagementChecklist, user } = useApp();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'approve' | 'back' | null>(null);
  const [backOpen, setBackOpen] = useState(false);
  const [note, setNote] = useState('');

  const pending = isLeadRequestPending(pre2State);
  const canDecide = user?.role === 'manager' || user?.role === 'admin' || user?.role === 'super_admin';
  const downloadUrl = `/api/engagements/${engagement.id}/board-resolution/download`;

  const clientDetails = useMemo(() => {
    const item = getItem('pre-1');
    if (!item) return [];
    const responses = extractItemResponses(item, pre1State);
    const rows: Array<{ id: string; label: string; value: string }> = [];
    for (const field of fieldsForOwnership(item.id, getClientResponseFields(item), engagement.ownershipType)) {
      if (isRepeatField(field)) {
        repeatEntries(responses, field).forEach((entry) => {
          const value = Object.values(entry.values).filter((v) => v.trim()).join(' · ');
          if (value) rows.push({ id: `${field.id}.${entry.id}`, label: `${field.entryLabel ?? field.label} ${entry.index}`, value });
        });
        continue;
      }
      const raw = (responses[field.id] ?? '').trim();
      if (!raw) continue;
      const value =
        field.type === 'file'
          ? 'Uploaded'
          : field.options?.find((option) => option.value === raw)?.label ?? raw;
      rows.push({ id: field.id, label: field.label, value });
    }
    return rows;
  }, [pre1State, engagement.ownershipType]);

  const refresh = async () => {
    await refreshEngagementChecklist(engagement.id);
    void queryClient.invalidateQueries({ queryKey: ['doc-pack', engagement.id] });
  };

  const approve = async () => {
    setBusy('approve');
    try {
      await approveBoardResolutionInDb(engagement.id);
      await refresh();
      toastSuccess('Board resolution approved', 'The client can now download, sign and upload it.');
    } catch (err) {
      toastError('Could not approve', errorMessage(err, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  const sendBack = async () => {
    if (!note.trim()) return;
    setBusy('back');
    try {
      await reviewChecklistItem(engagement.id, 'pre-2', 'reject', note.trim());
      setBackOpen(false);
      setNote('');
      await refresh();
      toastSuccess('Sent back to the project lead');
    } catch (err) {
      toastError('Could not send back', errorMessage(err, 'Try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* The Word page is ~800px; scale it into this column so it never runs under the rail. */}
      <FitToWidth>
        <BoardResolutionDocPreview engagementId={engagement.id} downloadUrl={downloadUrl} />
      </FitToWidth>
      <a
        href={downloadUrl}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Download board resolution
      </a>

      <section aria-label="Client Details used by the board resolution" className="milestone-record-panel">
        <p className="mb-2 text-[11.5px] font-semibold tracking-[0.06em] text-ink">Client Details</p>
        {clientDetails.length === 0 ? (
          <p className="text-sm text-ink-muted">No Client Details yet.</p>
        ) : (
          <dl className="milestone-record">
            {clientDetails.map((row) => (
              <div key={row.id} className="milestone-record-row">
                <dt className="milestone-record-label">{row.label}</dt>
                <dd className="milestone-record-value whitespace-pre-wrap text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {pending && canDecide ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setBackOpen(true)}>
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Send back
          </Button>
          <Button type="button" variant="success" size="sm" disabled={busy !== null} onClick={() => void approve()}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {busy === 'approve' ? 'Approving…' : 'Approve and send to client'}
          </Button>
        </div>
      ) : null}

      <Dialog open={backOpen} onOpenChange={setBackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send the board resolution back</DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            maxLength={2000}
            aria-label="What should the project lead change"
            placeholder="Tell the project lead what to change."
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBackOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!note.trim() || busy !== null} onClick={() => void sendBack()}>
              {busy === 'back' ? 'Sending…' : 'Send back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
