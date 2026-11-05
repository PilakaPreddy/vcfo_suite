'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NoirDatePicker } from '@/components/noir/NoirDatePicker';
import { toastSaved } from '@/components/ui/toast-saved';
import { useSetExpectedCoi } from '@/components/metrics/use-metrics';
import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { setEngagementWindowInDb } from '@/lib/projects/engagements-db';
import { canSetScheduleWindows, isValidWindowRange } from '@/lib/projects/schedule-windows';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { GanttTimeline } from './GanttTimeline';
import { buildRecordTimeline } from './timeline-model';

/**
 * TIMELINE CARD on every staff client record (R-21; prototype `ClientRecordScreen` timeline card):
 * a flush "Timeline" card with the Gantt, and "Edit" for the roles that may set dates.
 *
 * "Edit the timeline" writes only what the real tool stores for a plan: the incorporation window
 * (SPICe+ Part A and Part B, `POST /api/engagements/:id/schedule`) and, before the certificate,
 * the expected COI (`PUT /api/engagements/:id/expected-coi`). Post-incorporation and registration
 * dates follow their steps' own windows, which the step pages set. Managers, admins and super
 * admins edit (`canSetScheduleWindows`, the same rule the repository enforces); project leads
 * read the card without "Edit".
 */
export function RecordTimelineCard({
  engagement,
  state,
  role,
  className,
}: {
  engagement: Engagement;
  state: Record<string, ChecklistItemStateSlice | undefined> | undefined;
  /** The session role; decides whether "Edit" shows. */
  role: string | null | undefined;
  className?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const timeline = useMemo(
    () =>
      buildRecordTimeline({
        state,
        schedule: engagement.schedule,
        expectedCoiOn: engagement.expectedCoiOn,
        incorporationDate: engagement.incorporationDate,
        today,
      }),
    [state, engagement.schedule, engagement.expectedCoiOn, engagement.incorporationDate, today],
  );
  const canEdit = canSetScheduleWindows(role);
  const [editing, setEditing] = useState(false);
  const empty = !timeline.start;

  return (
    <section className={cn('surface min-w-0 overflow-hidden', className)} aria-label="Timeline">
      <div className="flex min-h-[52px] min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title="Timeline" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">Timeline</h2>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : null}
      </div>
      {empty ? (
        <div className="p-4">
          <EmptyState
            title="No dates set yet"
            action={
              canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Set dates
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <GanttTimeline timeline={timeline} today={today} />
      )}
      {canEdit ? <EditTimelineDialog open={editing} onOpenChange={setEditing} engagement={engagement} /> : null}
    </section>
  );
}

function EditTimelineDialog({
  open,
  onOpenChange,
  engagement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagement: Engagement;
}) {
  const queryClient = useQueryClient();
  const setCoi = useSetExpectedCoi();
  const win = engagement.schedule?.incorporation;
  const [from, setFrom] = useState(win?.from ?? '');
  const [to, setTo] = useState(win?.to ?? '');
  const [coi, setCoiOn] = useState(engagement.expectedCoiOn ?? '');
  const [busy, setBusy] = useState(false);
  const incorporated = Boolean(engagement.incorporationDate);

  const reset = () => {
    setFrom(win?.from ?? '');
    setTo(win?.to ?? '');
    setCoiOn(engagement.expectedCoiOn ?? '');
  };

  const windowBlank = !from && !to;
  const windowValid = windowBlank || isValidWindowRange(from, to);
  const coiValid = !coi || /^\d{4}-\d{2}-\d{2}$/.test(coi);
  const windowChanged = (win?.from ?? '') !== from || (win?.to ?? '') !== to;
  const coiChanged = !incorporated && (engagement.expectedCoiOn ?? '') !== coi;

  const save = async () => {
    if (!windowChanged && !coiChanged) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      if (windowChanged) {
        await setEngagementWindowInDb(engagement.id, { kind: 'incorporation' }, windowBlank ? null : { from, to });
      }
      if (coiChanged) {
        await setCoi.mutateAsync({ engagementId: engagement.id, on: coi || null });
      }
      await queryClient.invalidateQueries({ queryKey: ['engagements'] });
      toastSaved('Timeline saved', { sub: 'The client sees the new dates.', id: `timeline:${engagement.id}` });
      onOpenChange(false);
    } catch (err) {
      toastError('Could not save the timeline', errorMessage(err, 'Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit the timeline</DialogTitle>
          <DialogDescription className="truncate">{engagement.companyName}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[12.5px] font-medium text-ink-muted">Incorporation · SPICe+ Part A and Part B</legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1 text-[12px] text-ink-muted">
                <label htmlFor="timeline-inc-from">From</label>
                <NoirDatePicker id="timeline-inc-from" value={from} onChange={setFrom} invalid={!windowValid} />
              </div>
              <div className="grid gap-1 text-[12px] text-ink-muted">
                <label htmlFor="timeline-inc-to">To</label>
                <NoirDatePicker id="timeline-inc-to" value={to} onChange={setTo} invalid={!windowValid} />
              </div>
            </div>
            {!windowValid ? <p className="text-[12px] text-danger">Set both dates, and the end on or after the start.</p> : null}
          </fieldset>
          {!incorporated ? (
            <div className="grid gap-1 text-[12.5px] font-medium text-ink-muted">
              <label htmlFor="timeline-coi">Expected COI</label>
              <NoirDatePicker id="timeline-coi" value={coi} onChange={setCoiOn} invalid={!coiValid} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !windowValid || !coiValid}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
