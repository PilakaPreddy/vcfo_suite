'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, MapPin, Video } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { Tag } from '@/components/ui/spectrum-chip';
import { MODE_LABEL } from '@/lib/board-meetings/model';
import { noticeTime, shortDate } from '@/lib/board-meetings/dates';
import { MeetingApiError, useMeeting, type MeetingDto } from '@/hooks/use-board-meetings';
import { MomTab, ResolutionsTab } from './DocumentsTabs';
import { NoticeTab } from './NoticeTab';
import { RepliesTab } from './RepliesTab';
import { Card, MeetingStatusChip, StepStrip } from './parts';
import { meetingSteps, stamp } from './view-model';

type TabKey = 'notice' | 'replies' | 'mom' | 'resolutions';
const TABS: TabKey[] = ['notice', 'replies', 'mom', 'resolutions'];

/** The tab a meeting opens on when the URL names none: where the next piece of work is. */
function defaultTab(m: MeetingDto): TabKey {
  if (m.status === 'held') return 'mom';
  if (m.status === 'sent' || m.status === 'approved') return 'replies';
  return 'notice';
}

/**
 * BOARD MEETING — one page per meeting under Compliances › Obligations (no new sidebar item).
 * Tabs: Notice (draft, approve), Replies (attendance, quorum, reschedule, cancel), MoM (upload
 * and signing loop) and Resolutions (added after the meeting). `?tab=` keeps the tab on refresh.
 */
export function MeetingPage({ basePath, meetingId }: { basePath: string; meetingId: string }) {
  const q = useMeeting(meetingId);
  if (q.isLoading) {
    return (
      <div className="surface p-4" aria-busy="true" aria-label="Loading meeting">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (q.isError || !q.data) {
    const missing = q.error instanceof MeetingApiError && (q.error.status === 404 || q.error.status === 403);
    return (
      <EmptyState
        title={missing ? 'This meeting is not in your clients' : 'Could not load the meeting'}
        action={
          <Button size="sm" variant="secondary" asChild>
            <Link href={`${basePath}/obligations?cat=ns&type=meeting`}>Open obligations</Link>
          </Button>
        }
      />
    );
  }
  return <MeetingBody basePath={basePath} meeting={q.data} />;
}

function MeetingBody({ basePath, meeting: m }: { basePath: string; meeting: MeetingDto }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get('tab') as TabKey | null;
  const tab: TabKey = asked && TABS.includes(asked) ? asked : defaultTab(m);
  const setTab = (k: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', k);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const replied = m.replies.filter((r) => r.reply !== null).length;
  const resolutions = m.documents.filter((d) => d.kind === 'resolution').length;
  const mom = m.documents.find((d) => d.kind === 'mom');

  return (
    <PageTransition>
      <SEO title={`${m.meetingNo} — VCFO Suite`} description={`${m.kindLabel} of ${m.company.name}.`} path={`${basePath}/obligations/meetings/${m.id}`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <Link href={`${basePath}/obligations?cat=ns&type=meeting`} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Obligations
        </Link>
        <section aria-label="Header" className="surface flex flex-col gap-4 px-4 py-4 md:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="m-0 text-[24px] font-medium leading-8 tracking-[-0.01em] text-ink">
                {m.kind === 'board' ? m.typeLabel : m.kindLabel}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[14px]">
                <span className="font-medium">{m.company.name}</span>
                <span className="font-mono text-[13px] text-ink-muted">{m.meetingNo}</span>
                <MeetingStatusChip meeting={m} />
                {m.postInc ? <Tag>Post-incorporation</Tag> : <Tag>Non-statutory</Tag>}
                {m.shortNotice ? <Tag tone="warn">Short notice</Tag> : null}
                {m.version > 1 ? <Tag>v{m.version}</Tag> : null}
              </div>
            </div>
            <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px] text-ink-2">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden />
                <dt className="sr-only">Date</dt>
                <dd className="m-0">{shortDate(m.meetingDate)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-ink-muted" aria-hidden />
                <dt className="sr-only">Time</dt>
                <dd className="m-0">{noticeTime(m.meetingTime)} IST</dd>
              </div>
              <div className="flex items-center gap-1.5">
                {m.mode === 'in_person' ? <MapPin className="h-4 w-4 text-ink-muted" aria-hidden /> : <Video className="h-4 w-4 text-ink-muted" aria-hidden />}
                <dt className="sr-only">Mode</dt>
                <dd className="m-0">{MODE_LABEL[m.mode]}</dd>
              </div>
            </dl>
          </div>
          <StepStrip steps={meetingSteps(m)} />
        </section>

        <SpectrumTabs
          variant="underline"
          size="md"
          label="Meeting"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'notice', label: 'Notice' },
            { key: 'replies', label: 'Replies', count: m.replies.length ? `${replied}/${m.replies.length}` : undefined },
            { key: 'mom', label: 'MoM', count: mom?.status === 'locked' ? 'Signed' : undefined },
            { key: 'resolutions', label: 'Resolutions', count: resolutions || undefined },
          ]}
        />

        {tab === 'notice' ? <NoticeTab meeting={m} /> : tab === 'replies' ? <RepliesTab meeting={m} /> : tab === 'mom' ? <MomTab meeting={m} /> : <ResolutionsTab meeting={m} />}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Key dates">
            <dl className="m-0 grid grid-cols-[170px_minmax(0,1fr)] gap-y-2 px-5 py-4 text-[14px]">
              <dt className="text-ink-muted">Prepare the notice</dt>
              <dd className="m-0">{shortDate(m.dates.prepare)}</dd>
              <dt className="text-ink-muted">Send the notice by</dt>
              <dd className="m-0">{shortDate(m.dates.noticeSend)}</dd>
              <dt className="text-ink-muted">Signed MoM by</dt>
              <dd className="m-0">{shortDate(m.dates.momDue)}</dd>
              {m.dates.lastMeetingDate ? (
                <>
                  <dt className="text-ink-muted">Last meeting</dt>
                  <dd className="m-0">
                    {shortDate(m.dates.lastMeetingDate)} <span className="font-mono text-[12.5px] text-ink-muted">{m.dates.lastMeetingNo}</span>
                  </dd>
                </>
              ) : null}
              {m.dates.gapLimit ? (
                <>
                  <dt className="text-ink-muted">120-day limit</dt>
                  <dd className={m.dates.breaksGap ? 'm-0 font-medium text-danger' : 'm-0'}>
                    {shortDate(m.dates.gapLimit)}
                    {m.dates.breaksGap ? ' · this date is past it' : ''}
                  </dd>
                </>
              ) : null}
              <dt className="text-ink-muted">Lead</dt>
              <dd className="m-0">{m.lead?.name ?? '—'}</dd>
              <dt className="text-ink-muted">Approves</dt>
              <dd className="m-0">{m.manager?.name ?? '—'}</dd>
            </dl>
          </Card>
          <Card title="Activity">
            {m.events.length === 0 ? (
              <p className="m-0 px-5 py-4 text-[14px] text-ink-muted">Nothing yet.</p>
            ) : (
              <ol className="m-0 flex max-h-[320px] list-none flex-col overflow-y-auto p-0">
                {m.events.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-wrap justify-between gap-2 border-t border-line-soft px-5 py-2.5 text-[13.5px] first:border-t-0">
                    <span>
                      {e.label}
                      {e.who ? <span className="text-ink-muted"> · {e.who}</span> : null}
                    </span>
                    <span className="text-[12.5px] text-ink-muted">{stamp(e.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
