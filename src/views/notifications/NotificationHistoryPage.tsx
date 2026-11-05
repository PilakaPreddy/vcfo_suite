'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, ChevronRight } from 'lucide-react';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Chip, Tag } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DashSection } from '@/components/dash/DashSection';
import { NotificationKindTile } from '@/components/notifications/notification-kind';
import { NOTIFICATION_KIND_LOOK } from '@/components/notifications/notification-kind-look';
import { useApp } from '@/context/AppContext';
import { useNotificationHistory } from '@/hooks/use-notification-history';
import {
  formatNotificationTimestampIst,
  formatNotificationWhen,
  groupNotificationsForHistory,
  notificationHrefIsNavigable,
  type NotificationHistoryGroup,
} from '@/lib/notifications/notification-dismiss';
import { NOTIFICATION_KIND_LABEL } from '@/lib/notifications/notification-popup';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_GROUPS,
  chipWordOf,
  groupOf,
  isCreatedThisIstMonth,
  matchesTab,
  notificationSettingsHref,
  tabCounts,
  type NotificationGroup,
  type NotificationTab,
} from './notification-view';

/* VCFO Spectrum notifications (prototype src/screens/shared/NotificationsScreen.tsx, row C-0110).
   One card headed by the tabs (All, Unread and one per type, with counts), rows grouped by day
   with a type tile, the title link, the second line, a status chip, the client and time, an
   unread dot that marks the row read, and an open button for the side panel. The "This month"
   card counts the month by type and opens a drill dialog. Data and read marks are the real
   history query's. */

const GROUP_LABEL: Record<NotificationHistoryGroup, string> = {
  today: 'Today',
  week: 'Earlier this week',
  earlier: 'Earlier',
};

/* Status colours only (R-25), one per type group. */
const BAR_TONE: Record<NotificationGroup, string> = {
  Documents: 'bg-warning-mid',
  Steps: 'bg-brand',
  Deadlines: 'bg-danger-mid',
  Messages: 'bg-waiting-mid',
};

const TAB_LABEL: Record<NotificationTab, string> = {
  all: 'All',
  unread: 'Unread',
  Documents: 'Documents',
  Steps: 'Steps',
  Deadlines: 'Deadlines',
  Messages: 'Messages',
};

const TABS: NotificationTab[] = ['all', 'unread', ...NOTIFICATION_GROUPS];

function NotificationRow({
  item,
  unread,
  onRead,
  onOpen,
}: {
  item: AppNotification;
  unread: boolean;
  onRead: () => void;
  onOpen: () => void;
}) {
  const look = NOTIFICATION_KIND_LOOK[item.kind];
  const canOpen = notificationHrefIsNavigable(item.href);
  const when = formatNotificationWhen(item.createdAt);
  const who = [item.companyName || null, when].filter(Boolean).join(' · ');
  const dismissed = Boolean(item.dismissedAt);
  const titleClass = cn('min-w-0 truncate hover:underline', unread ? 'font-medium text-ink' : 'text-ink-2');

  return (
    <li className="border-t border-line-soft first:border-t-0">
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface-sunken md:px-5">
        <span className="flex-none self-start sm:self-center" title={NOTIFICATION_KIND_LABEL[item.kind]}>
          <NotificationKindTile kind={item.kind} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            {canOpen ? (
              <Link href={item.href} onClick={onRead} className={titleClass}>
                {item.title}
              </Link>
            ) : (
              <button type="button" onClick={onOpen} className={cn(titleClass, 'text-left')}>
                {item.title}
              </button>
            )}
            {dismissed ? <Tag className="h-5 flex-none px-1.5 text-[11px]">Cleared</Tag> : null}
          </span>
          {item.body ? <span className="mt-0.5 block text-[12.5px] text-ink-2">{item.body}</span> : null}
          <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted sm:hidden">{who}</span>
        </span>
        <span className="hidden w-[104px] flex-none sm:block">
          <Chip fixed raw tone={look?.tone}>
            {chipWordOf(item)}
          </Chip>
        </span>
        <span className="hidden w-[150px] flex-none truncate text-right text-[12.5px] text-ink-muted sm:block" title={who}>
          {who}
        </span>
        <span className="flex flex-none items-center gap-1.5">
          {unread ? (
            <button
              type="button"
              onClick={onRead}
              className="grid h-5 w-5 place-items-center rounded-sm hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25"
              aria-label="Unread · mark as read"
              title="Mark as read"
            >
              <span className="h-2 w-2 rounded-[2px] bg-brand" />
            </button>
          ) : (
            <span className="w-5" />
          )}
          <button
            type="button"
            onClick={onOpen}
            className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'h-[30px] w-[30px] min-w-0 text-ink-2')}
            aria-label={`Open ${item.title}`}
            title="Open"
          >
            <ArrowRight aria-hidden />
          </button>
        </span>
      </div>
    </li>
  );
}

