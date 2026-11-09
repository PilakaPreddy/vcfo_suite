'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getItem, getChecklistStepTimelineLabel } from '@/data/checklist';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/spectrum-chip';
import { useAskOptional } from '@/components/ask/ask-context';
import { useAssistProfile } from '@/hooks/use-assist-profile';
import { ASSIST_PROFILE_STEP_IDS } from '@/lib/assist-profile/paths';
import { missingInputLabel } from '@/lib/doc-pack/unblock';
import { formLabel } from '@/lib/ui/form-label';

/**
 * "WHAT'S THIS?" PANEL on staff screens (prototype `AboutStepPanel`, D-053): a 420px side panel
 * titled "Ask VCFO" that says what the step is, the rule behind it and, on the two SPICe+ steps
 * VCFO Assist fills, what the Assist profile still lacks.
 *
 * Every line comes from real data: the step's own description, inputs, forms and admin notes in
 * `src/data/checklist.ts`, and the engagement's Assist profile (`/api/engagements/:id/assist-profile`).
 * The follow-up box shows only where the session may use Ask VCFO (admin and super admin, the
 * same rule as `canUseAsk`); it hands the question and the step to the Ask panel. Managers and
 * project leads have no Ask conversation, so they read the panel without the box.
 */
export function StepAboutPanel({
  stepId,
  stepLabel,
  engagementId,
  onClose,
}: {
  /** The open step, or null when the panel is closed. */
  stepId: string | null;
  /** "Step 4", shown in the panel head. */
  stepLabel?: string;
  engagementId: string;
  onClose: () => void;
}) {
  const item = stepId ? getItem(stepId) : undefined;
  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="flex w-full flex-col gap-0 border-l-1.5 border-line bg-surface-raised p-0 sm:max-w-[420px]"
      >
        {item ? (
          <StepAboutBody key={item.id} stepId={item.id} stepLabel={stepLabel} engagementId={engagementId} onClose={onClose} />
        ) : (
          <SheetTitle className="sr-only">Ask VCFO</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StepAboutBody({
  stepId,
  stepLabel,
  engagementId,
  onClose,
}: {
  stepId: string;
  stepLabel?: string;
  engagementId: string;
  onClose: () => void;
}) {
  const item = getItem(stepId)!;
  const ask = useAskOptional();
  const canAsk = Boolean(ask?.enabled && ask.shell && ask.shell !== 'client');
  const [question, setQuestion] = useState('');
  const assistStep = ASSIST_PROFILE_STEP_IDS.has(stepId);
  const profile = useAssistProfile(assistStep ? engagementId : null);
  const missing = profile.data?.missing ?? [];
  const missingInSuite = missing.filter((m) => !m.reason);
  const cannotSupply = missing.filter((m) => m.reason);
  const points = item.infoRequired.filter((p) => p.trim());
  const rule = getChecklistStepTimelineLabel(item);

  return (
    <>
      <div className="border-b border-line-soft px-5 pb-3 pt-4 pr-12">
        <SheetTitle className="text-[16px] font-medium leading-snug text-ink">Ask VCFO</SheetTitle>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          What&apos;s this?{stepLabel ? ` · ${stepLabel}` : ''}
        </p>
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-4 text-[13px]">
        <div className="grid gap-2.5 rounded-md border-1.5 border-line bg-surface-sunken p-3.5">
          <b className="font-medium text-ink">{item.title}</b>
          {item.description ? <p className="text-ink-2">{item.description}</p> : null}
          {points.length > 0 ? (
            <ul className="grid list-disc gap-1 pl-5 text-ink-2">
              {points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
            {item.forms.length > 0 ? <span className="font-mono text-[12px]">{item.forms.map(formLabel).join(' · ')}</span> : null}
            <a
              href="https://www.mca.gov.in"
              target="_blank"
              rel="noreferrer"
              title={rule}
              className="ml-auto inline-flex items-center gap-1 font-medium text-brand-text hover:underline"
            >
              MCA rule <ExternalLink size={13} strokeWidth={1.6} aria-hidden />
            </a>
          </div>
        </div>

        {assistStep || item.notes ? (
          <div className="grid gap-2">
            <h3 className="text-[12px] font-medium text-ink-muted">VCFO Assist profile</h3>
            {assistStep && profile.isPending ? <p className="text-ink-muted">Loading the profile…</p> : null}
            {assistStep && profile.isError ? <p className="text-danger">Could not load the profile.</p> : null}
            {missingInSuite.map((m) => (
              <div key={m.key} className="flex items-start gap-2">
                <Tag tone="bad" className="flex-none">
                  Missing in Suite
                </Tag>
                <span className="pt-0.5">{missingInputLabel(m)}</span>
              </div>
            ))}
            {cannotSupply.map((m) => (
              <div key={m.key} className="flex items-start gap-2">
                <Tag tone="idle" className="flex-none">
                  Suite cannot supply
                </Tag>
                <span className="pt-0.5" title={m.reason}>
                  {missingInputLabel(m)}
                </span>
              </div>
            ))}
            {assistStep && profile.isSuccess && missing.length === 0 ? (
              <p className="text-ink-muted">Suite holds every field Assist reads.</p>
            ) : null}
            {item.notes ? (
              <div className="flex items-start gap-2">
                <Tag tone="warn" className="flex-none">
                  Notes for the lead
                </Tag>
                <span className="pt-0.5">{item.notes}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {canAsk && ask ? (
        <form
          className="flex items-center gap-2 border-t border-line-soft px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const message = question.trim();
            if (!message) return;
            setQuestion('');
            onClose();
            ask.setOpen(true);
            void ask.ask({ message, context: { kind: 'step', ref: item.id, label: item.title } });
          }}
        >
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a follow-up" aria-label="Ask a follow-up" />
          <Button type="submit">Ask</Button>
        </form>
      ) : null}
    </>
  );
}
