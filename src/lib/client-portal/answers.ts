/**
 * Ask VCFO quick answers for the suggested questions in the portal chat
 * (prototype proto.js `QA`). Built from the client's real overview, so they
 * work whether or not the Ask VCFO model is switched on. Pure.
 */
import { sep } from '@/lib/date-format';
import type { ClientOverview } from '@/lib/client/client-overview';
import { getActiveCatalogItems, getIncorporationPhases } from '@/data/checklist';
import { titleWithPeriod } from '@/lib/compliance/period-title';

export const BEFORE_QUESTIONS = ['What is my next step?', 'Where is my incorporation now?', 'Which documents are missing?'] as const;
export const AFTER_QUESTIONS = ['What is due next?', 'Which registrations are pending?', 'When is FC-GPR due?'] as const;

export interface PortalAnswer {
  text: string;
  /** ok = answered (green antenna + hop) · nan = cannot answer (grey + dip, offer hand-off). */
  kind: 'ok' | 'nan';
}

function fmt(d: string | undefined): string {
  if (!d) return '';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return d;
  return sep(date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
}

function stepNumber(stepId: string): number | null {
  const idx = getActiveCatalogItems().findIndex((i) => i.id === stepId);
  return idx >= 0 ? idx + 1 : null;
}

export function portalAnswer(question: string, o: ClientOverview, now: Date = new Date()): PortalAnswer | null {
  const q = question.trim().toLowerCase();
  const company = o.engagement.companyName.replace(/\s+(India\s+)?(Private|Pvt\.?)\s+(Limited|Ltd\.?)$/i, '');

  if (q === 'what is my next step?') {
    const n = o.nextAction;
    if (!n) return { kind: 'ok', text: `Nothing is waiting for ${company} right now. Your VCFO team has the next move.` };
    const no = stepNumber(n.stepId);
    return {
      kind: 'ok',
      text: `${no ? `Step ${no} · ` : ''}${n.title} is waiting for ${company}.${n.needsCorrection ? ' It was sent back for a correction.' : ''}${n.windowLabel ? ` Window: ${n.windowLabel}.` : ''}`,
    };
  }

  if (q === 'where is my incorporation now?') {
    const phases = o.progress.byPhase;
    const current = phases.find((p) => p.done < p.total) ?? phases[phases.length - 1];
    const spice = phases.filter((p) => p.id === 'pre-inc-phase-1' || p.id === 'pre-inc-phase-2');
    const sd = spice.reduce((n, p) => n + p.done, 0);
    const st = spice.reduce((n, p) => n + p.total, 0);
    const pct = st ? Math.round((sd / st) * 100) : 0;
    if (!current) return null;
    return {
      kind: 'ok',
      text: `${company} is in ${current.label}: ${current.done} of ${current.total} steps done, ${sd} of ${st} SPICe+ steps overall (${pct}%).${o.incorporated && o.engagement.incorporationDate ? ` Incorporated on ${fmt(o.engagement.incorporationDate)}.` : ''}`,
    };
  }

  if (q === 'which documents are missing?') {
    const n = o.documents.counts.requested;
    if (!n) return { kind: 'ok', text: `No documents are missing. Everything asked of ${company} has been sent.` };
    return { kind: 'ok', text: `${n} step${n === 1 ? '' : 's'} still need${n === 1 ? 's' : ''} files or answers from ${company}. Open Documents to see each request.` };
  }

  if (q === 'what is due next?') {
    const up = o.compliance.upcoming.filter((c) => c.status !== 'filed' && c.status !== 'completed');
    if (!up.length) return { kind: 'ok', text: 'Nothing is due in the next 90 days.' };
    const [a, b] = up;
    return {
      kind: 'ok',
      text: `${titleWithPeriod(a!.title, a!.periodLabel)} is due ${fmt(a!.dueDate)}.${b ? ` Next is ${b.title} on ${fmt(b.dueDate)}.` : ''}`,
    };
  }

  if (q === 'which registrations are pending?') {
    const reg = getIncorporationPhases().find((p) => p.id === 'registration-phase-4');
    const done = new Set(o.milestones.filter((m) => m.kind === 'done').map((m) => m.id));
    const pending = (reg?.items ?? []).filter((i) => !done.has(i.id));
    if (!pending.length) return { kind: 'ok', text: 'Every registration is done.' };
    const names = pending.slice(0, 3).map((i) => i.title);
    return { kind: 'ok', text: `${pending.length} pending: ${names.join(', ')}${pending.length > 3 ? ' and more' : ''}.` };
  }

  if (q === 'when is fc-gpr due?') {
    const hit = o.compliance.upcoming.find((c) => /fc-?gpr/i.test(c.title));
    if (hit) return { kind: 'ok', text: `${hit.title} is due ${fmt(hit.dueDate)}.` };
    const step = o.milestones.find((m) => /fc-?gpr/i.test(m.title));
    if (step?.kind === 'done') return { kind: 'ok', text: `FC-GPR was filed${step.completedOn ? ` on ${fmt(step.completedOn)}` : ''}.` };
    void now;
    return { kind: 'ok', text: 'FC-GPR is due within 30 days of allotting shares. Your team will set the date once the shares are allotted.' };
  }

  return null;
}
