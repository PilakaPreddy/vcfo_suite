'use client';

import { Bot } from 'lucide-react';

import { Tag } from '@/components/ui/spectrum-chip';
import { cn } from '@/lib/utils';
import { ASSIST_STATUS_LABEL, assistHintForStep } from './agent-hint';

/**
 * "Agent available" — a small card on the staff step page when a VCFO Assist sub-agent can fill
 * this step's portal form (docs/specs/vcfo-assist-agents/PLAN.md). Staff only: the step page
 * renders it outside the client route. Renders nothing for a step no agent covers.
 */
export function AssistAgentHint({ stepId, className }: { stepId: string; className?: string }) {
  const hint = assistHintForStep(stepId);
  if (!hint) return null;
  const { lead, others, status } = hint;
  return (
    <section
      aria-label="VCFO Assist agent"
      className={cn('surface mb-3.5 flex items-start gap-3 px-3.5 py-3 text-[13px]', className)}
    >
      <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-brand-soft text-brand-text" aria-hidden>
        <Bot className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink">VCFO Assist can fill {lead.title} on the portal</p>
          <Tag tone={status === 'later' ? 'idle' : 'prog'}>{ASSIST_STATUS_LABEL[status]}</Tag>
        </div>
        <p className="mt-0.5 text-ink-muted">
          {lead.form}
          {others.length ? `, with ${others.map((s) => s.form).join(', ')}` : ''}. Open the VCFO Assist side panel in Chrome next to
          the portal.
        </p>
      </div>
    </section>
  );
}
