'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { AreaPill, Tag } from '@/components/ui/spectrum-chip';
import { toastSaved } from '@/components/ui/toast-saved';
import { AssistCard } from '@/components/compliances/AssistParts';
import { useApp } from '@/context/AppContext';
import { obligationChecklist } from '@/data/before-filing';
import { isFirmWideAdmin } from '@/lib/auth';
import { areaOf, portalFor } from '@/lib/client-portal/compliances';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import {
  ActivityCard,
  DetailCols,
  DetailHeader,
  KV,
  ProgressCard,
  RemindersCard,
} from '@/views/compliances/detail/detail-parts';
import { activityEntries, blockedLine, reminderViews } from '@/views/compliances/detail/detail-model';
import { FilingProofCell, FilingWindowCell } from '@/views/compliances/filing-actions';
import { StaffFromClientCard, StaffSbcFieldsCard } from '@/views/compliances/input-cards';
import { BeforeFilingCard, FilingThreadCard } from '@/views/compliances/record-cards';
import { areaLabel, plainDate } from '@/lib/compliance/spectrum-status';
import {
  ApiError,
  useSetReminderDays,
  useStatutory,
  useStatutoryAction,
  useTaskDefaults,
  type ReminderKey,
  type StatutoryDetailDto,
} from '@/views/compliances/tasks/api';
import { STAGE_LABEL, dueText, type WorkflowStage } from '@/views/compliances/tasks/task-model';
import { FilterSelect } from '@/components/ui/native-select';
import { isAdminOrManager } from '@/lib/auth';
import { useMayWriteFilings, useRegister } from '@/views/compliances/use-register';


/** Focus the reason field when the send-back form opens. */
const focusOnMount = (el: HTMLInputElement | null) => el?.focus();
/**
 * STATUTORY DETAIL — one client's period of one obligation, on the staff portals (prototype
 * StatDetail, COMPLIANCE-MODEL.md 4.2, D-1 to D-3).
 *
 * The header carries the date tile, the title, the client, the area pill, the "Statutory" tag,
 * the status chip, days to due and the role's one action (lead "Submit for review", manager
 * and admin "Approve"). The left column keeps the existing record parts (From the client,
 * Filled by SBC, the filing thread, Before filing, VCFO Assist, the window and the proof)
 * around the new Reminders, Rule and Activity cards; the right column holds Progress and the
 * previous periods. Data: `GET /api/compliances/statutory/:instanceId`, scoped in its
 * repository; the window and proof cells read the same register row Filings uses.
 */
export function StatDetailView({ basePath, obligationId, instanceId }: { basePath: string; obligationId: string; instanceId: string }) {
  const q = useStatutory(instanceId);
  const now = useMemo(() => new Date(), []);
  if (q.isPending) {
    return (
      <div className="surface p-4" aria-busy="true" aria-label="Loading filing">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <EmptyState
        title={missing ? 'This filing is not in your clients' : 'Could not load the filing'}
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link href={`${basePath}/obligations/${encodeURIComponent(obligationId)}`}>Open the obligation</Link>
          </Button>
        }
      />
    );
  }
  return <StatDetailBody basePath={basePath} d={q.data} now={now} />;
}

