'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListTodo, X } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { InternWorkCtaButton } from '@/components/intern/InternWorkCtaButton';
import { ClientDot, CompanyTile } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { dayMonth, dueClass, todayStatusTone, type TodayStatus } from '@/components/staff/today/today-rows';
import {
  internActionQueueByCompany,
  internQueueCompanyHref,
  INTERN_TASKS_PATH,
  type InternWorkItem,
} from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';
import { internKindOwner } from '@/components/intern/intern-tones';

/* The heatmap columns of the prototype (HEAT_COLS): the label on the column and the status it counts. */
const COLS: { label: string; status: TodayStatus; cell: string }[] = [
  { label: 'Overdue', status: 'Overdue', cell: 'bg-danger-soft text-danger' },
  { label: 'Due today', status: 'Due soon', cell: 'bg-warning-soft text-warning' },
  { label: 'My step', status: 'In progress', cell: 'bg-brand-soft text-brand-text' },
  { label: 'Waiting', status: 'Waiting', cell: 'bg-surface-sunken text-ink-muted' },
  { label: 'Upcoming', status: 'Not started', cell: 'bg-surface-sunken text-ink-faint' },
];

const PAGE = 8;
const HEAD = 'h-9 whitespace-nowrap border-b-1.5 border-line text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted';

/** A stuck client for the head chip: it opens the client. */
export interface StuckClient {
  engagementId: string;
  companyName: string;
  href: string;
}

/**
 * Action queue (prototype ActionQueue): a clients by status heatmap, eight companies a page, or
 * the plain list. Clicking a count opens the list of those tasks under the grid. A red chip in
 * the head names the stuck clients.
 */
