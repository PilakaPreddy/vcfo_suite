'use client';

/**
 * The client journey map card for the top of the client home page: a tracker bar for a
 * ten-second glance (Incorporation, Post-incorporation, Registration, Compliance), a "Your next
 * step" banner (the first thing the client owes, else the current step) that opens the panel, then
 * a detail view of the selected stop as an expandable tree or a metro map, and a side panel for
 * the clicked node. See docs/specs/client-journey-map/PLAN.md. The tree is loaded on demand (`next/dynamic`, no SSR) so the home page stays
 * light. Every animation is off under reduced motion.
 */
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { Footprints, PencilLine, RotateCcw, Signature, Upload, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { Avatar, SCard } from '../../incorporation/spectrum';
import type { HomeData } from '../useHome';
import { dShort, sortNeeds, type NeedRow } from '../derive';
import { stepHref } from '@/components/client-portal/routes';
import { buildJourney, type JNode, type JStop } from './journey-model';
import { TrackerBar } from './TrackerBar';
import { JourneyMetro } from './JourneyMetro';
import { NodePanel, type PanelNeed } from './NodePanel';
import { Celebrate } from './Celebrate';
import { STATUS_WORD } from './status';

const JourneyTree = dynamic(() => import('./JourneyTree').then((mod) => mod.JourneyTree), {
  ssr: false,
  loading: () => <span className="block h-[481px] rounded-md bg-surface-sunken motion-safe:animate-pulse" aria-hidden />,
});

type ViewKind = 'tree' | 'metro';

const EMPTY_STOP: Record<JStop['id'], string> = {
  pre: 'Incorporation has no steps yet.',
  post: 'Post-incorporation starts once the company is incorporated.',
  reg: 'Registrations start once the company is incorporated.',
  comp: 'Compliance starts once the company is incorporated. Your filings will show here.',
};
const NEED_ACT = { upload: 'Upload now', fill: 'Fill it in', correct: 'Correct it', sign: 'Sign it' } as const;
const NEED_CTA = { upload: 'See what to upload', fill: 'See what to fill in', correct: 'See what to correct', sign: 'See what to sign' } as const;
/** The banner icon for each kind of need; the firm's own next step uses Footprints. */
const NEED_ICON: Record<NeedRow['kind'], LucideIcon> = { upload: Upload, fill: PencilLine, correct: RotateCcw, sign: Signature };

/** The banner under the tracker: what the client owes first, else the step the firm is on. */
function NextStep({
  title,
  sub,
  cta,
  waiting,
  kind,
  onOpen,
}: {
  title: string;
  sub: string;
  cta: string;
  waiting: boolean;
  /** The kind of need, which picks the icon; none for the firm's own next step. */
  kind?: NeedRow['kind'];
  onOpen: () => void;
}) {
  const Icon = kind ? NEED_ICON[kind] : Footprints;
  return (
    <div
      data-testid="journey-next"
      data-kind={kind ?? 'firm'}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] border px-3 py-2.5',
        waiting ? 'border-waiting-mid/40 bg-waiting-soft' : 'border-brand-line bg-brand-soft/60',
      )}
    >
      <span className={cn('grid h-8 w-8 flex-none place-items-center rounded-full bg-surface-raised', waiting ? 'text-waiting' : 'text-brand-text')} aria-hidden>
        <Icon size={17} />
      </span>
      <div className="grid min-w-0 flex-[1_1_200px]">
        <b className="text-[14px] font-semibold text-ink">{title}</b>
        {sub ? <span className="text-[13px] text-ink-2">{sub}</span> : null}
      </div>
      <Button size="sm" variant={waiting ? 'default' : 'secondary'} onClick={onOpen}>
        {cta}
      </Button>
    </div>
  );
}

function Toggle({ view, onView }: { view: ViewKind; onView: (v: ViewKind) => void }) {
  const opt = (v: ViewKind, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => onView(v)}
      className={cn(
        'h-7 rounded-[4px] px-2.5 text-[12.5px] font-medium',
        view === v ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
      )}
    >
      {label}
    </button>
  );
  return (
    <span className="inline-flex gap-0.5 rounded-md bg-surface-sunken p-0.5" role="group" aria-label="Journey view">
      {opt('tree', 'Tree')}
      {opt('metro', 'Metro')}
    </span>
  );
}

