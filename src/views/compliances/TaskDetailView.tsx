'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { Lock, Pencil, Trash2, Upload } from 'lucide-react';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import { EditTaskDialog } from '@/views/compliances/tasks/edit-task';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FileBadge, fileType } from '@/components/ui/file-badge';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/native-select';
import { Tag } from '@/components/ui/spectrum-chip';
import { toastSaved } from '@/components/ui/toast-saved';
import { UrgencyPill, VisibilityTag } from '@/components/compliances/TaskMarks';
import { useApp } from '@/context/AppContext';
import { isAdminOrManager } from '@/lib/auth';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import {
  ActivityCard,
  DetailCols,
  DetailHeader,
  PersonDot,
  ProgressCard,
  RemindersCard,
} from '@/views/compliances/detail/detail-parts';
import { activityEntries, blockedLine, reminderViews } from '@/views/compliances/detail/detail-model';
import { plainDate } from '@/lib/compliance/spectrum-status';
import {
  ApiError,
  openTaskAttachment,
  useSetReminderDays,
  useTask,
  useTaskActions,
  type ReminderKey,
  type TaskDetailDto,
} from '@/views/compliances/tasks/api';
import { STAGE_LABEL, dueText, type WorkflowStage } from '@/views/compliances/tasks/task-model';

/** Focus the reason field when the send-back form opens. */
const focusOnMount = (el: HTMLInputElement | null) => el?.focus();

/**
 * NON-STATUTORY TASK — the staff detail page (prototype TaskDetail, COMPLIANCE-MODEL.md 4.3).
 *
 * The head shows Start, End, Urgency and Visibility. The left column holds the Checklist,
 * Attachments, Comments, Reminders and Activity; the right column the progress steps, the
 * stage, the owner and the reviewer. Every value and every right (`task.can`) comes from
 * `GET /api/compliances/tasks/:id`, scoped in its repository; writes go to the task routes.
 */

/** Stages a lead may set by hand; closing and "not applicable" are for admin and manager. */
const LEAD_STAGES: WorkflowStage[] = ['not-started', 'ready', 'in-progress', 'waiting'];
const MANAGER_STAGES: WorkflowStage[] = [...LEAD_STAGES, 'completed', 'not-applicable'];

export function TaskDetailView({ basePath, taskId }: { basePath: string; taskId: string }) {
  const q = useTask(taskId);
  const now = useMemo(() => new Date(), []);
  if (q.isPending) {
    return (
      <div className="surface p-4" aria-busy="true" aria-label="Loading task">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <EmptyState
        title={missing ? 'This task is not in your clients' : 'Could not load the task'}
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link href={`${basePath}/obligations?cat=ns`}>Open obligations</Link>
          </Button>
        }
      />
    );
  }
  return <TaskDetailBody basePath={basePath} task={q.data} now={now} />;
}

