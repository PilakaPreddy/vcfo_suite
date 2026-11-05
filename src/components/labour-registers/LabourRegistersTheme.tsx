'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LR_TOKENS, lr } from './theme';

/**
 * Puts the feature's own tokens on a wrapper, so every screen under it reads the reference's
 * values and nothing outside it changes. See `theme.ts` for why they are scoped rather than
 * global.
 */
export function LabourRegistersTheme({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div style={LR_TOKENS as CSSProperties} className={cn(lr.page, 'bg-[var(--lr-canvas)]', className)}>
      {children}
    </div>
  );
}
