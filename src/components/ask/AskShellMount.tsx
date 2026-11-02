'use client';

import type { CSSProperties, ReactNode } from 'react';
import { canUseAsk } from '@/lib/ask/access';
import { AskAvatarLauncher } from './AskAvatarLauncher';
import { AskFocusHandler } from './AskFocusHandler';
import { AskPanel } from './AskPanel';
import { BackToAskPill } from './BackToAskPill';
import { useAskPushPadding } from './use-ask-layout';
import { AskProvider } from './AskProvider';

/**
 * Mounts Ask VCFO for the roles `canUseAsk` admits (client, project lead, manager,
 * admin, super admin) — gated on the real session role, never the route, because
 * admin and manager share views. The robot in the bottom-right corner opens the pop-up; the
 * sidebar link opens the full page. The developer gets their children untouched.
 */
export function AskShellMount({ userRole, children }: { userRole: string | null | undefined; children: ReactNode }) {
  if (!canUseAsk(userRole)) return <>{children}</>;
  return (
    <AskProvider>
      {children}
      <AskPanel />
      <AskAvatarLauncher />
      <BackToAskPill />
      <AskFocusHandler />
    </AskProvider>
  );
}

/** The shell's content column. The floating Ask card sits over it, so it adds no padding today. */
export function AskPushColumn({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const pad = useAskPushPadding();
  return (
    <div className={className} style={pad ? { ...style, paddingRight: pad } : style}>
      {children}
    </div>
  );
}
