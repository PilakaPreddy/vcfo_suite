'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { NotificationKindTile } from '@/components/notifications/notification-kind';
import { NOTIFICATION_KIND_LOOK } from '@/components/notifications/notification-kind-look';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { roleNotificationsPath } from '@/lib/auth-routes';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import {
  formatNotificationWhen,
  notificationHrefIsNavigable,
} from '@/lib/notifications/notification-dismiss';
import {
  NOTIFICATION_BELL_SELECTOR,
  NOTIFICATION_BELL_TARGET_SELECTOR,
  NOTIFICATION_GENIE_LAND_EVENT,
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_SHOW_EVENT,
  addNotificationPopupIds,
  readNotificationPopupIds,
  selectNotificationPopups,
  type NotificationShowDetail,
} from '@/lib/notifications/notification-popup';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';
import { GenieCard, createPopupQueue } from '@/components/notifications/genie-popup';

const popupQueue = createPopupQueue<AppNotification>();

function NotificationGenieCard({
  item,
  replay,
  remaining,
  reduceMotion,
  onParked,
  onSkipAll,
}: {
  item: AppNotification;
  replay: boolean;
  /** Cards still waiting behind this one. */
  remaining: number;
  reduceMotion: boolean;
  onParked: () => void;
  onSkipAll: () => void;
}) {
  const message = item.body.trim() || item.title;
  const extraTitle = Boolean(item.title && item.body && item.title !== item.body);
  const canOpen = notificationHrefIsNavigable(item.href);
  const { user } = useApp();
  /* The popup stays the first stop; only this button goes to the full Notifications page. */
  const pageHref = user && user.role !== 'developer' ? roleNotificationsPath(user.role) : null;

  return (
    <GenieCard
      kind="notification"
      bellTargetSelector={NOTIFICATION_BELL_TARGET_SELECTOR}
      bellSelector={NOTIFICATION_BELL_SELECTOR}
      fallbackRight={48}
      landEvent={NOTIFICATION_GENIE_LAND_EVENT}
      remaining={remaining}
      reduceMotion={reduceMotion}
      onParked={onParked}
      onSkipAll={onSkipAll}
      header={
        <div className="flex min-w-0 items-center gap-3">
          <NotificationKindTile kind={item.kind} size={36} />
          <div className="min-w-0">
            <p id="notification-live-title" className="text-[12.5px] font-medium text-ink-muted">
              {replay ? 'Notification' : 'New notification'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Chip fixed tone={NOTIFICATION_KIND_LOOK[item.kind]?.tone}>
                {NOTIFICATION_KIND_LABEL[item.kind]}
              </Chip>
              <time dateTime={item.createdAt} className="text-[12.5px] tabular-nums text-ink-muted">
                {formatNotificationWhen(item.createdAt)}
              </time>
            </div>
          </div>
        </div>
      }
      body={
        <>
          {extraTitle ? <p className="mb-1.5 text-[13px] font-medium text-ink-2">{item.title}</p> : null}
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{message}</p>
          {item.companyName ? (
            <p className="mt-4 border-t border-line-soft pt-3 text-[13px] text-ink-muted">{item.companyName}</p>
          ) : null}
        </>
      }
      actions={
        <>
          {pageHref ? (
            <Button asChild variant="quiet">
              <Link href={pageHref}>Open page</Link>
            </Button>
          ) : null}
          {canOpen ? (
            <Button asChild variant="outline">
              <Link href={item.href}>Open</Link>
            </Button>
          ) : null}
        </>
      }
    />
  );
}

export function NotificationLivePopup() {
  const { user } = useApp();
  const list = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('notifications_failed');
      const data = (await res.json()) as { notifications?: AppNotification[] };
      return data.notifications ?? [];
    },
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    notifyOnChangeProps: ['data', 'error'],
  });
  const osReduce = useReducedMotion();
  const { reduceMotion: prefReduce } = useShellAppearance();
  const reduceMotion = Boolean(osReduce) || prefReduce;
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [gap, setGap] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showNonce, setShowNonce] = useState(0);
  const items = list.data;
  const itemKey = items?.map((item) => item.id).join('|') ?? '';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user?.id || !items) return;
    const poppedIds = readNotificationPopupIds(user.id);
    const { queue: incoming, seedIds } = selectNotificationPopups({ items, poppedIds });
    if (poppedIds === null || seedIds.length > 0) {
      addNotificationPopupIds(user.id, seedIds);
    }
    setQueue((prev) => {
      const next = popupQueue.merge(user.id, incoming);
      if (prev.length === next.length && prev.every((row, i) => row.id === next[i]?.id)) {
        return prev;
      }
      return next;
    });
  }, [user?.id, itemKey, items]);

  useEffect(() => {
    if (!user?.id) return;
    const onShow = (event: Event) => {
      const item = (event as CustomEvent<NotificationShowDetail>).detail?.notification;
      if (!item) return;
      setGap(false);
      setQueue(popupQueue.enqueueManual(user.id, item));
      setShowNonce((n) => n + 1);
    };
    window.addEventListener(NOTIFICATION_SHOW_EVENT, onShow);
    return () => window.removeEventListener(NOTIFICATION_SHOW_EVENT, onShow);
  }, [user?.id]);

  const onParked = useCallback(() => {
    if (!user?.id) return;
    const parkedId = popupQueue.front(user.id)?.id;
    setGap(true);
    window.setTimeout(
      () => {
        const front = popupQueue.front(user.id);
        if (front && parkedId && front.id === parkedId) {
          setQueue(popupQueue.shift(user.id));
        }
        setGap(false);
      },
      reduceMotion ? 60 : 120,
    );
  }, [reduceMotion, user?.id]);

  const userId = user?.id;
  const onSkipAll = useCallback(() => {
    if (!userId) return;
    setQueue(popupQueue.keepOnlyFront(userId));
  }, [userId]);

  const current = !gap ? queue[0] : undefined;
  if (!mounted || typeof document === 'undefined' || !current) return null;

  return createPortal(
    <NotificationGenieCard
      key={`${current.id}-${showNonce}`}
      item={current}
      replay={popupQueue.manualIds.has(current.id)}
      remaining={Math.max(0, queue.length - 1)}
      reduceMotion={reduceMotion}
      onParked={onParked}
      onSkipAll={onSkipAll}
    />,
    document.body,
  );
}