export function LeadActionQueue({
  items,
  now,
  statusOf,
  stuck = [],
  loading,
  workHref = INTERN_TASKS_PATH,
  companyHref,
}: {
  /** The Work page the head link opens (the manager's Work on their Today). */
  workHref?: string;
  /** Where a company name goes (staff project pages for the manager). */
  companyHref?: (engagementId: string) => string;
  userId?: string;
  items: InternWorkItem[];
  now: Date;
  /** The status word of an item (overdue, due soon, in progress, waiting, not started). */
  statusOf: (item: InternWorkItem) => TodayStatus;
  stuck?: StuckClient[];
  loading?: boolean;
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const groups = internActionQueueByCompany(items, now, { includeWaiting: true });
  const openItems = groups.flatMap((g) => g.items);
  const [view, setView] = useState('map');
  const [pick, setPick] = useState<{ engagementId: string; status: TodayStatus } | null>(null);

  const pickedGroup = pick ? groups.find((g) => g.engagementId === pick.engagementId) : undefined;
  const picked = pick && pickedGroup ? pickedGroup.items.filter((i) => statusOf(i) === pick.status) : [];
  const pickedCol = pick ? COLS.find((c) => c.status === pick.status) : undefined;

  const listColumns: EFilingColumn<InternWorkItem>[] = [
    {
      key: 'client',
      header: 'Client',
      width: '170px',
      render: (i) => (
        <span className="flex min-w-0 items-center gap-2">
          <ClientDot name={i.companyName} />
          <span className="truncate">{shortCompany(i.companyName)}</span>
        </span>
      ),
    },
    {
      key: 'task',
      header: 'Task',
      render: (i) => (
        <span className="font-medium text-ink" title={i.title}>
          {i.title}
        </span>
      ),
    },
    {
      key: 'step',
      header: 'Step',
      width: '90px',
      render: (i) => i.catalogLabel ?? (i.source === 'filing' ? 'Filing' : i.source === 'task' ? 'Task' : 'Request'),
    },
    {
      key: 'owner',
      header: 'Owner',
      width: '120px',
      render: (i) => {
        const o = internKindOwner(i.kind);
        return o === 'client' ? 'Client' : o === 'manager' ? 'Manager' : 'You';
      },
    },
    {
      key: 'due',
      header: 'Due',
      width: '80px',
      render: (i) => <span className={cn('tabular-nums', dueClass(statusOf(i)))}>{dayMonth(i.dueAt) || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '130px',
      render: (i) => {
        const s = statusOf(i);
        return (
          <Chip tone={todayStatusTone(s)} fixed title={i.why}>
            {s}
          </Chip>
        );
      },
    },
  ];

  return (
    <DashSection
      icon={ListTodo}
      title="Action queue"
      // Every open item, yours and those waiting on others; the hero's "Needs action" counts only yours.
      meta={`${openItems.length} open in all`}
      right={
        <span className="flex flex-wrap items-center gap-3">
          {stuck.length > 0 ? (
            <Link
              href={stuck[0]!.href}
              className="hidden items-center gap-1.5 rounded-sm bg-danger-soft px-2 py-0.5 text-[12px] font-medium text-danger hover:underline md:inline-flex"
            >
              <i className="h-[7px] w-[7px] rounded-[2px] bg-danger-mid" aria-hidden />
              {stuck.length} stuck · {shortCompany(stuck[0]!.companyName)}
            </Link>
          ) : null}
          <SpectrumTabs
            label="Action queue view"
            items={[
              { key: 'map', label: 'By client' },
              { key: 'list', label: 'List' },
            ]}
            value={view}
            onChange={setView}
          />
        </span>
      }
      href={workHref}
      hrefLabel="Work"
      className="h-fit"
      flush
      loading={loading}
    >
      {groups.length === 0 ? (
        <EmptyState title="Nothing needs you right now" className="m-4" />
      ) : view === 'list' ? (
        <EFilingGrid
          caption="Action queue"
          columns={listColumns}
          rows={openItems}
          rowKey={(i) => i.id}
          onRowClick={(i) => router.push(i.href)}
          pageSize={8}
          minWidth={760}
        />
      ) : (
        <>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-[14px]" style={{ minWidth: 720 }}>
              <caption className="sr-only">Action queue by client</caption>
              <colgroup>
                <col />
                {COLS.map((c) => (
                  <col key={c.label} style={{ width: 88 }} />
                ))}
                <col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={cn(HEAD, 'pl-4 pr-2.5 text-left md:pl-5')}>
                    Client
                  </th>
                  {COLS.map((c) => (
                    <th key={c.label} scope="col" className={cn(HEAD, 'px-1 text-center')}>
                      {c.label}
                    </th>
                  ))}
                  <th scope="col" className={cn(HEAD, 'pl-2.5 pr-4 text-center md:pr-5')}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.slice(page * PAGE, page * PAGE + PAGE).map((group) => {
                  const href = companyHref ? companyHref(group.engagementId) : internQueueCompanyHref(group.engagementId, group.items);
                  const name = shortCompany(group.companyName);
                  return (
                    <tr key={group.engagementId} className="hover:bg-hover">
                      <td className="h-11 border-b border-line-soft pl-4 pr-2.5 align-middle md:pl-5">
                        <Link href={href} className="flex min-w-0 items-center gap-2.5 hover:underline">
                          <CompanyTile name={group.companyName} />
                          <b className="min-w-0 truncate font-medium text-ink">{name}</b>
                        </Link>
                      </td>
                      {COLS.map((c) => {
                        const list = group.items.filter((i) => statusOf(i) === c.status);
                        const on = pick?.engagementId === group.engagementId && pick.status === c.status;
                        return (
                          <td key={c.label} className="border-b border-line-soft px-1 text-center align-middle">
                            {list.length === 0 ? (
                              <span className="mx-auto block w-14 text-center text-ink-faint" aria-hidden>
                                –
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPick(on ? null : { engagementId: group.engagementId, status: c.status })}
                                aria-pressed={on}
                                aria-label={`${name} · ${c.label} · ${list.length}`}
                                title={list.map((i) => i.title).join('\n')}
                                className={cn(
                                  'mx-auto grid h-7 w-14 place-items-center rounded-sm text-[13px] font-medium tabular-nums',
                                  c.cell,
                                  on && 'ring-2 ring-brand ring-offset-1 ring-offset-surface-raised',
                                )}
                              >
                                {list.length}
                              </button>
                            )}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap border-b border-line-soft pl-2.5 pr-4 text-center align-middle text-[12px] text-ink-muted md:pr-5">
                        <b className="text-[13.5px] font-medium text-ink">{group.items.length}</b> {group.items.length === 1 ? 'task' : 'tasks'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {groups.length > PAGE ? (
            <div className="flex items-center gap-2 px-4 py-2 text-[13px] text-ink-muted tabular-nums md:px-5">
              <span className="flex-1">
                {page * PAGE + 1}–{Math.min(groups.length, page * PAGE + PAGE)} of {groups.length}
              </span>
              {Array.from({ length: Math.ceil(groups.length / PAGE) }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  aria-current={n === page ? 'page' : undefined}
                  className={cn('grid h-7 min-w-7 place-items-center rounded-md px-1.5 hover:bg-hover', n === page && 'bg-brand-soft font-medium text-brand-text')}
                >
                  {n + 1}
                </button>
              ))}
            </div>
          ) : null}
          {pick && pickedCol && pickedGroup ? (
            <div className="border-t border-line">
              <div className="flex items-center gap-2 px-4 py-2.5 md:px-5">
                <b className="text-[13.5px] font-medium">
                  {pickedCol.label} · {shortCompany(pickedGroup.companyName)}
                </b>
                <Chip tone="idle" dot={false}>
                  {picked.length}
                </Chip>
                <Button variant="ghost" size="iconSm" className="ml-auto" aria-label="Close the task list" onClick={() => setPick(null)}>
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </Button>
              </div>
              {picked.map((i) => (
                <div key={i.id} className="flex min-w-0 flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5 md:flex-nowrap md:px-5">
                  <span className={cn('w-16 flex-none text-[12px] text-ink-muted', i.catalogLabel && 'font-mono')}>{i.catalogLabel ?? 'To-do'}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={i.href} className="block truncate font-medium text-ink hover:underline" title={i.title}>
                      {i.title}
                    </Link>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {shortCompany(i.companyName)}
                      {i.dueAt ? ` · due ${dayMonth(i.dueAt)}` : ''}
                    </span>
                  </span>
                  <Chip tone={todayStatusTone(statusOf(i))} fixed>
                    {statusOf(i)}
                  </Chip>
                  <InternWorkCtaButton item={i} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </DashSection>
  );
}
