'use client';

/**
 * The journey node panel: a right side sheet (a bottom sheet with a grab handle below 640px) with
 * the node's status, owner, dates, SRN, a plain-words line, the checklist of its leaves and the
 * project lead. A leaf with a checklist step links to the step page, and a phase-backed group
 * links to its phase page. Esc, the X button or the backdrop closes it, Tab stays inside it, and
 * focus goes back to whatever opened it.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { StepMark } from '@/components/ui/step-track';
import { phaseHref, stepHref } from '@/components/client-portal/routes';
import { Avatar, Bar } from '../../incorporation/spectrum';
import { dShort } from '../derive';
import type { JNode, JStatus } from './journey-model';
import { STATUS_BAR, STATUS_CHIP, STATUS_WORD, leavesOf, markOf, pctOf, useNarrow } from './status';

const BLURB: Record<JStatus, string> = {
  done: 'This is finished. Nothing more is needed from you.',
  active: 'We are working on this now. We will tell you if we need anything.',
  waiting: 'This is waiting on you. Open the step to see what to do.',
  late: 'This is past its due date. Open the step to see what is holding it up.',
  up: 'This has not started yet. We will tell you when we need anything.',
};

function Meta({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
      <span className={mono ? 'font-mono text-[13px] text-ink' : 'text-[13.5px] text-ink'}>{children}</span>
    </div>
  );
}

/** What the client owes on this step, when the "Your next step" banner opened the panel. */
export interface PanelNeed {
  title: string;
  sub: string;
  note?: string;
  cta: string;
  onAct: () => void;
}

