'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastSaved } from '@/components/ui/toast-saved';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { NewTaskDialog, type ClientOption, type NewTaskPayload, type TaskActivityOption } from '@/components/compliances/NewTaskDialog';
import { useActivities, useCreateTask, useTaskDefaults, type TaskRowDto } from '@/views/compliances/tasks/api';
import type { TaskRepeats } from '@/views/compliances/tasks/task-model';
import type { Engagement } from '@/data/engagements';

/** The activity frequency word to the form's repeat value. */
const REPEAT_OF: Record<string, TaskRepeats> = {
  Weekly: 'weekly',
  'Bi-weekly': 'bi-weekly',
  Monthly: 'monthly',
  Quarterly: 'quarterly',
  Yearly: 'yearly',
};

/**
 * The "New task" button and its dialog (S-4, S-5) for admin and manager. The activity list
 * comes from `GET /api/compliances/activities?group=non-statutory`; the people and the
 * defaults of the picked client from `GET /api/compliances/tasks/defaults`; Save posts to
 * `POST /api/compliances/tasks` and shows the A1 toast "Task created".
 */
export function NewTaskButton({
  engagements,
  defaultClient,
  now,
  onCreated,
  prefill,
  onPrefillDone,
  hideTrigger = false,
  openRequest = 0,
}: {
  engagements: Engagement[];
  defaultClient?: string;
  now: Date;
  onCreated?: (task: TaskRowDto) => void;
  /** Open the dialog on these dates (a click on an empty calendar day, M6 G2). */
  prefill?: { start: string; end: string } | null;
  /** The prefilled dialog closed. */
  onPrefillDone?: () => void;
  /** Render the dialog only, for a host that opens it with `prefill`. */
  hideTrigger?: boolean;
  /** Each increase opens the dialog (the "New task › Task" menu item of the host). */
  openRequest?: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (prefill) setOpen(true);
  }, [prefill]);
  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);
  const [client, setClient] = useState(defaultClient ?? '');
  const activities = useActivities('non-statutory');
  const defaults = useTaskDefaults(client, open);
  const create = useCreateTask();

  const options = useMemo<TaskActivityOption[]>(() => {
    const byId = new Map((defaults.data?.activities ?? []).map((a) => [a.id, a]));
    return (activities.data ?? [])
      .filter((a) => a.group === 'non-statutory')
      .map((a) => {
        const d = byId.get(a.id);
        return {
          id: a.id,
          name: a.name,
          kind: a.kind,
          repeats: d?.repeats ?? REPEAT_OF[a.frequency] ?? 'one-time',
          notifyDays: d?.notifyDays ?? a.notifyDays,
          visibility: d?.visibility ?? a.visibility,
        };
      });
  }, [activities.data, defaults.data?.activities]);

  const clients = useMemo<ClientOption[]>(
    () =>
      engagements.map((e) => ({
        id: e.id,
        name: e.companyName,
        ownerId: e.id === client ? (defaults.data?.owner?.id ?? null) : null,
        reviewerId: e.id === client ? (defaults.data?.reviewer?.id ?? null) : null,
      })),
    [engagements, client, defaults.data?.owner?.id, defaults.data?.reviewer?.id],
  );

  const onCreate = async (p: NewTaskPayload): Promise<boolean> => {
    try {
      const task = await create.mutateAsync({
        engagementId: p.engagementId,
        activityId: p.activityId,
        name: p.name || undefined,
        startDate: p.startDate,
        dueDate: p.endDate,
        urgency: p.urgency,
        visibility: p.visibility,
        ownerId: p.ownerId,
        reviewerId: p.reviewerId,
        repeats: p.repeats,
        remindBefore: p.notifyDays,
      });
      toastSaved('Task created', { kind: 'saved', sub: `${task.title} · ${task.companyName}` });
      onCreated?.(task);
      return true;
    } catch (e) {
      toastError(errorMessage(e, 'Could not create the task'));
      return false;
    }
  };

  return (
    <>
      {hideTrigger ? null : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus aria-hidden />
          New task
        </Button>
      )}
      <NewTaskDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) onPrefillDone?.();
        }}
        prefill={prefill}
        now={now}
        activities={options}
        clients={clients}
        owners={defaults.data?.owners ?? []}
        reviewers={defaults.data?.reviewers ?? []}
        defaultClient={defaultClient}
        saving={create.isPending}
        onClientChange={setClient}
        onCreate={onCreate}
      />
    </>
  );
}
