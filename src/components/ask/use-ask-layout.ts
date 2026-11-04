'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * VCFO Spectrum (F-299): from 640 px Ask VCFO is a floating card over the page, without a
 * scrim, so it can stay open while the person reads the page beside it. Under 640 px it fills
 * the screen.
 */
export type AskLayoutMode = 'float' | 'sheet';

/**
 * The three pop-up sizes (owner item F3, 30 Oct 2026). Small and Large float at the bottom
 * right; Side is a full-height panel on the right edge. The person's choice is kept per user
 * in localStorage.
 */
export type AskPanelSize = 'small' | 'large' | 'side';

export const ASK_PANEL_SIZES: Record<AskPanelSize, { label: string; width: number; height: number | null }> = {
  small: { label: 'Small', width: 380, height: 560 },
  large: { label: 'Large', width: 520, height: 720 },
  side: { label: 'Side panel', width: 440, height: null },
};

function modeFor(width: number): AskLayoutMode {
  return width >= 640 ? 'float' : 'sheet';
}

export function useAskLayoutMode(): AskLayoutMode {
  const [mode, setMode] = useState<AskLayoutMode>('float');
  useEffect(() => {
    const update = () => setMode(modeFor(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return mode;
}

function askSizeKey(userId: string | null | undefined): string {
  return `vcfo.ask.size.${userId ?? 'anon'}`;
}

function isSize(v: unknown): v is AskPanelSize {
  return v === 'small' || v === 'large' || v === 'side';
}

/** The pop-up size for this user, read from and saved to localStorage. */
export function useAskPanelSize(userId: string | null | undefined): [AskPanelSize, (size: AskPanelSize) => void] {
  const key = askSizeKey(userId);
  const [size, setSizeState] = useState<AskPanelSize>('small');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      setSizeState(isSize(v) ? v : 'small');
    } catch {
      // Storage blocked: the pop-up opens Small.
    }
  }, [key]);
  const setSize = useCallback(
    (next: AskPanelSize) => {
      setSizeState(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Storage blocked: the size lasts for this page load only.
      }
    },
    [key],
  );
  return [size, setSize];
}

/**
 * Right padding the shell adds for the panel. The floating card sits over the page, so
 * this is always 0; the hook stays so the shell column keeps one place to ask.
 */
export function useAskPushPadding(): number {
  return 0;
}
