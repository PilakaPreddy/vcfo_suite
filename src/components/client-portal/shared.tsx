'use client';

/**
 * Shared portal pieces used by every page:
 *  - `InfoPopover` — design rule 7: an (i) button next to a title; click opens a
 *    ≤280 px pop-over attached to the icon, ending with "Ask VCFO about this".
 *    Uses the base board classes `.info > button + .pop .ask`.
 *  - `BotSays` — design rule 16: the Ask VCFO head says it in a speech bubble.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePortal } from './PortalProvider';
import { VisorHead } from '@/components/ask/Visor';
import { LinkButton } from './LinkButton';

let openInfo: (() => void) | null = null;

export function InfoPopover({
  children,
  askAbout,
  label = 'More information',
  below = true,
  style,
}: {
  children: ReactNode;
  /** Title the "Ask VCFO about this" row asks about. */
  askAbout?: string;
  label?: string;
  below?: boolean;
  style?: CSSProperties;
}) {
  const { openChat } = usePortal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    if (openInfo && openInfo !== close) openInfo();
    openInfo = close;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
      if (openInfo === close) openInfo = null;
    };
  }, [open]);
  return (
    <span className={`info${open ? ' open' : ''}`} ref={ref} style={style} data-below={below ? '' : undefined}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      <span className="pop" role="dialog">
        {children}
        <LinkButton
          className="ask w-full"
          onClick={() => {
            setOpen(false);
            openChat(askAbout ? `Tell me about ${askAbout}` : 'Tell me more about this');
          }}
        >
          <span style={{ width: 16, height: 16, display: 'inline-flex', overflow: 'hidden' }}>
            <VisorHead style={{ width: 16, height: 20, marginTop: 2 }} />
          </span>
          Ask VCFO about this
        </LinkButton>
      </span>
    </span>
  );
}

function BotSays({
  children,
  size = 48,
  action = 'Ask VCFO why',
  question,
  secondary,
  style,
}: {
  children: ReactNode;
  size?: number;
  /** Button label; empty string hides it. */
  action?: string;
  /** Question the action asks (defaults to the action label). */
  question?: string;
  secondary?: ReactNode;
  style?: CSSProperties;
}) {
  const { openChat } = usePortal();
  const head = Math.round(size * 0.74);
  return (
    <div className="cp-botsay" style={style}>
      <span className="bface" aria-hidden="true" style={{ width: size, height: size }}>
        <VisorHead style={{ width: head, height: Math.round(head * 1.26), marginTop: Math.round(head * 0.3) }} />
      </span>
      <div className="bubble">
        <div>{children}</div>
        {action || secondary ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {action ? (
              <button type="button" className="btn btn-o btn-s" style={{ height: 28 }} onClick={() => openChat(question ?? action)}>
                🤖 {action}
              </button>
            ) : null}
            {secondary}
          </div>
        ) : null}
      </div>
    </div>
  );
}