export function NodePanel({
  node,
  need,
  onClose,
  go,
  lead,
  reduce = false,
}: {
  node: JNode | null;
  need?: PanelNeed;
  onClose: () => void;
  /** Portal navigation (`h.portal.go`). */
  go: (href: string) => void;
  /** The project lead's name, shown at the foot of the panel. */
  lead?: string;
  reduce?: boolean;
}) {
  const narrow = useNarrow();
  // Drawn into the portal root (like PortalModal), above the top bar and the page's stacking contexts.
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector('.cp') ?? document.body), []);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const isOpen = node != null;

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]');
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen, onClose]);

  const leaves = node ? leavesOf(node) : [];
  // A done leaf's note only repeats its done date, which the Done fact already shows.
  const note = node && !(node.status === 'done' && node.doneOn) ? node.note : undefined;
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 36 };
  const off = narrow ? { y: '100%', x: 0 } : { x: 24, y: 0 };
  const pageHref = node?.stepId ? stepHref(node.stepId) : node?.phaseNo != null ? phaseHref(node.phaseNo) : undefined;

  if (!host) return null;
  return createPortal(
    <div className="cp-tw">
      <AnimatePresence>
        {node ? (
          <div className="fixed inset-0 z-[2147482000]" key="journey-panel">
            <m.button
              type="button"
              aria-label="Close panel"
              tabIndex={-1}
              className="absolute inset-0 bg-scrim"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            />
            <m.aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="journey-panel-title"
              data-testid="journey-panel"
              className="absolute flex flex-col overflow-hidden bg-surface-raised shadow-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[86vh] max-sm:rounded-t-[18px] max-sm:border-t max-sm:border-line sm:inset-y-0 sm:right-0 sm:w-[420px] sm:border-l sm:border-line"
              initial={{ opacity: 0, ...off }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, ...off }}
              transition={t}
            >
              <span className="mx-auto mt-2 block h-1 w-10 flex-none rounded-full bg-line-strong sm:hidden" aria-hidden />
              <header className="flex items-start gap-3 border-b border-line px-5 py-4">
                <div className="grid min-w-0 flex-1 gap-2">
                  <h2 id="journey-panel-title" className="text-[16px] font-semibold leading-snug text-ink">
                    {node.label}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={STATUS_CHIP[node.status]} raw>
                      {STATUS_WORD[node.status]}
                    </Chip>
                    {node.owner ? <OwnerChip owner={node.owner} label={node.owner === 'client' ? 'You' : undefined} /> : null}
                  </div>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-8 w-8 flex-none place-items-center rounded-md text-ink-muted hover:bg-surface-sunken hover:text-ink"
                >
                  <X size={18} />
                </button>
              </header>
              <div className="grid gap-5 overflow-y-auto px-5 py-4">
                {need ? (
                  <div className="grid gap-2 rounded-[12px] border border-waiting-mid/40 bg-waiting-soft px-3 py-3" data-testid="journey-need">
                    <span className="text-[11.5px] font-medium uppercase tracking-wider text-waiting">Needed from you</span>
                    <b className="text-[14px] font-semibold text-ink">{need.title}</b>
                    {need.sub ? <span className="text-[13px] text-ink-2">{need.sub}</span> : null}
                    {need.note ? <span className="text-[13px] text-ink-2">{need.note}</span> : null}
                    <Button size="sm" className="justify-self-start" onClick={need.onAct}>
                      {need.cta}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[13.5px] leading-relaxed text-ink-2">{BLURB[node.status]}</p>
                )}
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between text-[12.5px] text-ink-muted">
                    <span>Progress</span>
                    <span className="tabular-nums">
                      {node.done} of {node.total} · {pctOf(node)}%
                    </span>
                  </div>
                  <Bar pct={pctOf(node)} tone={STATUS_BAR[node.status]} />
                </div>
                {node.due || node.doneOn || node.srn || note ? (
                  <div className="grid grid-cols-2 gap-4">
                    {node.due && node.status !== 'done' ? <Meta label="Due">{dShort(node.due)}</Meta> : null}
                    {node.doneOn ? <Meta label="Done">{dShort(node.doneOn)}</Meta> : null}
                    {node.srn ? (
                      <Meta label="SRN" mono>
                        {node.srn}
                      </Meta>
                    ) : null}
                    {note ? (
                      <div className="col-span-2">
                        <Meta label="Note">{note}</Meta>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">{node.children.length ? 'Checklist' : 'Step'}</span>
                  <ul className="overflow-hidden rounded-md border border-line" data-testid="journey-checklist">
                    {leaves.map((l) => {
                      const mk = markOf(l.status);
                      return (
                        <li key={l.id} className="flex items-center gap-3 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                          <StepMark state={mk.state} tone={mk.tone} size={18} />
                          <div className="grid min-w-0 flex-1">
                            <span className="truncate text-[13.5px] text-ink" title={l.label}>
                              {l.n != null ? <span className="mr-1.5 font-mono text-[12px] text-ink-muted">{l.n}</span> : null}
                              {l.label}
                            </span>
                            {l.note || (l.srn && l !== node) ? (
                              <span className="truncate text-[12px] text-ink-muted">
                                {l.note}
                                {l.srn && l !== node ? <span className="font-mono"> · SRN {l.srn}</span> : null}
                              </span>
                            ) : null}
                          </div>
                          {l.stepId && l !== node ? (
                            <button
                              type="button"
                              onClick={() => go(stepHref(l.stepId!))}
                              className="flex-none whitespace-nowrap text-[12.5px] font-medium text-brand-text hover:underline"
                            >
                              Open step
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {lead ? (
                  <div className="flex items-center gap-3 rounded-md bg-surface-sunken px-3 py-2.5">
                    <Avatar name={lead} size={30} />
                    <div className="grid min-w-0">
                      <span className="truncate text-[13.5px] font-medium text-ink">{lead}</span>
                      <span className="text-[12px] text-ink-muted">Your project lead</span>
                    </div>
                  </div>
                ) : null}
                {pageHref ? (
                  <button type="button" onClick={() => go(pageHref)} className="justify-self-start text-[13.5px] font-medium text-brand-text hover:underline">
                    {node.stepId ? 'Open step page →' : 'Open phase page →'}
                  </button>
                ) : null}
              </div>
            </m.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </div>,
    host,
  );
}
