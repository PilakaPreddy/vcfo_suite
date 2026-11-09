'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { DashDataTable, type DashColumn } from '@/components/dash/DashDataTable';
import { STATE_WORD_CLASS, TONE_TEXT } from '@/components/common/IconChip';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FilterSelect } from '@/components/ui/native-select';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Switch } from '@/components/ui/switch';
import { PlainPageHead } from '@/views/admin/PlainPageHead';
import { useApp } from '@/context/AppContext';
import { isFirmWideAdmin } from '@/lib/auth';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { useActivities, useUpdateActivity, type ActivityDto } from '@/views/compliances/tasks/api';
import type { TaskVisibility } from '@/views/compliances/tasks/task-model';
import {
  activityErrors,
  activityPatchBody,
  fromActivity,
  openPointState,
  VISIBILITY_LABEL,
  type ActivityForm,
} from '@/views/compliances/activity-master/form';

/**
 * X-23: the activity master edit screen (DR-01, DR-19, DR-21). Admin and super admin read the
 * 43 activities and change one row's reminder lead time, owner and reviewer roles, the
 * visibility of a non-statutory row, and confirm an open point. It calls only
 * `GET /api/compliances/activities` and `PATCH /api/compliances/activities/:id`; the
 * repository checks the role and writes an audit row for each change.
 */

type Group = 'statutory' | 'non-statutory';

const VIS_OPTIONS = (Object.keys(VISIBILITY_LABEL) as TaskVisibility[]).map((value) => ({ value, label: VISIBILITY_LABEL[value] }));

function OpenPoint({ row }: { row: ActivityDto }) {
  const state = openPointState(row);
  if (state === 'none') return <span className="text-ink-faint">None</span>;
  return (
    <span className={cn(STATE_WORD_CLASS, state === 'open' ? TONE_TEXT.warning : TONE_TEXT.success)}>
      {state === 'open' ? 'To confirm' : 'Confirmed'}
    </span>
  );
}

export function ActivityMasterView({ basePath }: { basePath: string }) {
  const { user } = useApp();
  const canEdit = isFirmWideAdmin(user?.role);
  const [group, setGroup] = useState<Group>('statutory');
  const [editing, setEditing] = useState<ActivityDto | null>(null);
  const query = useActivities();
  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = useMemo(() => all.filter((a) => a.group === group), [all, group]);
  const count = (g: Group) => all.filter((a) => a.group === g).length;
  const open = rows.filter((a) => openPointState(a) === 'open').length;

  const columns: DashColumn<ActivityDto>[] = [
    { key: 'id', header: 'ID', width: '120px', mono: true, render: (a) => a.id },
    {
      key: 'name',
      header: 'Activity',
      width: 'minmax(0,2fr)',
      render: (a) => (
        <div className="min-w-0">
          <div className="truncate text-ink">{a.name}</div>
          <div className="truncate text-[12.5px] text-ink-muted">{a.module}</div>
        </div>
      ),
    },
    { key: 'frequency', header: 'Repeats', width: 'minmax(0,0.8fr)', render: (a) => a.frequency },
    { key: 'owner', header: 'Owner', width: 'minmax(0,1fr)', render: (a) => <span className="block truncate" title={a.ownerRole || undefined}>{a.ownerRole || '—'}</span> },
    { key: 'reviewer', header: 'Reviewer', width: 'minmax(0,1fr)', render: (a) => <span className="block truncate" title={a.reviewerRole || undefined}>{a.reviewerRole || '—'}</span> },
    { key: 'notify', header: 'Notify', width: '72px', align: 'right', mono: true, render: (a) => `${a.notifyDays}d` },
    { key: 'vis', header: 'Visible to', width: '104px', render: (a) => VISIBILITY_LABEL[a.visibility] },
    { key: 'point', header: 'Open point', width: '104px', render: (a) => <OpenPoint row={a} /> },
    {
      key: 'edit',
      header: '',
      width: '72px',
      align: 'right',
      render: (a) =>
        canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <PageTransition>
      <SEO title="Activity master — VCFO Suite" description="The compliance activity master." path={`${basePath}/activities`} />
      <PlainPageHead title="Activity master" meta={query.data ? `${all.length} activities` : undefined} back />
      <DashSection
        title={group === 'statutory' ? 'Statutory activities' : 'Non-statutory activities'}
        meta={open ? `${open} to confirm` : undefined}
        right={
          <SpectrumTabs
            label="Category"
            items={[
              { key: 'statutory', label: 'Statutory', count: count('statutory') },
              { key: 'non-statutory', label: 'Non-statutory', count: count('non-statutory') },
            ]}
            value={group}
            onChange={(k) => setGroup(k as Group)}
          />
        }
        flush
        loading={query.isPending}
      >
        {query.isError ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">Could not load the activities.</p>
        ) : (
          <DashDataTable
            bare
            columns={columns}
            rows={rows}
            rowKey={(a) => a.id}
            empty="No activities."
            mobile={(a) => (
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] text-ink">{a.name}</div>
                  <div className="truncate font-mono text-[12px] text-ink-muted">
                    {a.id} · {a.frequency} · {a.notifyDays}d
                  </div>
                  <OpenPoint row={a} />
                </div>
                {canEdit ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                ) : null}
              </div>
            )}
          />
        )}
      </DashSection>
      {editing ? <EditActivityDialog activity={editing} onClose={() => setEditing(null)} /> : null}
    </PageTransition>
  );
}