function StatDetailBody({ basePath, d, now }: { basePath: string; d: StatutoryDetailDto; now: Date }) {
  const { user } = useApp();
  const act = useStatutoryAction(d.id);
  const setDays = useSetReminderDays();
  const mayWrite = useMayWriteFilings();
  const register = useRegister(now);
  const row = register.rows.find((r) => r.id === d.id);
  const facts = register.details.get(d.id);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');

  const filed = Boolean(d.filedOn) || d.stage === 'completed';
  const inReview = d.stage === 'review';
  const run = async (p: Promise<unknown>, ok: string, sub?: string) => {
    try {
      await p;
      toastSaved(ok, { kind: 'saved', sub });
      return true;
    } catch (e) {
      toastError(errorMessage(e, 'Could not save the change'));
      return false;
    }
  };

  // D-1: the role's main action as the route names it.
  const action =
    d.primaryAction === 'submit' ? (
      <Button
        disabled={!d.can.submit || inReview || filed || act.isPending}
        onClick={() => void run(act.mutateAsync({ action: 'submit' }), 'Submitted for review', d.reviewer ? `${d.reviewer.name} reviews ${d.name} next.` : undefined)}
      >
        {inReview ? 'Submitted' : 'Submit for review'}
      </Button>
    ) : d.primaryAction === 'approve' ? (
      <Button
        disabled={!d.can.approve || !inReview || filed || act.isPending}
        onClick={() => void run(act.mutateAsync({ action: 'approve' }), 'Approved', d.owner ? `${d.owner.name} files ${d.name} next.` : undefined)}
      >
        {d.filledBySbc.approvedOn && !inReview ? 'Approved' : 'Approve'}
      </Button>
    ) : null;
  const aside = (
    <>
      {inReview && d.can.sendBack ? (
        <Button size="sm" variant="secondary" onClick={() => setSendingBack(true)}>
          Send back
        </Button>
      ) : null}
      <Button size="sm" variant="secondary" asChild>
        <Link href={`${basePath}/obligations/${encodeURIComponent(d.obligationId)}`}>
          <Users aria-hidden />
          All clients
        </Link>
      </Button>
    </>
  );

  // The first reminder sits notifyDays before the due date.
  const initial = d.reminders.find((r) => r.key === 'initial');
  const days = initial ? Math.abs(initial.offsetDays) : (d.activity?.notifyDays ?? 5);
  const sbc = d.filledBySbc;
  const isAdmin = isFirmWideAdmin(user?.role);

  return (
    <PageTransition>
      <SEO title={`${d.title} — VCFO Suite`} description={`${d.title} for ${d.companyName}.`} path={`${basePath}/obligations/${d.obligationId}/${d.id}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <DetailHeader
          dateIso={d.dueDate}
          done={filed}
          now={now}
          title={d.title}
          clientId={d.engagementId}
          clientName={d.companyName}
          marks={
            <>
              <AreaPill area={areaLabel(d.area)} />
              <Tag>Statutory</Tag>
            </>
          }
          word={d.word}
          due={dueText(d.dueDate, now, filed, d.filedOn ? `Filed ${plainDate(d.filedOn, now)}` : 'Filed')}
          aside={aside}
          action={action}
        />
        {sendingBack ? (
          <form
            className="surface flex flex-wrap items-center gap-2 px-4 py-3 md:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              const note = reason.trim();
              if (!note) return;
              void run(act.mutateAsync({ action: 'send-back', note }), 'Sent back', `${d.owner?.name ?? 'The owner'} reworks it.`).then((ok) => {
                if (ok) {
                  setSendingBack(false);
                  setReason('');
                }
              });
            }}
          >
            <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What should change?" className="min-w-[200px] flex-1" ref={focusOnMount} />
            <Button size="sm" type="submit" disabled={!reason.trim() || act.isPending}>
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
              {/* D-2.1 and D-2.2: the existing record parts (migration 0029). */}
              <StaffFromClientCard engagementId={d.engagementId} kind="obligation" subjectKey={d.id} clientName={d.companyName} />
              <StaffSbcFieldsCard
                engagementId={d.engagementId}
                kind="obligation"
                subjectKey={d.id}
                locked={sbc.locked}
                facts={[
                  { key: 'period', label: 'Period', value: d.periodLabel ?? d.fyLabel },
                  { key: 'filed', label: 'Filed on', value: d.filedOn ? plainDate(d.filedOn, now) : null, sub: sbc.filedBy },
                  { key: 'ack', label: 'Acknowledgement no.', value: sbc.acknowledgementNo },
                  { key: 'paid', label: 'Amount paid', value: sbc.amountPaid },
                ]}
              />
              {row ? (
                <DashSection title="Window and proof" flush>
                  <KV k="Working window">
                    <FilingWindowCell row={row} mayWrite={mayWrite} />
                  </KV>
                  <KV k="Proof">
                    <FilingProofCell row={row} detail={facts} mayWrite={mayWrite} now={now} />
                  </KV>
                </DashSection>
              ) : null}
              <RemindersCard
                rows={reminderViews(d.reminders)}
                days={days}
                canEdit={d.can.editReminders}
                saving={setDays.isPending}
                blocked={blockedLine(d.remindersBlockedBy)}
                now={now}
                onDays={(n) =>
                  void run(setDays.mutateAsync({ kind: 'statutory', id: d.id, notifyDays: n }), 'Reminder days changed', `First reminder ${n} day${n === 1 ? '' : 's'} before the due date.`)
                }
                onRow={(key, patch) => void run(setDays.mutateAsync({ kind: 'statutory', id: d.id, rows: [{ key: key as ReminderKey, ...patch }] }), 'Reminder changed')}
                onReset={() => void run(setDays.mutateAsync({ kind: 'statutory', id: d.id, reset: true }), 'Reminders reset', 'Back to the default schedule.')}
              />
              <DashSection title="Rule" flush>
                <KV k="Due rule">{d.rule.dueRule || '—'}</KV>
                {d.rule.applies ? <KV k="Applies to">{d.rule.applies}</KV> : null}
                <KV k="Penalty">{d.rule.penalty || '—'}</KV>
                <KV k="Frequency">
                  <span className="capitalize">{d.frequency}</span>
                </KV>
                {d.rule.note ? <KV k="Note">{d.rule.note}</KV> : null}
                {/* D-2.4: the open point the owner must confirm shows to admin and super admin only. */}
                {isAdmin && d.rule.confirm ? (
                  <p className="m-4 mt-1 rounded-md border-1.5 border-caution-line bg-caution-soft px-3 py-2.5 text-[13px] leading-relaxed text-caution md:mx-5">
                    <b className="font-medium">To confirm: </b>
                    {d.rule.confirm}
                  </p>
                ) : null}
              </DashSection>
              <ActivityCard rows={activityEntries(d.history)} now={now} />
              <FilingThreadCard instanceIds={[d.id]} />
              {!filed ? (
                <AssistCard
                  engagementId={d.engagementId}
                  kind="filing"
                  subjectKey={d.id}
                  portal={portalFor({ area: areaOf(d.authority, d.area), name: d.name })[0]}
                  form={d.name}
                  mayStart={!filed}
                />
              ) : null}
            </>
          }
          right={
            <>
              <ProgressCard
                steps={d.steps}
                stage={d.stageLabel}
                owner={d.owner?.name}
                reviewer={d.reviewer?.name}
                note={inReview || d.stage === 'rework' ? d.reviewNote : null}
                now={now}
              >
                {d.can.assign ? (
                  <AssignPeople
                    d={d}
                    busy={act.isPending}
                    onSave={(ownerId, reviewerId) => run(act.mutateAsync({ action: 'assign', ownerId, reviewerId }), 'Owner and reviewer saved', d.title)}
                  />
                ) : null}
                {/* Staff move the working stage by hand; filing itself stays on the filings route. */}
                {!filed ? (
                  <div className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="text-[13px] text-ink-muted">Change stage</span>
                    <FilterSelect
                      aria-label="Change stage"
                      value={d.stage}
                      disabled={act.isPending}
                      options={stageChoices(d.stage, isAdminOrManager(user?.role)).map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
                      onChange={(e) => {
                        const s = e.target.value as WorkflowStage;
                        if (s !== d.stage) void run(act.mutateAsync({ action: 'stage', stage: s }), 'Stage changed', STAGE_LABEL[s]);
                      }}
                    />
                  </div>
                ) : null}
              </ProgressCard>
              <PreviousPeriods basePath={basePath} d={d} now={now} />
              <BeforeFilingCard engagementId={d.engagementId} kind="obligation" subjectKey={d.id} lines={obligationChecklist(d.obligationId, d.area)} />
            </>
          }
        />
      </div>
    </PageTransition>
  );
}

/**
 * Assign the owner and the reviewer of one period (admin, super admin, manager). The people come
 * from the task defaults read of the same client: leads, managers and admins who may own it.
 */
function AssignPeople({
  d,
  busy,
  onSave,
}: {
  d: StatutoryDetailDto;
  busy: boolean;
  onSave: (ownerId: string | null, reviewerId: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(d.owner?.id ?? '');
  const [reviewer, setReviewer] = useState(d.reviewer?.id ?? '');
  const people = useTaskDefaults(d.engagementId, open);
  const withCurrent = (list: Array<{ id: string; name: string }>, cur: { id: string; name: string } | null) =>
    cur && !list.some((p) => p.id === cur.id) ? [cur, ...list] : list;
  if (!open)
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOwner(d.owner?.id ?? '');
            setReviewer(d.reviewer?.id ?? '');
            setOpen(true);
          }}
        >
          Assign
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-2 rounded-md bg-surface-sunken p-3"
      aria-label="Assign"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(owner || null, reviewer || null).then((ok) => ok && setOpen(false));
      }}
    >
      <FilterSelect
        aria-label="Owner"
        className="w-full [&>select]:w-full"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        options={[{ value: '', label: 'No owner' }, ...withCurrent(people.data?.owners ?? [], d.owner).map((p) => ({ value: p.id, label: p.name }))]}
      />
      <FilterSelect
        aria-label="Reviewer"
        className="w-full [&>select]:w-full"
        value={reviewer}
        onChange={(e) => setReviewer(e.target.value)}
        options={[{ value: '', label: 'No reviewer' }, ...withCurrent(people.data?.reviewers ?? [], d.reviewer).map((p) => ({ value: p.id, label: p.name }))]}
      />
      <span className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={busy}>
          Save
        </Button>
      </span>
    </form>
  );
}

/** Stages staff may set on a statutory item: never Completed (filing marks it), Not applicable for admin and manager only. */
function stageChoices(current: WorkflowStage, manager: boolean): WorkflowStage[] {
  const base: WorkflowStage[] = ['not-started', 'ready', 'in-progress', 'waiting', ...(manager ? (['not-applicable'] as WorkflowStage[]) : [])];
  return base.includes(current) ? base : [current, ...base];
}

/** D-3: the last six periods of the same obligation, filed on time or late. */
function PreviousPeriods({ basePath, d, now }: { basePath: string; d: StatutoryDetailDto; now: Date }) {
  return (
    <DashSection title="Previous periods" meta={d.previous.length ? `${d.previous.length}` : undefined} flush>
      {d.previous.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-ink-faint md:px-5">None</p>
      ) : (
        <ul>
          {d.previous.map((p) => (
            <li key={p.id} className="border-t border-line-soft first:border-t-0">
              <Link
                href={`${basePath}/obligations/${encodeURIComponent(d.obligationId)}/${encodeURIComponent(p.id)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken/60 md:px-5"
              >
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{p.periodLabel ?? plainDate(p.dueDate, now)}</span>
                <span className="flex-none text-right leading-tight">
                  <span className="block text-[13px] text-ink-2">{p.filedOn ? plainDate(p.filedOn, now) : 'Not filed'}</span>
                  <span
                    className={cn(
                      'block text-[12px]',
                      p.late === true ? 'font-medium text-danger' : p.late === false ? 'text-ink-muted' : 'text-ink-faint',
                    )}
                  >
                    {p.late === true ? 'Late' : p.late === false ? 'On time' : `Due ${plainDate(p.dueDate, now)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashSection>
  );
}
