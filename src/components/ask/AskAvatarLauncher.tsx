'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAskOptional } from './ask-context';
import { useAvatarYield } from './use-avatar-yield';
import { VisorCharacter } from './Visor';
import './ask-avatar.css';

/**
 * The Ask VCFO robot in the bottom-right corner of the staff shell (owner decision 2 Nov 2026,
 * the client portal v7 prototype's launcher). The robot grips the bottom edge and plays the
 * owner's 20.5 s loop; clicking it, or the "Ask VCFO" pill beside it, opens the pop-up chat
 * (`AskPanel`). It ducks while the page scrolls, while the chat is open, or when it would cover
 * a control. It hides on the full Ask VCFO page and on phones, which have the tab bar's Ask tab.
 */
export function AskAvatarLauncher() {
  const ask = useAskOptional();
  const launchRef = useRef<HTMLDivElement>(null);
  const open = Boolean(ask?.open);
  const { yieldOn } = useAvatarYield(launchRef, open);
  if (!ask?.enabled || ask.pageOpen) return null;

  return (
    <div id="ask-avatar" ref={launchRef} className={cn('ask-vpv-scope', yieldOn && 'yield', open && 'open')}>
      {/* The robot is a second, mouse-only way in; the pill beside it is the keyboard control. */}
      <span className="vpl-char" aria-hidden="true" onClick={ask.toggle}>
        <span className="vpl-lift">
          <VisorCharacter variant="loop" />
        </span>
      </span>
      <button
        type="button"
        onClick={ask.toggle}
        aria-expanded={open}
        aria-controls="ask-panel"
        aria-label={open ? 'Close Ask VCFO chat' : 'Open Ask VCFO chat'}
        className={cn(
          'ask-av-pill inline-flex h-9 flex-none items-center gap-[7px] rounded-md bg-side px-3.5 text-[13px] font-medium text-side-ink shadow-dialog transition-colors hover:bg-side-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/40',
          open && 'invisible',
        )}
      >
        <i className="ask-av-dot" aria-hidden="true" />
        Ask VCFO
      </button>
    </div>
  );
}
