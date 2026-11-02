'use client';

import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
// `m`, not `motion`: the app runs framer-motion in strict LazyMotion mode.
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { AppWindow, Maximize2, Minimize2, PanelRight, RotateCcw, X, type LucideIcon } from 'lucide-react';
import { roleAskPath } from '@/lib/auth-routes';
import { cn } from '@/lib/utils';
import { ease } from '@/lib/shell/motion';
import { useApp } from '@/context/AppContext';
import { AskComposer } from './AskComposer';
import { AskHome } from './AskHome';
import { useAskOptional } from './ask-context';
import { AskThread } from './AskThread';
import { VisorBadge, VisorCharacter } from './Visor';
import './ask-avatar.css';
import { ASK_PANEL_SIZES, useAskLayoutMode, useAskPanelSize, type AskPanelSize } from './use-ask-layout';

const iconButton =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-ink/[.06] hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';

const SIZE_ICON: Record<AskPanelSize, LucideIcon> = { small: Minimize2, large: Maximize2, side: PanelRight };

/**
 * Prototype AskButton head: 52px, the robot's head, the title in 15px weight 500. The floating
 * card adds the three size buttons and "Open full page" (owner items F3, F4).
 */
function Header({ onClose, size, setSize }: { onClose: () => void; size?: AskPanelSize; setSize?: (s: AskPanelSize) => void }) {
  const ask = useAskOptional()!;
  const { user } = useApp();
  const router = useRouter();
  const fullPage = roleAskPath(user?.role);
  const client = ask.shell === 'client';
  // Managers and leads read through their own scope, not the whole firm.
  const scoped = user?.role === 'manager' || user?.role === 'intern';
  return (
    <div className="flex-none border-b border-line-soft">
      {ask.preview && (
        <div className="flex items-center gap-2 bg-brand-soft px-4 py-1.5 text-[12.5px] font-medium text-brand-text">
          Client view · {ask.preview.companyName}
          <button type="button" className="ml-auto underline underline-offset-2" onClick={() => ask.setPreview(null)}>
            Exit preview
          </button>
        </div>
      )}
      <div className="flex min-h-[52px] items-center gap-2.5 px-4">
        <VisorBadge size={32} />
        <h2 className="text-[15px] font-medium text-ink">Ask VCFO</h2>
        {/* The Small card has no room for the scope beside the robot and the buttons. */}
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
          {size === 'small' ? null : client ? 'Verified sources' : scoped ? 'Your clients · read only' : 'Firm-wide · read only'}
        </span>
        {size && setSize ? (
          <div role="group" aria-label="Chat size" className="flex items-center">
            {(Object.keys(ASK_PANEL_SIZES) as AskPanelSize[]).map((k) => {
              const Icon = SIZE_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={size === k}
                  aria-label={ASK_PANEL_SIZES[k].label}
                  title={ASK_PANEL_SIZES[k].label}
                  onClick={() => setSize(k)}
                  className={cn(iconButton, size === k && 'bg-brand-soft text-brand-text hover:bg-brand-soft hover:text-brand-text')}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                </button>
              );
            })}
          </div>
        ) : null}
        {fullPage ? (
          <button
            type="button"
            aria-label="Open full page"
            title="Open full page"
            className={iconButton}
            onClick={() => {
              onClose();
              router.push(fullPage);
            }}
          >
            <AppWindow className="h-4 w-4" strokeWidth={1.6} />
          </button>
        ) : null}
        {ask.thread.length > 0 && (
          <button
            type="button"
            onClick={ask.reset}
            aria-label="Start a new conversation"
            title="New conversation"
            className={iconButton}
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close Ask VCFO" className={iconButton}>
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}

function Body({ compactHome }: { compactHome: boolean }) {
  const ask = useAskOptional()!;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {ask.thread.length === 0 ? <AskHome /> : <AskThread />}
      </div>
      <div className="flex-none space-y-2 border-t border-line-soft p-3">
        {ask.thread.length > 0 && compactHome && <AskHome compact />}
        <AskComposer />
      </div>
    </>
  );
}

/**
 * The panel (§7.3, VCFO Spectrum F-299): from 640 px a floating card with 6 px corners and the
 * dialog shadow, with no scrim, in one of three sizes the person picks in the head (owner item
 * F3): Small 380 x 560 and Large 520 x 720 at the bottom right, or Side panel, full height and
 * 440 px wide at the right edge. Under 640 px it fills the screen as a dialog with a focus trap.
 * It hides while the full Ask VCFO page is on screen.
 */
export function AskPanel() {
  const ask = useAskOptional();
  const mode = useAskLayoutMode();
  const reduceMotion = useReducedMotion();
  const { user } = useApp();
  const [size, setSize] = useAskPanelSize(user?.id);
  const panelRef = useRef<HTMLElement>(null);
  const open = Boolean(ask?.open) && !ask?.pageOpen;
  const close = () => ask?.setOpen(false);

  // Esc closes the floating card; the phone dialog gets it from Radix.
  useEffect(() => {
    if (!open || mode === 'sheet') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ask?.setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, ask]);

  useEffect(() => {
    if (open && mode !== 'sheet') {
      panelRef.current?.querySelector<HTMLTextAreaElement>('#ask-composer')?.focus();
    }
  }, [open, mode]);

  if (!ask?.enabled) return null;
  const dims = ASK_PANEL_SIZES[size];
  const side = size === 'side';

  if (mode === 'sheet') {
    return (
      <Dialog.Root open={open} onOpenChange={ask.setOpen}>
        <Dialog.Portal>
          <Dialog.Content
            id="ask-panel"
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col bg-surface-raised focus:outline-none"
          >
            <Dialog.Title className="sr-only">Ask VCFO</Dialog.Title>
            <Header onClose={close} />
            <Body compactHome />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <m.aside
          key="ask-panel"
          id="ask-panel"
          ref={panelRef}
          role="complementary"
          aria-label="Ask VCFO"
          data-size={size}
          className={cn(
            'ask-vpv-scope fixed z-50 flex flex-col border border-line bg-surface-raised shadow-dialog',
            side ? 'inset-y-0 right-0 overflow-hidden border-y-0 border-r-0' : 'bottom-5 right-5 rounded-md',
            ask.busy && 'ask-think',
          )}
          style={
            side
              ? { width: `min(${dims.width}px, 100vw)` }
              : { width: `min(${dims.width}px, calc(100vw - 40px))`, height: `min(${dims.height}px, calc(100vh - 40px))` }
          }
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: reduceMotion ? 0.1 : 0.16, ease }}
        >
          {/* The robot peeks over the card's top edge once per open (not on the full-height side panel). */}
          {!side ? (
            <span className="ask-pk" aria-hidden="true">
              <VisorCharacter variant="peek" />
            </span>
          ) : null}
          <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', !side && 'rounded-md')}>
            <Header onClose={close} size={size} setSize={setSize} />
            <Body compactHome />
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  );
}
