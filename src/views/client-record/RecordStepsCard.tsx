'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { ChecklistItem } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import { Button } from '@/components/ui/button';
import { ChecklistPhaseStepRow } from '@/components/incorporation/ChecklistPhaseStepRow';
import { InternPhaseTabs } from '@/components/incorporation/InternOverviewProgress';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { getStepGate, type ChecklistStepGate } from '@/lib/checklist/checklist-step-gate';
import { buildIncorporationModel } from '@/lib/client-portal/step-model';
import {
  internOverviewNow,
  internOverviewPhases,
  internPhaseStepCounts,
} from '@/lib/intern/intern-overview-progress';
import { recordStepPlace } from '@/views/client-record/RecordHeadParts';
import { StepAboutPanel } from '@/views/client-record/StepAboutPanel';

/** The record's names for the four phases (prototype `PHASE_LABEL`); the timeline card uses the same words. */
const PHASE_LABEL: Record<string, string> = {
  'pre-inc-phase-1': 'Name application',
  'pre-inc-phase-2': 'Incorporation',
  'post-inc-phase-3': 'Post-incorporation',
  'registration-phase-4': 'Registrations',
};

/**
 * STEPS CARD of a staff client record (prototype `ClientRecordScreen` "Steps" card with
 * `PhaseTrack` and `StepList`). One card for the lead, the manager and the admin: the ST5 phase
 * track picks a phase in place, the card lists its steps with dates, holder, lead and status, and
 * "What's this?" opens the step's Ask VCFO panel.
 *
 * `gates` decide the marks and are the viewer's own (a lead's are the intern gates; a manager or
 * admin reads with the client gates, so nothing here edits). `hrefFor` is the role's step route.
 * The registrations phase adds a line with the count and "Open registrations" over its list.
 */
export function RecordStepsCard({
  engagement,
  state,
  gates,
  hrefFor,
  onOpen,
  leadName,
  onOpenRegistrations,
}: {
  engagement: Engagement;
  state: Record<string, ChecklistItemStateSlice | undefined>;
  gates: Record<string, ChecklistStepGate>;
  hrefFor: (item: ChecklistItem) => string;
  /** Opens a step (the row click). */
  onOpen: (item: ChecklistItem) => void;
  leadName?: string | null;
  onOpenRegistrations?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const phases = useMemo(() => internOverviewPhases(), []);
  const model = useMemo(() => buildIncorporationModel(state, engagement.schedule ?? null, today), [state, engagement.schedule, today]);
  const now = useMemo(() => internOverviewNow(gates), [gates]);
  const [about, setAbout] = useState<{ id: string; label: string } | null>(null);

  const openPhase = useSearchParams().get('phase');
  // Steps are numbered across the phases; a registration is "Reg-n" (prototype `PHASE_RANGE`).
  let counted = 0;
  const tabs = phases.map((phase) => {
    const { done, total } = internPhaseStepCounts(phase.items, gates);
    const range = phase.id === 'registration-phase-4' ? `Reg-1–${total}` : `Steps ${counted + 1}–${counted + total}`;
    counted += total;
    return { id: phase.id, title: phase.title, label: PHASE_LABEL[phase.id], done, total, range: total ? range : undefined };
  });
  const nowPlace = now ? recordStepPlace(now.item.id) : null;
  const totalDone = tabs.reduce((n, t) => n + t.done, 0);
  const total = tabs.reduce((n, t) => n + t.total, 0);

  const row = (it: ChecklistItem, index: number, count: number, above?: ChecklistItem) => (
    <ChecklistPhaseStepRow
      key={it.id}
      item={it}
      gate={getStepGate(gates, it.id)}
      engagement={engagement}
      onOpen={onOpen}
      stepLabel={recordStepPlace(it.id)?.code}
      facts={model.byId[it.id]}
      leadName={leadName}
      onAbout={(item) => setAbout({ id: item.id, label: recordStepPlace(item.id)?.code ?? `Step ${index + 1}` })}
      connector={index < count - 1}
      connectorAbove={above ? (getStepGate(gates, above.id).kind === 'done' ? 'done' : 'todo') : undefined}
      today={today}
    />
  );

  return (
    <>
      <InternPhaseTabs
        engagementId={engagement.id}
        currentPhaseId={now?.phaseId ?? null}
        phases={tabs}
        openPhaseId={openPhase ? tabs[Number(openPhase) - 1]?.id : null}
        headMeta={`${totalDone} of ${total} tasks${nowPlace && !nowPlace.registration ? ` · ${nowPlace.code} of ${nowPlace.of}` : ''}`}
        headAction={
          now ? (
            <Link href={hrefFor(now.item)} className="shrink-0 text-[13px] font-medium text-brand-text hover:underline">
              Open current step ›
            </Link>
          ) : null
        }
      >
        {(phaseId) => {
          const phase = phases.find((group) => group.id === phaseId);
          if (!phase) return null;
          if (phase.id === 'registration-phase-4') {
            const counts = tabs.find((t) => t.id === phase.id);
            const live = phase.items.find((it) => {
              const kind = getStepGate(gates, it.id).kind;
              return kind === 'active' || kind === 'waiting';
            });
            return (
              <>
                <div className="flex flex-wrap items-center gap-3 py-1 text-[14px]">
                  <span className="min-w-0 flex-1">
                    <b className="font-medium tabular-nums">{counts?.done ?? 0}</b>
                    <span className="text-ink-muted"> of {counts?.total ?? phase.items.length} registrations</span>
                    {live ? (
                      <>
                        <span className="text-ink-muted"> · now </span>
                        <span className="font-mono text-[13px]">{recordStepPlace(live.id)?.code}</span> {live.title}
                      </>
                    ) : null}
                  </span>
                  {onOpenRegistrations ? (
                    <Button size="sm" variant="outline" onClick={onOpenRegistrations}>
                      Open registrations
                      <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
                    </Button>
                  ) : null}
                </div>
              </>
            );
          }
          return <div className="flex flex-col">{phase.items.map((it, i) => row(it, i, phase.items.length, phase.items[i - 1]))}</div>;
        }}
      </InternPhaseTabs>
      <StepAboutPanel
        stepId={about?.id ?? null}
        stepLabel={about?.label}
        engagementId={engagement.id}
        onClose={() => setAbout(null)}
      />
    </>
  );
}
