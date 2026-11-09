'use client';

// Draft, not wired in. Owner approval pending; see docs/specs/client-journey-map/PLAN.md.

/**
 * The client journey map card for the top of the client home page: a tracker bar for a
 * ten-second glance (Incorporation, Post-incorporation, Registration, Compliance), then a detail
 * view of the selected stop as an expandable tree or a metro map, and a side panel for the
 * clicked node. The tree is loaded on demand (`next/dynamic`, no SSR) so the home page stays
 * light. Every animation is off under reduced motion.
 */
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Avatar, SCard } from '../../incorporation/spectrum';
import type { HomeData } from '../useHome';
import { buildJourney, type JNode, type JStop } from './journey-model';
import { TrackerBar } from './TrackerBar';
import { JourneyMetro } from './JourneyMetro';
import { NodePanel } from './NodePanel';
import { Celebrate } from './Celebrate';
import { STATUS_WORD } from './status';

const JourneyTree = dynamic(() => import('./JourneyTree').then((mod) => mod.JourneyTree), {
  ssr: false,
  loading: () => <span className="block h-[380px] animate-pulse rounded-md bg-surface-sunken" aria-hidden />,
});

type ViewKind = 'tree' | 'metro';

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

export function JourneyMap({ h }: { h: HomeData }) {
  const reduce = useReducedMotion() ?? false;
  const journey = useMemo(
    () => buildJourney({ model: h.model, regs: h.regs, filings: h.filings, today: h.today }),
    [h.model, h.regs, h.filings, h.today],
  );
  const [view, setView] = useState<ViewKind>('tree');
  const [stopId, setStopId] = useState<JStop['id']>(journey.currentStopId);
  const [selected, setSelected] = useState<JNode | null>(null);
  const close = useCallback(() => setSelected(null), []);

  const stop = journey.stops.find((s) => s.id === stopId) ?? journey.stops[0]!;
  const current = journey.stops.find((s) => s.id === journey.currentStopId) ?? stop;
  const leafId = journey.currentPath[journey.currentPath.length - 1];
  const leaf = leafId ? journey.byId[leafId] : undefined;
  const allDone = journey.stops.every((s) => s.status === 'done');
  const status = allDone
    ? 'Everything is done'
    : `Now: ${current.label} · ${current.done} of ${current.total} · ${leaf && leaf.id !== current.id ? leaf.label : STATUS_WORD[current.status]}`;

  const treeRoot = journey.byId[stop.rootId];
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
      {view === 'tree' && treeRoot ? (
        <JourneyTree
          key={`${stop.id}:${treeRoot.id}`}
          root={treeRoot}
          currentPath={journey.currentPath}
          open={[stop.id]}
          storageKey={`journey-tree:${engagement}:${treeRoot.id}`}
          onSelect={setSelected}
          reduce={reduce}
        />
      ) : null}
      {view === 'metro' && stopNode ? <JourneyMetro node={stopNode} currentPath={journey.currentPath} onSelect={setSelected} reduce={reduce} /> : null}
      <NodePanel node={selected} onClose={close} go={h.portal.go} reduce={reduce} />
    </SCard>
  );
}
