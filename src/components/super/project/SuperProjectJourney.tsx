'use client';

import { useMemo, useState } from 'react';
import { DashSection } from '@/components/dash/DashSection';
import { PhaseRows, type Phase, type PhaseStep } from '@/components/dash/phase-rows';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { PhaseBar } from '@/components/ui/step-track';
import { getActiveCatalogItems, getChecklistStepTimelineLabel } from '@/data/checklist';
import { PHASE_NAMES, phaseCodes, superPhaseTrack } from '@/components/super/overview/super-overview-format';
import { shortCompany } from '@/components/super/parts/super-text';
import type { SuperEngagementDetail, SuperJourneyStep } from '@/lib/super/super-overview';
import { StepAboutPanel } from '@/views/client-record/StepAboutPanel';
import { cn } from '@/lib/utils';

/**
 * The whole journey for one engagement, as the firm sees it (ST5, rule R-22).
 *
 * The phase track sits on top: four bars sized by step count, done green, the current phase
 * blurple with a soft ring, the name above and the count and step codes below. Under it, one
 * row per phase with its bar and status; the live phase opens by default and each opens to a
 * table of #, Step, Owner, Status and Typical time (`PhaseRows`). Every state comes from the same
 * `gateActiveCatalog` result the wizard uses; a locked step stays locked. "What's this?" opens
 * the step's About panel (P-095, the staff `StepAboutPanel`).
 */
export function SuperProjectJourney({ detail }: { detail: SuperEngagementDetail }) {
  const { progress } = detail.summary;
  const track = superPhaseTrack(detail.summary);
  const liveIndex = detail.summary.currentStep ? detail.journey.findIndex((step) => step.id === detail.summary.currentStep?.id) : -1;
  const live = liveIndex >= 0 ? detail.journey[liveIndex] : undefined;
  const [about, setAbout] = useState<{ id: string; label: string } | null>(null);
  const phases = useMemo(() => phaseRows(detail), [detail]);

  return (
    <DashSection
      title="Steps"
      meta={liveIndex >= 0 ? `${progress.done} of ${progress.total} steps · Step ${liveIndex + 1} of ${detail.journey.length}` : `${progress.done} of ${progress.total} steps`}
      href={live?.href}
      hrefLabel={live ? 'Open current step' : undefined}
      flush
    >
      <PhaseTrack done={track.done} totals={track.totals} />
      <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3 sm:hidden">
        <PhaseBar done={track.done} totals={track.totals} names={PHASE_NAMES} className="flex-1" />
        <span className="text-[12.5px] tabular-nums text-ink-muted">
          {progress.done}/{progress.total}
        </span>
      </div>
      <PhaseRows
        phases={phases}
        openId={live?.phaseId}
        onAbout={(n) => {
          const step = detail.journey[n - 1];
          if (step) setAbout({ id: step.id, label: `Step ${n}` });
        }}
      />
      <StepAboutPanel
        stepId={about?.id ?? null}
        stepLabel={about?.label}
        engagementId={detail.summary.id}
        onClose={() => setAbout(null)}
      />
    </DashSection>
  );
}

/** ST5 (a): the four parts by name, each bar sized by its step count, with the count and codes under it. */
function PhaseTrack({ done: doneByPhase, totals }: { done: number[]; totals: number[] }) {
  const current = totals.findIndex((t, i) => (doneByPhase[i] ?? 0) < t);
  const codes = phaseCodes(totals);
  return (
    <ol className="hidden gap-2 border-b border-line-soft px-4 py-4 sm:flex md:px-5" aria-label="Phases">
      {totals.map((total, i) => {
        const done = doneByPhase[i] ?? 0;
        const state = done >= total ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={PHASE_NAMES[i] ?? i} className="flex min-w-0 flex-col gap-[7px]" style={{ flex: `${Math.max(total, 1)} 1 0` }}>
            <span className={cn('truncate text-[13px] font-medium', state === 'next' ? 'text-ink-muted' : 'text-ink')}>{PHASE_NAMES[i]}</span>
            <span className={cn('relative h-2.5 overflow-hidden rounded-bar bg-surface-sunken', state === 'now' && 'ring-[1.5px] ring-brand-line')}>
              <i
                className={cn('absolute inset-y-0 left-0 rounded-bar', state === 'done' ? 'bg-positive-mid' : 'bg-brand')}
                style={{ width: done ? `max(${(done / Math.max(total, 1)) * 100}%, 6px)` : 0 }}
              />
            </span>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={cn('text-[12px] font-medium tabular-nums', state === 'done' ? 'text-positive' : state === 'now' ? 'text-brand-text' : 'text-ink-muted')}>
                {done}/{total}
              </span>
              <span className={cn('hidden truncate font-mono text-[11.5px] sm:inline', state === 'next' ? 'text-ink-faint' : 'text-ink-muted')}>{codes[i]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function statusOf(step: SuperJourneyStep): { word: string; tone: ChipTone } {
  if (step.status === 'not-applicable') return { word: 'Not needed', tone: 'idle' };
  if (step.rejected) return { word: 'Sent back', tone: 'bad' };
  if (step.awaitingReview) return { word: 'Waiting', tone: 'teal' };
  if (step.kind === 'done') return { word: 'Done', tone: 'ok' };
  if (step.kind === 'waiting') return { word: 'Waiting', tone: 'teal' };
  if (step.kind === 'active') return { word: 'In progress', tone: 'prog' };
  return { word: 'Not started', tone: 'idle' };
}

function phaseRows(detail: SuperEngagementDetail): Phase[] {
  const items = new Map(getActiveCatalogItems().map((item) => [item.id, item]));
  const shortName = shortCompany(detail.summary.companyName);
  const groups: { phaseId: string; steps: Array<{ step: SuperJourneyStep; n: number }> }[] = [];
  detail.journey.forEach((step, i) => {
    let group = groups.find((entry) => entry.phaseId === step.phaseId);
    if (!group) {
      group = { phaseId: step.phaseId, steps: [] };
      groups.push(group);
    }
    group.steps.push({ step, n: i + 1 });
  });
  return groups.map((group, i): Phase => {
    const done = group.steps.filter(({ step }) => step.kind === 'done').length;
    const total = group.steps.length;
    const started = group.steps.some(({ step }) => step.kind === 'active' || step.kind === 'waiting');
    const status = done === total ? 'Done' : started || done > 0 ? 'In progress' : 'Not started';
    const name = PHASE_NAMES[i] ?? group.phaseId;
    return {
      id: group.phaseId,
      name: i < 3 ? `Phase ${i + 1} · ${name}` : name,
      done,
      total,
      status,
      tone: status === 'Done' ? 'ok' : status === 'In progress' ? 'prog' : 'idle',
      steps: group.steps.map(({ step, n }): PhaseStep => {
        const chip = statusOf(step);
        const item = items.get(step.id);
        const owner = step.awaitingReview ? 'manager' : step.owner === 'client' ? 'client' : 'sbc';
        return {
          n,
          title: step.title,
          owner,
          ownerLabel: owner === 'client' ? shortName : undefined,
          status: chip.word,
          tone: chip.tone,
          time: item ? getChecklistStepTimelineLabel(item) : undefined,
          href: step.href,
        };
      }),
    };
  });
}
