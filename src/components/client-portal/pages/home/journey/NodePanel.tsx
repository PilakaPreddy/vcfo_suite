'use client';

/**
 * The journey node panel: a right side sheet (a bottom sheet below 640px) with the node's status,
 * owner, dates, note and the checklist of its leaves. A leaf with a checklist step links to the
 * step page. Esc, the X button or the backdrop closes it.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { Chip, OwnerChip } from '@/components/ui/spectrum-chip';
import { StepMark } from '@/components/ui/step-track';
import { stepHref } from '@/components/client-portal/routes';
import { Bar } from '../../incorporation/spectrum';
import { dShort } from '../derive';
import type { JNode } from './journey-model';
import { STATUS_BAR, STATUS_CHIP, STATUS_WORD, leavesOf, markOf, pctOf } from './status';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="text-[13.5px] text-ink">{children}</span>
    </div>
  );
}

export function NodePanel({
  node,
  onClose,
  go,
  reduce = false,
}: {
  node: JNode | null;
  onClose: () => void;
  /** Portal navigation (`h.portal.go`). */
  go: (href: string) => void;
  reduce?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!node) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [node, onClose]);

  const leaves = node ? leavesOf(node) : [];
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 380, damping: 36 };

  return (
    <AnimatePresence>
      {node ? (
        <div className="fixed inset-0 z-50" key="journey-panel">
          <m.button
            type="button"
            aria-label="Close panel"
            className="absolute inset-0 bg-ink/30"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
          />
          <m.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="journey-panel-title"
            className="absolute flex flex-col overflow-hidden bg-surface-raised shadow-xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[85vh] max-sm:rounded-t-xl sm:inset-y-0 sm:right-0 sm:w-[420px] sm:border-l sm:border-line"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={t}
          >
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
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between text-[12.5px] text-ink-muted">
                  <span>Progress</span>
                  <span className="tabular-nums">
                    {node.done} of {node.total} · {pctOf(node)}%
                  </span>
                </div>
                <Bar pct={pctOf(node)} tone={STATUS_BAR[node.status]} />
              </div>
              {node.due || node.doneOn || node.note ? (
                <div className="grid grid-cols-2 gap-4">
                  {node.due ? <Meta label="Due">{dShort(node.due)}</Meta> : null}
                  {node.doneOn ? <Meta label="Done">{dShort(node.doneOn)}</Meta> : null}
                  {node.note ? (
                    <div className="col-span-2">
                      <Meta label="Note">{node.note}</Meta>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-2">
                <span className="text-[11.5px] font-medium uppercase tracking-wider text-ink-muted">{node.children.length ? 'Checklist' : 'Step'}</span>
                <ul className="overflow-hidden rounded-md border border-line">
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
                          {l.note ? <span className="truncate text-[12px] text-ink-muted">{l.note}</span> : null}
                        </div>
                        {l.stepId ? (
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
            </div>
          </m.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