export function JourneyMap({ h, onNeed }: { h: HomeData; /** Acts on a need (the home page's upload dialog or its link). */ onNeed?: (n: NeedRow) => void }) {
  const reduce = useReducedMotion() ?? false;
  const journey = useMemo(
    () => buildJourney({ model: h.model, regs: h.regs, filings: h.filings, today: h.today }),
    [h.model, h.regs, h.filings, h.today],
  );
  const [view, setView] = useState<ViewKind>('tree');
  const [stopId, setStopId] = useState<JStop['id']>(journey.currentStopId);
  const [selected, setSelected] = useState<JNode | null>(null);
  /** Set when the banner opened the panel: the need shows on top of the step. */
  const [panelNeed, setPanelNeed] = useState<NeedRow | null>(null);
  const close = useCallback(() => {
    setSelected(null);
    setPanelNeed(null);
  }, []);
  const select = useCallback((n: JNode) => {
    setPanelNeed(null);
    setSelected(n);
  }, []);

  const stop = journey.stops.find((s) => s.id === stopId) ?? journey.stops[0]!;
  const current = journey.stops.find((s) => s.id === journey.currentStopId) ?? stop;
  const leafId = journey.currentPath[journey.currentPath.length - 1];
  const leaf = leafId ? journey.byId[leafId] : undefined;
  const allDone = journey.stops.every((s) => s.status === 'done');
  const status = allDone
    ? 'Everything is done'
    : `Now: ${current.label} · ${current.done} of ${current.total} · ${leaf && leaf.id !== current.id ? leaf.label : STATUS_WORD[current.status]}`;

  // "Your next step": the first need (sorted the way the Needs card sorts them), else the current leaf.
  const need = sortNeeds(h.needs, h.today)[0];
  const needNode = need?.stepId ? journey.byId[need.stepId] : undefined;
  const next = need
    ? {
        title: `Your next step: ${need.title}`,
        sub: [need.sub !== need.title ? need.sub : '', need.due ? `Due ${dShort(need.due)}` : ''].filter(Boolean).join(' · '),
        cta: NEED_CTA[need.kind],
        waiting: true,
        kind: need.kind,
        node: needNode ?? leaf,
        href: needNode ? undefined : need.href,
      }
    : leaf && !allDone
      ? {
          title: `Next: ${leaf.label}`,
          sub: [leaf.note, 'nothing is needed from you right now'].filter(Boolean).join(' · '),
          cta: 'See details',
          waiting: false,
          kind: undefined,
          node: leaf,
          href: undefined,
        }
      : null;
  const openNext = () => {
    if (!next) return;
    if (next.node) {
      setSelected(next.node);
      setPanelNeed(need ?? null);
    } else if (next.href) h.portal.go(next.href);
  };
  const actOnNeed = (n: NeedRow) => {
    close();
    if (onNeed && (n.requestId || n.href)) onNeed(n);
    else if (n.href) h.portal.go(n.href);
    else if (n.stepId) h.portal.go(stepHref(n.stepId));
  };
  const needBox: PanelNeed | undefined = panelNeed
    ? {
        title: panelNeed.title,
        sub: [panelNeed.sub !== panelNeed.title ? panelNeed.sub : '', panelNeed.due ? `Due ${dShort(panelNeed.due)}` : ''].filter(Boolean).join(' · '),
        note: panelNeed.note,
        cta: NEED_ACT[panelNeed.kind],
        onAct: () => actOnNeed(panelNeed),
      }
    : undefined;

  // The tree starts at the selected stop itself, so its counts match the tracker.
  const stopNode = journey.byId[stop.id];
  const engagement = h.engagementId ?? 'me';

  return (
    <SCard
      title="Your journey"
      meta={<span className="truncate text-[13px] text-ink-muted">{status}</span>}
      right={
        <span className="flex items-center gap-3">
          {h.lead ? (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2 max-sm:hidden">
              <Avatar name={h.lead} />
              <span className="truncate">Lead: {h.lead}</span>
            </span>
          ) : null}
          <Toggle view={view} onView={setView} />
        </span>
      }
      bodyClassName="relative grid gap-4"
    >
      <Celebrate engagementId={h.engagementId} stops={journey.stops} reduce={reduce} />
      <TrackerBar stops={journey.stops} currentStopId={journey.currentStopId} selected={stop.id} onSelect={setStopId} reduce={reduce} />
      {next ? <NextStep title={next.title} sub={next.sub} cta={next.cta} waiting={next.waiting} kind={next.kind} onOpen={openNext} /> : null}
      {stop.total === 0 ? (
        <EmptyState title={EMPTY_STOP[stop.id]} />
      ) : view === 'tree' && stopNode ? (
        <JourneyTree
          key={stop.id}
          root={stopNode}
          currentPath={journey.currentPath}
          open={[stop.id]}
          storageKey={`journey-tree:${engagement}:${stop.id}`}
          onSelect={select}
          reduce={reduce}
        />
      ) : view === 'metro' && stopNode ? (
        <JourneyMetro node={stopNode} currentPath={journey.currentPath} onSelect={select} reduce={reduce} />
      ) : null}
      <NodePanel node={selected} need={needBox} onClose={close} go={h.portal.go} lead={h.lead} reduce={reduce} />
    </SCard>
  );
}