function EditActivityDialog({ activity, onClose }: { activity: ActivityDto; onClose: () => void }) {
  const update = useUpdateActivity();
  const [f, setF] = useState<ActivityForm>(() => fromActivity(activity));
  const [tried, setTried] = useState(false);
  useEffect(() => {
    setF(fromActivity(activity));
    setTried(false);
  }, [activity]);
  const set = (p: Partial<ActivityForm>) => setF((x) => ({ ...x, ...p }));
  const err = activityErrors(f);
  const e = (k: keyof typeof err) => (tried ? err[k] : undefined);
  const wide = 'w-full [&>select]:w-full';
  const statutory = activity.group === 'statutory';

  const save = async () => {
    setTried(true);
    if (Object.values(err).some(Boolean) || update.isPending) return;
    const body = activityPatchBody(activity, f);
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    try {
      await update.mutateAsync({ id: activity.id, body });
      toastSuccess('Activity saved', activity.name);
      onClose();
    } catch (err) {
      toastError('Could not save the activity', errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onOpenChange={(v) => (v ? null : onClose())}
      title="Edit activity"
      eyebrow={activity.id}
      sub={activity.name}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-activity" disabled={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="edit-activity"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          void save();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Owner role" error={e('ownerRole')}>
          <Input aria-label="Owner role" value={f.ownerRole} aria-invalid={e('ownerRole') ? true : undefined} onChange={(ev) => set({ ownerRole: ev.target.value })} />
        </Field>
        <Field label="Reviewer role" error={e('reviewerRole')}>
          <Input
            aria-label="Reviewer role"
            value={f.reviewerRole}
            aria-invalid={e('reviewerRole') ? true : undefined}
            onChange={(ev) => set({ reviewerRole: ev.target.value })}
          />
        </Field>
        <Field label="Notify before (days)" error={e('notifyDays')}>
          <Input
            aria-label="Notify before (days)"
            type="number"
            min={0}
            max={120}
            inputMode="numeric"
            aria-invalid={e('notifyDays') ? true : undefined}
            value={f.notifyDays}
            onChange={(ev) => set({ notifyDays: ev.target.value })}
          />
        </Field>
        <Field label="Visible to">
          <FilterSelect
            aria-label="Visible to"
            size="md"
            className={wide}
            value={f.visibility}
            disabled={statutory}
            onChange={(ev) => set({ visibility: ev.target.value as TaskVisibility })}
            options={VIS_OPTIONS}
          />
        </Field>
        {activity.confirm ? (
          <div className="grid gap-2 sm:col-span-2">
            <span className="text-[13px] font-medium text-ink-2">Open point</span>
            <p className="text-[13px] text-ink-2">{activity.confirm}</p>
            <div className="flex items-center gap-2">
              <Switch id="activity-confirmed" checked={f.confirmed} onCheckedChange={(v) => set({ confirmed: v })} />
              <label htmlFor="activity-confirmed" className="text-[13px] text-ink">
                Confirmed
              </label>
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
