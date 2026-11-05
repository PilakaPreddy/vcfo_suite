import type { Visual } from '@/data/ask/schema';

type FlowVisual = Extract<Visual, { type: 'flow' }>;
type StepsVisual = Extract<Visual, { type: 'steps' }>;
type CompareVisual = Extract<Visual, { type: 'compare' }>;
type TimelineVisual = Extract<Visual, { type: 'timeline' }>;
type KeyFactsVisual = Extract<Visual, { type: 'keyFacts' }>;
type NextStepVisual = Extract<Visual, { type: 'nextStep' }>;
type ProjectRowsVisual = Extract<Visual, { type: 'projectRows' }>;
type MetricsVisual = Extract<Visual, { type: 'metrics' }>;

const STATE_TEXT = { done: 'done', here: 'you are here', next: 'next' } as const;
const TONE_LABEL = { late: 'Late', waiting: 'Waiting', plain: '' } as const;

/** Screen-reader / PDF text equivalents of every visual (U5). */
export function flowText(v: FlowVisual): string {
  return v.stages
    .map((s, i) => `Stage ${i + 1} of ${v.stages.length}, ${s.label}${s.sub ? ` (${s.sub})` : ''}, ${STATE_TEXT[s.state]}.`)
    .join(' ');
}

function stepsText(v: StepsVisual): string {
  return v.items.map((s, i) => `Step ${i + 1}: ${s.label}${s.form ? `, form ${s.form}` : ''}.`).join(' ');
}

function compareText(v: CompareVisual): string {
  return `${v.left.title}: ${v.left.points.join('; ')}. ${v.right.title}: ${v.right.points.join('; ')}.`;
}

function timelineText(v: TimelineVisual): string {
  return v.events.map((e) => `${e.label}: ${e.when}${e.source === 'calendar' ? ' (from your calendar)' : ''}.`).join(' ');
}

function keyFactsText(v: KeyFactsVisual): string {
  return v.facts.map((f) => `${f.k}: ${f.v}.`).join(' ');
}

function nextStepText(v: NextStepVisual): string {
  return `Next step: ${v.title}${v.dueLabel ? `, planned ${v.dueLabel}` : ''}. ${v.items.join('. ')}`;
}

function projectRowsText(v: ProjectRowsVisual): string {
  if (v.rows.length === 0) return 'No projects.';
  return v.rows.map((r) => `${r.name}: ${r.step}. ${r.meta}.${TONE_LABEL[r.tone] ? ` ${TONE_LABEL[r.tone]}.` : ''}`).join(' ');
}

function metricsText(v: MetricsVisual): string {
  return v.items.map((m) => `${m.k}: ${m.v}.`).join(' ');
}

/** Text equivalent of any visual (U5) — also used by the PDF brief. */
export function visualText(visual: Visual): string {
  switch (visual.type) {
    case 'flow':
      return flowText(visual);
    case 'steps':
      return stepsText(visual);
    case 'compare':
      return compareText(visual);
    case 'timeline':
      return timelineText(visual);
    case 'keyFacts':
      return keyFactsText(visual);
    case 'nextStep':
      return nextStepText(visual);
    case 'projectRows':
      return projectRowsText(visual);
    case 'metrics':
      return metricsText(visual);
  }
}