function TaskDetailBody({ basePath, task, now }: { basePath: string; task: TaskDetailDto; now: Date }) {
  const { user } = useApp();
  const role = user?.role;
  const isManager = isAdminOrManager(role);
  const acts = useTaskActions(task.id);
  const setDays = useSetReminderDays();
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [removing, setRemoving] = useState<{ kind: 'item' | 'file'; id: string; label: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const done = task.stage === 'completed';
  const inReview = task.stage === 'review';
  const run = async <T,>(p: Promise<T>, ok: string, sub?: string) => {
    try {
      await p;
      toastSaved(ok, { kind: 'saved', sub });
      return true;
    } catch (e) {
      toastError(errorMessage(e, 'Could not save the change'));
      return false;
    }
  };

  // D-1 for a task: the lead submits; a manager or admin approves (from review) or closes it.
  const action = isManager ? (
    <Button
      disabled={done || acts.review.isPending || acts.stage.isPending}
      onClick={() =>
        void (inReview
          ? run(acts.review.mutateAsync({ decision: 'approve' }), 'Approved', `${task.title} is closed.`)
          : run(acts.stage.mutateAsync('completed'), 'Approved', `${task.title} is closed.`))
      }
    >
      {done ? 'Approved' : 'Approve'}
    </Button>
  ) : task.can.submit || inReview ? (
    <Button
      disabled={done || inReview || !task.can.submit || acts.stage.isPending}
      onClick={() => void run(acts.stage.mutateAsync('review'), 'Submitted for review', task.reviewer ? `${task.reviewer.name} reviews it next.` : undefined)}
    >
      {inReview ? 'Submitted' : 'Submit for review'}
    </Button>
  ) : null;
  const sendBack = (
    <>
      {inReview && task.can.review ? (
        <Button size="sm" variant="secondary" onClick={() => setSendingBack(true)}>
          Send back
        </Button>
      ) : null}
      {task.can.edit ? (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil aria-hidden />
          Edit
        </Button>
      ) : null}
    </>
  );

  const stageOptions = (isManager ? MANAGER_STAGES : LEAD_STAGES).includes(task.stage)
    ? (isManager ? MANAGER_STAGES : LEAD_STAGES)
    : [task.stage, ...(isManager ? MANAGER_STAGES : LEAD_STAGES)];

  const upload = async (file: File | undefined) => {
    if (!file) return;
    await run(acts.upload.mutateAsync({ file }), '1 file uploaded', file.name);
    if (fileRef.current) fileRef.current.value = '';
  };

  const checklistDone = task.checklistItems.filter((c) => c.done).length;

  return (
    <PageTransition>
      <SEO title={`${task.title} — VCFO Suite`} description={`${task.title} for ${task.companyName}.`} path={`${basePath}/obligations/tasks/${task.id}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <DetailHeader
          dateIso={task.dueDate}
          done={done}
          now={now}
          title={task.title}
          clientId={task.engagementId}
          clientName={task.companyName}
          marks={
            <>
              <UrgencyPill urgency={task.urgency} />
              <VisibilityTag visibility={task.visibility} />
              <Tag>Non-statutory</Tag>
            </>
          }
          word={task.word}
          due={
            <>
              Start {plainDate(task.startDate, now)} · End {plainDate(task.dueDate, now)}
              {done ? '' : ` · ${dueText(task.dueDate, now, false)}`}
            </>
          }
          aside={sendBack}
          action={action}
        />
        {sendingBack ? (
          <form
            className="surface flex flex-wrap items-center gap-2 px-4 py-3 md:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              const note = reason.trim();
              if (!note) return;
              void run(acts.review.mutateAsync({ decision: 'send-back', note }), 'Sent back', `${task.owner?.name ?? 'The owner'} reworks it.`).then((ok) => {
                if (ok) {
                  setSendingBack(false);
                  setReason('');
                }
              });
            }}
          >
            <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should change?" className="min-w-[200px] flex-1" ref={focusOnMount} />
            <Button size="sm" type="submit" disabled={!reason.trim() || acts.review.isPending}>
              Send back
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setSendingBack(false)}>
              Cancel
            </Button>
          </form>
        ) : null}
        <DetailCols
          left={
            <>
              <DashSection title="Checklist" meta={`${checklistDone} of ${task.checklistItems.length}`} flush>
                {task.checklistItems.length === 0 ? <p className="px-4 py-3 text-[13px] text-ink-faint md:px-5">None</p> : null}
                <ul>
                  {task.checklistItems.map((c) => (
                    <li key={c.id} className="border-t border-line-soft first:border-t-0">
                      <div className="flex items-center gap-1 pr-2 md:pr-3">
                      <label className={cn('flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 md:px-5', task.can.tick && 'cursor-pointer')}>
                        <Checkbox
                          checked={c.done}
                          disabled={!task.can.tick || acts.tick.isPending}
                          aria-label={c.label}
                          onCheckedChange={(on) => void run(acts.tick.mutateAsync({ itemId: c.id, done: on === true }), on === true ? 'Ticked' : 'Unticked', c.label)}
                        />
                        <span className={cn('min-w-0 flex-1 text-[14px]', c.done ? 'text-ink-muted' : 'text-ink')}>{c.label}</span>
                        {c.done ? (
                          <span className="flex-none text-[12.5px] text-ink-muted">
                            {[c.doneBy?.name, c.doneAt ? plainDate(c.doneAt.slice(0, 10), now) : null].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                      </label>
                      {task.can.edit ? (
                        <Button size="iconSm" variant="ghost" aria-label={`Delete ${c.label}`} title="Delete" onClick={() => setRemoving({ kind: 'item', id: c.id, label: c.label })}>
                          <Trash2 aria-hidden />
                        </Button>
                      ) : null}
                      </div>
                      {removing?.kind === 'item' && removing.id === c.id ? (
                        <InlineConfirm
                          question={`Delete "${c.label}"?`}
                          confirm="Delete"
                          busy={acts.removeItem.isPending}
                          onCancel={() => setRemoving(null)}
                          onConfirm={() => void run(acts.removeItem.mutateAsync(c.id), 'Item deleted', c.label).then(() => setRemoving(null))}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {task.can.tick ? (
                  <form
                    className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3 md:px-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const label = newItem.trim();
                      if (!label) return;
                      void run(acts.addItem.mutateAsync(label), 'Item added', label).then((ok) => ok && setNewItem(''));
                    }}
                  >
                    <Input aria-label="New item" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item" className="min-w-[200px] flex-1" />
                    <Button size="sm" variant="secondary" type="submit" disabled={!newItem.trim() || acts.addItem.isPending}>
                      Add
                    </Button>
                  </form>
                ) : null}
              </DashSection>

              <DashSection
                title="Attachments"
                meta={task.attachments.length ? `${task.attachments.length}` : undefined}
                flush
                right={
                  task.can.upload ? (
                    <>
                      <input ref={fileRef} type="file" className="sr-only" aria-label="Choose a file" onChange={(e) => void upload(e.target.files?.[0])} />
                      <Button size="sm" variant="secondary" disabled={acts.upload.isPending} onClick={() => fileRef.current?.click()}>
                        <Upload aria-hidden />
                        Upload
                      </Button>
                    </>
                  ) : undefined
                }
              >
                {task.attachments.length === 0 ? (
                  <p className="px-4 py-3 text-[13px] text-ink-faint md:px-5">None</p>
                ) : (
                  <ul>
                    {task.attachments.map((f) => (
                      <li key={f.id} className="border-t border-line-soft first:border-t-0">
                        <div className="flex items-center gap-1 pr-2 md:pr-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-sunken/60 md:px-5"
                          onClick={() => void openTaskAttachment(task.id, f.id).catch((e) => toastError(errorMessage(e, 'Could not open the file')))}
                        >
                          <FileBadge type={fileType(f.fileName)} />
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[14px] font-medium text-ink">{f.fileName}</b>
                            <span className="block truncate text-[12.5px] text-ink-muted">
                              {[f.uploadedBy?.name, plainDate(f.uploadedAt.slice(0, 10), now), f.byClient ? 'From the client' : null].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {f.deliverable ? <Tag tone="ok">Deliverable</Tag> : null}
                        </button>
                        {/* The route lets admin, super admin, manager and the uploader delete a file. */}
                        {task.can.edit || (user?.id && f.uploadedBy?.id === user.id) ? (
                          <Button size="iconSm" variant="ghost" aria-label={`Delete ${f.fileName}`} title="Delete" onClick={() => setRemoving({ kind: 'file', id: f.id, label: f.fileName })}>
                            <Trash2 aria-hidden />
                          </Button>
                        ) : null}
                        </div>
                        {removing?.kind === 'file' && removing.id === f.id ? (
                          <InlineConfirm
                            question={`Delete ${f.fileName}?`}
                            confirm="Delete"
                            busy={acts.removeFile.isPending}
                            onCancel={() => setRemoving(null)}
                            onConfirm={() => void run(acts.removeFile.mutateAsync(f.id), 'File deleted', f.fileName).then(() => setRemoving(null))}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </DashSection>

              <DashSection title="Comments" meta={task.comments.length ? `${task.comments.length}` : undefined} flush>
                {task.comments.length > 0 ? (
                  <ul>
                    {task.comments.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 border-b border-line-soft px-4 py-3 md:px-5">
                        <PersonDot name={c.author?.name ?? 'VCFO'} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 text-[13px]">
                            <b className="font-medium text-ink">{c.author?.name ?? 'VCFO'}</b>
                            <span className="text-ink-muted">{plainDate(c.at.slice(0, 10), now)}</span>
                            {c.internal ? (
                              <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
                                <Lock size={12} strokeWidth={1.6} aria-hidden />
                                Internal
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block whitespace-pre-line text-[14px] text-ink-2">{c.body}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {task.can.comment ? (
                  <form
                    className="flex flex-wrap items-center gap-2 px-4 py-3 md:px-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const body = draft.trim();
                      if (!body) return;
                      void run(
                        acts.comment.mutateAsync({ body, internal }),
                        'Comment added',
                        internal ? 'Only the firm sees it.' : task.visibility === 'firm' ? undefined : 'The client sees it.',
                      ).then((ok) => ok && setDraft(''));
                    }}
                  >
                    <Input aria-label="Comment" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment" className="min-w-[200px] flex-1" />
                    <span className="inline-flex items-center gap-2 text-[13px] text-ink-2">
                      <Checkbox id={`internal-${task.id}`} checked={internal} onCheckedChange={(v) => setInternal(v === true)} />
                      <label htmlFor={`internal-${task.id}`} className="cursor-pointer">
                        Internal
                      </label>
                    </span>
                    <Button size="sm" type="submit" disabled={!draft.trim() || acts.comment.isPending}>
                      Comment
                    </Button>
                  </form>
                ) : null}
              </DashSection>

              <RemindersCard
                rows={reminderViews(task.reminders)}
                days={task.remindBefore}
                canEdit={task.can.edit}
                saving={setDays.isPending}
                blocked={blockedLine(task.remindersBlockedBy ?? [])}
                now={now}
                onDays={(n) =>
                  void run(setDays.mutateAsync({ kind: 'task', id: task.id, notifyDays: n }), 'Reminder days changed', `First reminder ${n} day${n === 1 ? '' : 's'} before the end date.`)
                }
                onRow={(key, patch) => void run(setDays.mutateAsync({ kind: 'task', id: task.id, rows: [{ key: key as ReminderKey, ...patch }] }), 'Reminder changed')}
                onReset={() => void run(setDays.mutateAsync({ kind: 'task', id: task.id, reset: true }), 'Reminders reset', 'Back to the default schedule.')}
              />

              <ActivityCard rows={activityEntries(task.history)} now={now} />
            </>
          }
          right={
            <ProgressCard
              steps={task.steps}
              stage={task.stageLabel}
              owner={task.owner?.name}
              reviewer={task.reviewer?.name}
              note={task.stage === 'rework' || inReview ? task.reviewNote : null}
              now={now}
            >
              {task.can.changeStage && !done ? (
                <div className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="text-[13px] text-ink-muted">Change stage</span>
                  <FilterSelect
                    aria-label="Change stage"
                    value={task.stage}
                    disabled={acts.stage.isPending}
                    options={stageOptions.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
                    onChange={(e) => {
                      const s = e.target.value as WorkflowStage;
                      if (s !== task.stage) void run(acts.stage.mutateAsync(s), 'Stage changed', STAGE_LABEL[s]);
                    }}
                  />
                </div>
              ) : null}
            </ProgressCard>
          }
        />
      </div>
      {task.can.edit ? (
        <EditTaskDialog
          open={editing}
          onOpenChange={setEditing}
          task={task}
          now={now}
          saving={acts.edit.isPending}
          onSave={(body) => run(acts.edit.mutateAsync(body), 'Task saved', task.title)}
        />
      ) : null}
    </PageTransition>
  );
}
