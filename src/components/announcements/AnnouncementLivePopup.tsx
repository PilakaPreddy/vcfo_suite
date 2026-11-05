'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/spectrum-chip';
import {
  AnnouncementKindChip,
  announcementIsImportant,
  formatAnnouncementWhen,
} from '@/components/announcements/AnnouncementList';
import { useApp } from '@/context/AppContext';
import { roleNotificationsPath } from '@/lib/auth-routes';
import { useAnnouncements } from '@/hooks/use-announcements';
import { useShellAppearance } from '@/hooks/use-shell-appearance';
import {
  ANNOUNCEMENT_BELL_SELECTOR,
  ANNOUNCEMENT_BELL_TARGET_SELECTOR,
  ANNOUNCEMENT_GENIE_LAND_EVENT,
  ANNOUNCEMENT_SHOW_EVENT,
  addAnnouncementPopupIds,
  announcementAttribution,
  announcementYmdIst,
  parseAnnouncementKind,
  readAnnouncementIds,
  readAnnouncementPopupIds,
  readDailyAnnouncementSeenIds,
  selectAnnouncementPopups,
  type Announcement,
  type AnnouncementShowDetail,
} from '@/lib/notifications/announcements';
import { GenieCard, createPopupQueue } from '@/components/notifications/genie-popup';

const popupQueue = createPopupQueue<Announcement>();

function AnnouncementGenieCard({
  item,
  replay,
  remaining,
  reduceMotion,
  onParked,
  onSkipAll,
}: {
  item: Announcement;
  replay: boolean;
  /** Cards still waiting behind this one. */
  remaining: number;
  reduceMotion: boolean;
  onParked: () => void;
  onSkipAll: () => void;
}) {
  const message = item.body.trim() || item.title;
  const extraTitle = Boolean(item.title && item.body && item.title !== item.body);
  const { user } = useApp();
  /* The popup stays the first stop; only this button goes to the full Announcements page. */
  const pageHref =
    user && user.role !== 'developer' ? roleNotificationsPath(user.role).replace(/\/notifications$/, '/announcements') : null;

  return (
    <GenieCard
      kind="announcement"
      bellTargetSelector={ANNOUNCEMENT_BELL_TARGET_SELECTOR}
      bellSelector={ANNOUNCEMENT_BELL_SELECTOR}
      fallbackRight={88}
      landEvent={ANNOUNCEMENT_GENIE_LAND_EVENT}
      remaining={remaining}
      reduceMotion={reduceMotion}
      onParked={onParked}
      onSkipAll={onSkipAll}
      header={
        <div className="min-w-0">
          <p id="announcement-live-title" className="text-[12.5px] font-medium text-ink-muted">
            {replay ? 'Announcement' : 'New announcement'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <AnnouncementKindChip kind={item.kind} />
            {announcementIsImportant(item.kind) && parseAnnouncementKind(item.kind) !== 'deadline' ? (
              <Tag tone="bad">Important</Tag>
            ) : null}
            {item.unreviewed ? <Tag tone="warn">Not yet reviewed</Tag> : null}
            <time dateTime={item.publishedAt} className="text-[12.5px] tabular-nums text-ink-muted">
              {formatAnnouncementWhen(item.publishedAt)}
            </time>
          </div>
        </div>
      }
      body={
        <>
          {extraTitle ? <p className="mb-1.5 text-[13px] font-medium text-ink-2">{item.title}</p> : null}
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{message}</p>
          <p className="mt-4 border-t border-line-soft pt-3 text-[13px] text-ink-muted">
            {announcementAttribution(item)}
          </p>
        </>
      }
      actions={
        <>
          {pageHref ? (
            <Button asChild variant="quiet">
              <Link href={pageHref}>Open page</Link>
            </Button>
          ) : null}
          {item.sourceUrl ? (
            <Button asChild variant="outline">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                Open source
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </>
      }
    />
  );
}

export function AnnouncementLivePopup() {
  const { user } = useApp();
  const list = useAnnouncements();
  const osReduce = useReducedMotion();
  const { reduceMotion: prefReduce } = useShellAppearance();
  const reduceMotion = Boolean(osReduce) || prefReduce;
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [gap, setGap] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showNonce, setShowNonce] = useState(0);
  const items = list.data?.announcements;
  const itemKey = items?.map((item) => item.id).join('|') ?? '';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user?.id || !items) return;
    const poppedIds = readAnnouncementPopupIds(user.id);
    const readIds = readAnnouncementIds(user.id);
    const dailySeenIds = new Set(readDailyAnnouncementSeenIds(user.id, announcementYmdIst()));
    const { queue: incoming, seedIds } = selectAnnouncementPopups({
      items,
      viewerId: user.id,
      poppedIds,
      readIds,
      dailySeenIds,
    });
    if (poppedIds === null || seedIds.length > 0) {
      addAnnouncementPopupIds(user.id, seedIds);
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
      const item = (event as CustomEvent<AnnouncementShowDetail>).detail?.announcement;
      if (!item) return;
      setGap(false);
      setQueue(popupQueue.enqueueManual(user.id, item));
      setShowNonce((n) => n + 1);
    };
    window.addEventListener(ANNOUNCEMENT_SHOW_EVENT, onShow);
    return () => window.removeEventListener(ANNOUNCEMENT_SHOW_EVENT, onShow);
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
    <AnnouncementGenieCard
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
