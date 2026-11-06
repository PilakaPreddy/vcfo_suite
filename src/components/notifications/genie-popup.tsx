'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { m } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { measureGenieDock, type GenieBox } from '@/lib/notifications/genie-dock';
import { cn } from '@/lib/utils';

/**
 * The live popup queue shared by the announcement and notification popups. Each popup keeps one
 * queue per viewer for the browser session; ids opened by hand are tracked so the card can say
 * it is a replay.
 */
export function createPopupQueue<T extends { id: string }>() {
  const byUser = new Map<string, T[]>();
  const manualIds = new Set<string>();
  return {
    manualIds,
    front: (userId: string): T | undefined => byUser.get(userId)?.[0],
    merge(userId: string, incoming: T[]): T[] {
      const prev = byUser.get(userId) ?? [];
      const seen = new Set(prev.map((item) => item.id));
      const next = [...prev];
      for (const item of incoming) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        next.push(item);
      }
      byUser.set(userId, next);
      return next;
    },
    enqueueManual(userId: string, item: T): T[] {
      manualIds.add(item.id);
      const rest = (byUser.get(userId) ?? []).filter((row) => row.id !== item.id);
      const next = [item, ...rest];
      byUser.set(userId, next);
      return next;
    },
    shift(userId: string): T[] {
      const prev = byUser.get(userId) ?? [];
      const gone = prev[0];
      if (gone) manualIds.delete(gone.id);
      const next = prev.slice(1);
      byUser.set(userId, next);
      return next;
    },
    /**
     * "Skip all": drop everything behind the card on screen. The front item stays so it can still
     * play its park animation; the normal shift after landing empties the queue. Skipped ids were
     * already recorded as popped when they were queued, so a later poll does not bring them back.
     */
    keepOnlyFront(userId: string): T[] {
      const prev = byUser.get(userId) ?? [];
      for (const row of prev.slice(1)) manualIds.delete(row.id);
      const next = prev.slice(0, 1);
      byUser.set(userId, next);
      return next;
    },
  };
}

function readBellBox(targetSelector: string, bellSelector: string, fallbackRight: number): GenieBox {
  const el =
    document.querySelector<HTMLElement>(targetSelector) ?? document.querySelector<HTMLElement>(bellSelector);
  const to = el?.getBoundingClientRect();
  if (to) return { left: to.left, top: to.top, width: to.width, height: to.height };
  return { left: window.innerWidth - fallbackRight, top: 10, width: 28, height: 28 };
}

/**
 * The modal card that "genies" into its bell when dismissed. The caller supplies the header,
 * body and extra footer buttons; the card owns the backdrop, close button, keyboard shortcuts,
 * the "N more waiting / Skip all" row, the "Got it" button and the park animation.
 */
export function GenieCard({
  kind,
  bellTargetSelector,
  bellSelector,
  fallbackRight,
  landEvent,
  remaining,
  reduceMotion,
  onParked,
  onSkipAll,
  header,
  body,
  actions,
}: {
  /** Used for the dismiss label, the title id and the enter animation class. */
  kind: 'announcement' | 'notification';
  bellTargetSelector: string;
  bellSelector: string;
  /** Distance from the right edge of the window when the bell is not on screen. */
  fallbackRight: number;
  landEvent: string;
  /** Cards still waiting behind this one. */
  remaining: number;
  reduceMotion: boolean;
  onParked: () => void;
  onSkipAll: () => void;
  header: ReactNode;
  body: ReactNode;
  actions: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [flying, setFlying] = useState(false);

  const finish = useCallback(() => {
    window.dispatchEvent(new Event(landEvent));
    onParked();
  }, [landEvent, onParked]);

  const park = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (reduceMotion) {
      finish();
      return;
    }
    const card = cardRef.current;
    if (!card) {
      finish();
      return;
    }
    const from = card.getBoundingClientRect();
    const { from: origin, to } = measureGenieDock(
      { left: from.left, top: from.top, width: from.width, height: from.height },
      readBellBox(bellTargetSelector, bellSelector, fallbackRight),
    );
    setFlying(true);
    card.style.position = 'fixed';
    card.style.left = `${origin.left}px`;
    card.style.top = `${origin.top}px`;
    card.style.width = `${origin.width}px`;
    card.style.height = `${origin.height}px`;
    card.style.margin = '0';
    card.style.zIndex = '101';
    card.style.transform = 'none';
    card.style.overflow = 'hidden';
    card.style.backgroundColor = 'oklch(var(--brand))';
    card.style.borderColor = 'oklch(var(--brand))';
    const animation = card.animate(
      [
        {
          left: `${origin.left}px`,
          top: `${origin.top}px`,
          width: `${origin.width}px`,
          height: `${origin.height}px`,
          borderRadius: '6px',
          opacity: 1,
          offset: 0,
        },
        {
          left: `${origin.left + (to.left - origin.left) * 0.32}px`,
          top: `${origin.top + (to.top - origin.top) * 0.2}px`,
          width: `${origin.width * 0.38}px`,
          height: `${origin.height * 0.58}px`,
          borderRadius: '12px',
          opacity: 1,
          offset: 0.4,
        },
        {
          left: `${to.left}px`,
          top: `${to.top}px`,
          width: `${to.width}px`,
          height: `${to.height}px`,
          borderRadius: `${to.width / 2}px`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: 720, easing: 'cubic-bezier(0.42, 0, 0.88, 0.08)', fill: 'forwards' },
    );
    animation.onfinish = () => finish();
  }, [bellSelector, bellTargetSelector, fallbackRight, finish, reduceMotion]);

  const skipAll = useCallback(() => {
    if (started.current) return;
    onSkipAll();
    park();
  }, [onSkipAll, park]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (event.shiftKey && remaining > 0) skipAll();
      else park();
    };
    // Capture first: the card on top takes Escape, and what lies under it sees the key was used.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [park, remaining, skipAll]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] grid place-items-center p-4">
      <m.button
        type="button"
        aria-label={`Dismiss ${kind}`}
        className="pointer-events-auto absolute inset-0 cursor-default bg-ink/45"
        initial={{ opacity: reduceMotion ? 1 : 0 }}
        animate={{ opacity: flying ? 0 : 1 }}
        transition={{ duration: reduceMotion ? 0 : flying ? 0.4 : 0.28 }}
        onClick={park}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${kind}-live-title`}
        className={cn(
          'pointer-events-auto relative w-[min(100vw-2rem,30rem)] overflow-hidden rounded-md border-1.5 border-line bg-surface-raised shadow-dialog',
          !reduceMotion && !flying && `${kind}-live-enter`,
        )}
      >
        <div className={cn('relative', flying && 'pointer-events-none opacity-0 transition-opacity duration-150')}>
          <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 pb-3 pt-4">
            {header}
            <button
              type="button"
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Close"
              onClick={park}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-5 pb-4 pt-4">{body}</div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
            {remaining > 0 ? (
              <>
                <span className="text-[12.5px] text-ink-muted">{remaining} more waiting</span>
                <Button type="button" variant="quiet" size="sm" title="Skip all (Shift+Esc)" onClick={skipAll}>
                  Skip all
                </Button>
              </>
            ) : null}
            <span className="mr-auto" />
            {actions}
            <Button type="button" onClick={park}>
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