/** The detail side panel (prototype SidePanel): eyebrow, chip, From / When / Area, the text, and the link. */
function NotificationPanel({ item, onClose }: { item: AppNotification | null; onClose: () => void }) {
  const look = item ? NOTIFICATION_KIND_LOOK[item.kind] : null;
  const canOpen = item ? notificationHrefIsNavigable(item.href) : false;
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
        {item ? (
          <>
            <div className="border-b border-line-soft px-5 pb-4 pt-5 pr-12">
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-muted">
                <Bell className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
                {NOTIFICATION_KIND_LABEL[item.kind]}
              </p>
              <SheetTitle className="mt-1 text-[18px] font-medium leading-snug">{item.title}</SheetTitle>
              <div className="mt-2">
                <Tag tone={look?.tone}>{chipWordOf(item)}</Tag>
              </div>
            </div>
            <div className="grid gap-3 px-5 py-4">
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13.5px]">
                <dt className="text-ink-muted">From</dt>
                <dd className="min-w-0 text-ink">{item.companyName || 'VCFO'}</dd>
                <dt className="text-ink-muted">When</dt>
                <dd className="tabular-nums text-ink">{formatNotificationTimestampIst(item.createdAt)} IST</dd>
                <dt className="text-ink-muted">Area</dt>
                <dd className="text-ink">{groupOf(item)}</dd>
              </dl>
              {item.body ? (
                <p className="whitespace-pre-wrap break-words text-[13.5px] text-ink-2">{item.body}</p>
              ) : null}
            </div>
            {canOpen ? (
              <div className="mt-auto flex justify-end border-t border-line-soft px-5 py-3">
                <Link href={item.href} className={buttonVariants({ size: 'sm' })} onClick={onClose}>
                  Open
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** "This month" drill (prototype Modal): group tabs, rows, and a footer that shows the group in the list. */
function MonthDrill({
  open,
  tab,
  items,
  onTab,
  onClose,
  onPick,
  onShowInList,
}: {
  open: boolean;
  tab: 'all' | NotificationGroup;
  items: AppNotification[];
  onTab: (t: 'all' | NotificationGroup) => void;
  onClose: () => void;
  onPick: (n: AppNotification) => void;
  onShowInList: () => void;
}) {
  const rows = tab === 'all' ? items : items.filter((n) => groupOf(n) === tab);
  const count = (g: NotificationGroup) => items.filter((n) => groupOf(n) === g).length;
  const tabs = [
    { key: 'all', label: 'All', count: items.length },
    ...NOTIFICATION_GROUPS.map((g) => ({ key: g, label: g, count: count(g) })),
  ];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-[720px] flex-col gap-0 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4 pr-12">
          <div className="min-w-0">
            <DialogTitle className="text-[16px] font-medium">This month</DialogTitle>
            <DialogDescription className="text-[12.5px]">{rows.length} notifications</DialogDescription>
          </div>
          <SpectrumTabs
            label="Type"
            items={tabs}
            value={tab}
            onChange={(k) => onTab(k as 'all' | NotificationGroup)}
            className="max-w-full overflow-x-auto md:ml-auto"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="p-4">
              <EmptyState title="Nothing this month" />
            </li>
          ) : (
            rows.map((n) => (
              <li key={n.id} className="border-t border-line-soft first:border-t-0">
                <button
                  type="button"
                  onClick={() => onPick(n)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-5 py-2 text-left text-[14px] hover:bg-surface-sunken"
                >
                  <NotificationKindTile kind={n.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{n.title}</span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {[n.companyName || null, formatNotificationWhen(n.createdAt)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="hidden sm:inline-flex">
                    <Chip fixed raw tone={NOTIFICATION_KIND_LOOK[n.kind]?.tone}>
                      {chipWordOf(n)}
                    </Chip>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="flex justify-end border-t border-line-soft px-5 py-3">
          <Button type="button" size="sm" onClick={onShowInList}>
            Show in the list
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The person's channels (prototype "<client> gets these by"), from their own profile. */
function ChannelsCard({ role }: { role: Parameters<typeof notificationSettingsHref>[0] }) {
  const profile = useQuery({
    queryKey: ['account', 'profile', 'channels'],
    queryFn: async () => {
      const res = await fetch('/api/account/profile');
      if (!res.ok) throw new Error('profile');
      const body = (await res.json()) as { profile?: { phoneE164?: string | null; whatsappOptIn?: boolean } };
      return body.profile ?? {};
    },
    staleTime: 60_000,
  });
  const whatsapp = Boolean(profile.data?.phoneE164 && profile.data?.whatsappOptIn);
  return (
    <DashSection title="You get these by" bodyClassName="p-0">
      <div className="grid gap-2 px-4 py-4 md:px-5">
        <span className="flex flex-wrap gap-2">
          <Tag tone="prog">✓ Email</Tag>
          {whatsapp ? <Tag tone="ok">✓ WhatsApp</Tag> : null}
        </span>
        <Link href={notificationSettingsHref(role)} className="text-[13px] font-medium text-brand-text hover:underline">
          Change in Settings ›
        </Link>
      </div>
    </DashSection>
  );
}

/** L1 loading rows: a tile, two lines and a chip shape. */
function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-[60px] items-center gap-3 border-t border-line-soft px-4 py-2.5 first:border-t-0 md:px-5">
          <span className="h-[30px] w-[30px] flex-none animate-pulse rounded-md bg-surface-sunken" />
          <span className="grid min-w-0 flex-1 gap-1.5">
            <span className="h-3.5 w-1/2 animate-pulse rounded-mark bg-surface-sunken" />
            <span className="h-3 w-3/4 animate-pulse rounded-mark bg-surface-sunken" />
          </span>
          <span className="hidden h-6 w-[104px] flex-none animate-pulse rounded-md bg-surface-sunken sm:block" />
        </li>
      ))}
    </ul>
  );
}

export default function NotificationHistoryPage() {
  const pathname = usePathname();
  const { markNotificationRead, user } = useApp();
  const query = useNotificationHistory();
  const [tab, setTab] = useState<NotificationTab>('all');
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [drill, setDrill] = useState<'all' | NotificationGroup | null>(null);
  const [readHere, setReadHere] = useState<Set<string>>(() => new Set());

  const now = useMemo(() => new Date(), [query.data]);

  const inView = query.data ?? [];

  const isUnread = (n: AppNotification) => !n.read && !readHere.has(n.id);
  const counts = tabCounts(inView, isUnread);
  const filtered = inView.filter((n) => matchesTab(n, tab, isUnread));

  const grouped = groupNotificationsForHistory(filtered, now);
  const sections = (['today', 'week', 'earlier'] as const)
    .map((id) => ({ id, label: GROUP_LABEL[id], items: grouped[id] }))
    .filter((section) => section.items.length > 0);

  const month = useMemo(
    () => (query.data ?? []).filter((n) => isCreatedThisIstMonth(n.createdAt, now)),
    [query.data, now],
  );
  const monthCount = (g: NotificationGroup) => month.filter((n) => groupOf(n) === g).length;
  const filtersSet = tab !== 'all';

  function markRead(id: string) {
    markNotificationRead(id);
    setReadHere((prev) => new Set(prev).add(id));
  }

  function open(n: AppNotification) {
    markRead(n.id);
    setDetail(n);
  }

  function resetFilters() {
    setTab('all');
  }

  return (
    <PageTransition>
      <SEO
        title="Notification history — VCFO Suite"
        description="Every notification for your account, including items cleared from the inbox."
        path={pathname}
      />
      {/* The top bar names the page, so the heading is for screen readers only (R-09). */}
      <h1 className="sr-only">Notifications</h1>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_272px]">
        <section className="surface min-w-0 overflow-hidden" aria-label="Notification history">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 md:px-5">
            <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
              <SpectrumTabs
                size="md"
                label="Filter notifications"
                items={TABS.map((t) => ({ key: t, label: TAB_LABEL[t], count: query.isLoading ? undefined : counts[t] }))}
                value={tab}
                onChange={(key) => setTab(key as NotificationTab)}
              />
            </div>
          </div>

          {query.isLoading ? (
            <div aria-busy="true" aria-label="Loading history">
              <LoadingRows />
            </div>
          ) : query.isError ? (
            <div className="p-4">
              <EmptyState
                title="Could not load history"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4" role="status">
              <EmptyState
                title={tab === 'unread' ? 'Nothing unread' : 'No notifications in this view'}
                action={
                  filtersSet ? (
                    <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                      See all
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id}>
                {section.label ? (
                  <h2 className="flex h-9 items-end border-t border-line-soft px-4 pb-2 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted first:border-t-0 md:px-5">
                    {section.label}
                  </h2>
                ) : null}
                <ul>
                  {section.items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      unread={isUnread(item)}
                      onRead={() => markRead(item.id)}
                      onOpen={() => open(item)}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <div className="grid min-w-0 gap-4">
          <DashSection title="This month" bodyClassName="p-0">
            {query.isLoading ? (
              <LoadingRows rows={3} />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setDrill('all')}
                  className="block w-full px-4 pt-4 text-left hover:bg-surface-sunken md:px-5"
                  aria-label={`Show all ${month.length} notifications this month`}
                >
                  <span className="text-[26px] font-medium leading-none tabular-nums text-ink">{month.length}</span>
                  <span className="ml-2 text-[12.5px] text-ink-muted">this month</span>
                </button>
                <div className="px-4 pb-2 pt-3 md:px-5">
                  <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
                    {NOTIFICATION_GROUPS.map((g) => {
                      const n = monthCount(g);
                      return n > 0 ? (
                        <span key={g} className={cn('h-full', BAR_TONE[g])} style={{ flexGrow: n, flexBasis: 0 }} />
                      ) : null;
                    })}
                  </div>
                </div>
                <ul>
                  {NOTIFICATION_GROUPS.map((g) => (
                    <li key={g} className="border-t border-line-soft first:border-t-0">
                      <button
                        type="button"
                        onClick={() => setDrill(g)}
                        className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2 text-left text-[14px] hover:bg-surface-sunken md:px-5"
                      >
                        <span className="min-w-0 flex-1">{g}</span>
                        <b className="font-medium tabular-nums">{monthCount(g)}</b>
                        <ChevronRight className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.6} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </DashSection>
          <ChannelsCard role={user?.role} />
        </div>
      </div>

      <MonthDrill
        open={drill !== null}
        tab={drill ?? 'all'}
        items={month}
        onTab={setDrill}
        onClose={() => setDrill(null)}
        onPick={(n) => {
          setDrill(null);
          open(n);
        }}
        onShowInList={() => {
          setTab(drill && drill !== 'all' ? drill : 'all');
          setDrill(null);
        }}
      />
      <NotificationPanel item={detail} onClose={() => setDetail(null)} />
    </PageTransition>
  );
}
