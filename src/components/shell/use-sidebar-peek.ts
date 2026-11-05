'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SIDEBAR_NARROW_QUERY, isTypingTarget } from '@/components/shell/intern-sidebar';

/** R-49 timings: hover intent before the rail opens, and the grace before it closes. */
const SIDEBAR_PEEK_OPEN_MS = 160;
const SIDEBAR_PEEK_CLOSE_MS = 280;

/** True under 1100px, where the desktop sidebar is always the rail (R-49). */
export function useSidebarNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(SIDEBAR_NARROW_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}

/** The "[" key switches pinned and rail. Not while typing, and not with a modifier. */
export function useSidebarPinKey(onToggle: () => void, enabled = true) {
  const latest = useRef(onToggle);
  latest.current = onToggle;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

function focusVisible(el: EventTarget | null): boolean {
  try {
    return el instanceof HTMLElement && el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/**
 * Hover and focus for the rail (R-49). A mouse that rests for 160ms opens the full sidebar
 * over the page, so a pointer that only crosses the rail does not; it closes 280ms after
 * the pointer leaves, so one that slips off the edge does not snap it shut. Keyboard focus
 * opens it at once. Touch does not peek: a tap opens the page or the item's menu instead.
 * Spread `handlers` on the element that holds both the rail and the open sidebar.
 */
export function useSidebarPeek(enabled: boolean) {
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) {
      clear();
      setPeek(false);
    }
  }, [enabled, clear]);
  useEffect(() => clear, [clear]);

  const openNow = useCallback(() => {
    if (!enabled) return;
    clear();
    setPeek(true);
  }, [enabled, clear]);

  const closeNow = useCallback(() => {
    clear();
    setPeek(false);
  }, [clear]);

  const closeSoon = useCallback(() => {
    if (!enabled) return;
    clear();
    timer.current = setTimeout(() => setPeek(false), SIDEBAR_PEEK_CLOSE_MS);
  }, [enabled, clear]);

  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.pointerType === 'touch') return;
      clear();
      timer.current = setTimeout(() => setPeek(true), SIDEBAR_PEEK_OPEN_MS);
    },
    [enabled, clear],
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.pointerType === 'touch') return;
      closeSoon();
    },
    [enabled, closeSoon],
  );

  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (!enabled) return;
      if (focusVisible(e.target)) openNow();
    },
    [enabled, openNow],
  );

  const onBlur = useCallback(
    (e: React.FocusEvent<HTMLElement>) => {
      if (!enabled) return;
      // Keep it open while focus moves to another control inside.
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      closeSoon();
    },
    [enabled, closeSoon],
  );

  // Esc closes a hover peek even when focus is out on the page.
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peek, closeNow]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Escape' || !peek) return;
      e.stopPropagation();
      closeNow();
      (document.activeElement as HTMLElement | null)?.blur?.();
    },
    [peek, closeNow],
  );

  return {
    peek,
    openNow,
    closeNow,
    handlers: { onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown },
  };
}
