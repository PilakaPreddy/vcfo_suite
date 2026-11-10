'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, ClipboardCheck, Inbox } from 'lucide-react';
import { DashHero } from '@/components/dash/DashHero';
import { DashSection } from '@/components/dash/DashSection';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FilterSelect } from '@/components/ui/native-select';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { useApp } from '@/context/AppContext';
import {
  fetchEventReview,
  useComplianceEvents,
  useConfirmEvent,
  useSetEventStatus,
  type ComplianceEvent,
  type EventReview,
  type RecordEventInput,
} from '@/hooks/use-compliance-events';
import type { ComplianceEventKind } from '@/data/event-triggers';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { daysUntil } from '@/lib/compliance-events/plan';
import { cn } from '@/lib/utils';

type Tab = 'proposed' | 'tracked' | 'closed';

const SOURCE_LABEL: Record<ComplianceEvent['source'], string> = {
  manual: 'Recorded by hand',
  ask: 'From Ask VCFO',
  record_change: 'From a record change',
  board_meeting: 'From a board meeting',
};

const DETAIL_LABEL: Record<string, string> = {
  person: 'Name',
  din: 'DIN',
  address: 'New address',
  withinCity: 'Within the same city (yes or no)',
  firm: 'Firm',
  shares: 'Shares allotted',
  amount: 'Amount',
  resolution: 'Resolution',
  privatePlacement: 'Private placement (yes or no)',
};

const today = () => new Date().toISOString().slice(0, 10);

function dueLabel(dueOn: string): { text: string; tone: ChipTone } {
  const d = daysUntil(today(), dueOn);
  if (d < 0) return { text: `${-d} day${d === -1 ? '' : 's'} overdue`, tone: 'bad' };
  if (d === 0) return { text: 'Due today', tone: 'bad' };
  if (d <= 7) return { text: `${d} day${d === 1 ? '' : 's'} left`, tone: 'warn' };
  return { text: `${d} days left`, tone: 'ok' };
}

function detailLine(e: ComplianceEvent): string {
  const d = e.details;
  return [d.summary, !d.summary && d.person ? d.person : null, !d.summary && d.address ? d.address : null, d.din ? `DIN ${d.din}` : null].filter(Boolean).join(' · ');
}

function inputOf(e: ComplianceEvent): RecordEventInput {
  const { summary: _s, ...details } = e.details;
  return { engagementId: e.engagementId, kind: e.kind, occurredOn: e.occurredOn, details, eventId: e.id, source: e.source, value: e.details.summary ?? e.label };
}

