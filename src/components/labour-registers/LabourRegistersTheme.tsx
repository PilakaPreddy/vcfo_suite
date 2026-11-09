'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LR_TOKENS, lr } from './theme';

/**
 * Puts the feature's own tokens on a wrapper, so every screen under it reads the reference's
 * values and nothing outside it changes. See `theme.ts` for why they are scoped rather than
 * global.
 *
 * **`cp-tw` is why these screens render at all inside the client portal.** The portal's own
 * stylesheets are plain, unlayered CSS and Tailwind's utilities sit in a cascade layer, so
 * inside `.cp` every portal rule beats every utility however specific the utility is — the
 * card loses its border and its background, the stat row stops being a flex row, and the type
 * falls back to the portal's 13px. The portal already has the answer for a Tailwind island and
 * uses it for its own upload tray: the `cp-tw` marker. It is applied here rather than at the
 * four client call sites so that a new screen cannot forget it, and it does nothing at all
 * outside the portal, where every `cp-tw` rule needs a `.cp` ancestor to match.
 */
export function LabourRegistersTheme({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div style={LR_TOKENS as CSSProperties} className={cn('cp-tw', lr.page, 'bg-[var(--lr-canvas)]', className)}>
      {children}
    </div>
  );
}