/** The review card: what the action will create, its checks, and the approval click. */
function ReviewPanel({ review, busy, onApprove, onCancel }: { review: EventReview; busy: boolean; onApprove: () => void; onCancel: () => void }) {
  const notes = review.checks.filter((c) => c.message);
  return (
    <div className="mt-2 rounded-md border border-line bg-surface-sunken p-3 text-[13.5px]">
      <p className="font-medium text-ink">{review.title}</p>
      <pre className="mt-1.5 whitespace-pre-wrap font-sans text-ink">{review.summary}</pre>
      {notes.length ? (
        <ul className="mt-2 space-y-1">
          {notes.map((c) => (
            <li key={c.rule} className={cn('text-[12.5px]', c.ok ? 'text-warning' : 'text-danger')}>
              {c.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={onApprove} disabled={busy || Boolean(review.heldReason)}>
          Approve and create
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * COMPANY EVENTS — the MCA filings a company event starts (IDEAS-PLAN wave 2, section D). One page
 * for every staff role; `GET /api/compliance-events` is scoped by `AuthContext`. Proposed events come
 * from record changes after incorporation (and later board meetings); "Review" shows the
 * `filing.recordEvent` card, and approving it creates the task with the legal due date and a draft
 * client request. A staff member can also record an event by hand, through the same card.
 */
export function EventsPage({ basePath }: { basePath: string }) {
  const { engagements, user } = useApp();
  const q = useComplianceEvents();
  const confirm = useConfirmEvent();
  const setStatus = useSetEventStatus();
  const [tab, setTab] = useState<Tab>('proposed');
  const [open, setOpen] = useState<{ key: string; input: RecordEventInput; review: EventReview } | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [form, setForm] = useState<{ engagementId: string; kind: ComplianceEventKind | ''; occurredOn: string; details: Record<string, string> }>({
    engagementId: '',
    kind: '',
    occurredOn: today(),
    details: {},
  });
  const [recording, setRecording] = useState(false);

  const events = useMemo(() => q.data?.events ?? [], [q.data]);
  const rules = q.data?.rules ?? [];
  const rule = rules.find((r) => r.kind === form.kind);
  const clients = useMemo(
    () => (engagements ?? []).filter((e) => isIncorporated(e)).map((e) => ({ value: e.id, label: e.companyName })).sort((a, b) => a.label.localeCompare(b.label)),
    [engagements],
  );
  const proposed = events.filter((e) => e.status === 'proposed');
  const tracked = events.filter((e) => e.status === 'tracked').sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const closed = events.filter((e) => e.status === 'done' || e.status === 'dismissed');
  const shown = tab === 'proposed' ? proposed : tab === 'tracked' ? tracked : closed;
  const overdue = tracked.filter((e) => daysUntil(today(), e.dueOn) < 0).length;
  const dueSoon = tracked.filter((e) => {
    const d = daysUntil(today(), e.dueOn);
    return d >= 0 && d <= 7;
  }).length;
  const portalTasks = user?.role !== 'super_admin';

  const review = async (key: string, input: RecordEventInput) => {
    setMessage(null);
    try {
      setOpen({ key, input, review: await fetchEventReview(input) });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'The review did not load.', error: true });
    }
  };
  const approve = async () => {
    if (!open) return;
    try {
      const result = await confirm.mutateAsync(open.input);
      setMessage({ text: `${result.summary}.`, error: false });
      setOpen(null);
      setRecording(false);
      setTab('tracked');
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'The event was not recorded.', error: true });
    }
  };
  const move = async (id: string, status: 'done' | 'dismissed' | 'proposed') => {
    setMessage(null);
    try {
      await setStatus.mutateAsync({ id, status });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'The event was not saved.', error: true });
    }
  };
  const manualInput = (): RecordEventInput | null => {
    if (!form.engagementId || !form.kind || !form.occurredOn) return null;
    const details = Object.fromEntries(Object.entries(form.details).filter(([k, v]) => v.trim() && rule?.detailKeys.includes(k)));
    return { engagementId: form.engagementId, kind: form.kind, occurredOn: form.occurredOn, details, source: 'manual' };
  };

  return (
    <PageTransition>
      <SEO title="Company events — VCFO Suite" description="Company events that start an MCA filing, with their due dates." path={`${basePath}/compliances/events`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <DashHero
          title="Company events"
          subtitle="Director, office, auditor and capital changes that start an MCA filing"
          stats={[
            { label: 'To confirm', icon: Inbox, value: proposed.length, hot: proposed.length > 0, onClick: () => setTab('proposed') },
            { label: 'Overdue', icon: AlertTriangle, value: overdue, hot: overdue > 0, onClick: () => setTab('tracked') },
            { label: 'Due within 7 days', icon: CalendarClock, value: dueSoon, onClick: () => setTab('tracked') },
            { label: 'Tracked', icon: ClipboardCheck, value: tracked.length, onClick: () => setTab('tracked') },
          ]}
        />

        {message ? (
          <p role={message.error ? 'alert' : 'status'} className={cn('text-[13.5px]', message.error ? 'text-danger' : 'text-positive')}>
            {message.text}
          </p>
        ) : null}

        <DashSection
          title="Record an event"
          right={
            recording ? null : (
              <Button size="sm" variant="outline" onClick={() => setRecording(true)}>
                Record an event
              </Button>
            )
          }
        >
          {recording ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <FilterSelect
                aria-label="Client"
                options={[{ value: '', label: 'Choose a client' }, ...clients]}
                value={form.engagementId}
                onChange={(e) => setForm({ ...form, engagementId: e.target.value })}
              />
              <FilterSelect
                aria-label="Event"
                options={[{ value: '', label: 'What happened' }, ...rules.map((r) => ({ value: r.kind, label: `${r.label} (${r.form}, ${r.days} days)` }))]}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as ComplianceEventKind | '' })}
              />
              <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                On
                <input
                  type="date"
                  value={form.occurredOn}
                  max={today()}
                  onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
                  className="h-control-sm rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px] text-ink"
                />
              </label>
              {(rule?.detailKeys ?? []).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-[12.5px] text-ink-muted">
                  {DETAIL_LABEL[k] ?? k}
                  <input
                    value={form.details[k] ?? ''}
                    onChange={(e) => setForm({ ...form, details: { ...form.details, [k]: e.target.value } })}
                    className="h-control-sm rounded-md border-1.5 border-line-strong bg-surface-raised px-2 text-[13px] text-ink"
                  />
                </label>
              ))}
              <div className="flex flex-wrap items-end gap-2 sm:col-span-3">
                <Button
                  size="sm"
                  disabled={!manualInput()}
                  onClick={() => {
                    const input = manualInput();
                    if (input) void review('manual', input);
                  }}
                >
                  Review
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRecording(false)}>
                  Cancel
                </Button>
              </div>
              {open?.key === 'manual' ? (
                <div className="sm:col-span-3">
                  <ReviewPanel review={open.review} busy={confirm.isPending} onApprove={() => void approve()} onCancel={() => setOpen(null)} />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-muted">Record a change the client told you about. The review shows the form, the due date and the task and client request it will create.</p>
          )}
        </DashSection>

        <DashSection
          title="Events"
          meta={q.isLoading ? undefined : `${shown.length} of ${events.length}`}
          right={
            <SpectrumTabs
              label="Status"
              items={[
                { key: 'proposed', label: 'To confirm', count: proposed.length },
                { key: 'tracked', label: 'Tracked', count: tracked.length },
                { key: 'closed', label: 'Closed', count: closed.length },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
            />
          }
        >
          {q.isLoading ? (
            <SkeletonRows rows={4} />
          ) : q.isError ? (
            <EmptyState title="The events did not load." action={<Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>} />
          ) : shown.length === 0 ? (
            <EmptyState
              title={
                tab === 'proposed'
                  ? 'Nothing to confirm. A changed director, registered office or auditor on an incorporated company appears here.'
                  : tab === 'tracked'
                    ? 'No filing is being tracked.'
                    : 'No closed events yet.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((e) => {
                const due = dueLabel(e.dueOn);
                return (
                  <li key={e.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <b className="block font-medium text-ink">
                          {e.label} · <span className="font-mono text-[13px]">{e.form}</span>
                        </b>
                        <span className="block text-[12.5px] text-ink-muted">
                          {[e.companyName, detailLine(e), `on ${e.occurredOn}`, SOURCE_LABEL[e.source]].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] text-ink">Due {e.dueOn}</span>
                        {e.status === 'tracked' || e.status === 'proposed' ? (
                          <Chip tone={due.tone} raw>
                            {due.text}
                          </Chip>
                        ) : (
                          <Chip tone={e.status === 'done' ? 'ok' : 'idle'} raw>
                            {e.status === 'done' ? 'Filed' : 'Dismissed'}
                          </Chip>
                        )}
                        {e.status === 'proposed' ? (
                          <>
                            <Button size="sm" onClick={() => void review(e.id, inputOf(e))}>
                              Review
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void move(e.id, 'dismissed')} disabled={setStatus.isPending}>
                              Dismiss
                            </Button>
                          </>
                        ) : e.status === 'tracked' ? (
                          <>
                            {e.taskId && e.taskKind === 'compliance' && portalTasks ? (
                              <Link className="text-[13px] text-brand-text underline-offset-2 hover:underline" href={`${basePath}/compliances/obligations/tasks/${e.taskId}`}>
                                Task
                              </Link>
                            ) : null}
                            {e.requestListId ? (
                              <Link className="text-[13px] text-brand-text underline-offset-2 hover:underline" href={`${basePath}/requests?list=${e.requestListId}`}>
                                Client request
                              </Link>
                            ) : null}
                            <Button size="sm" variant="outline" onClick={() => void move(e.id, 'done')} disabled={setStatus.isPending}>
                              Mark filed
                            </Button>
                          </>
                        ) : e.status === 'dismissed' && !e.taskId ? (
                          <Button size="sm" variant="ghost" onClick={() => void move(e.id, 'proposed')} disabled={setStatus.isPending}>
                            Bring back
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open?.key === e.id ? <ReviewPanel review={open.review} busy={confirm.isPending} onApprove={() => void approve()} onCancel={() => setOpen(null)} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DashSection>
      </div>
    </PageTransition>
  );
}
