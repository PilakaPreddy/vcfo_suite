import { sep } from '@/lib/date-format';
import { CHART_STATUS, type ChartColor } from '@/components/charts';
import { getActiveCatalogItems } from '@/data/checklist';
import type { SuperEngagementSummary } from '@/lib/super/super-overview';

export const HEALTH_LABEL: Record<string, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  overdue: 'Overdue',
};

/** Runway bucket → chart fill, from the shared status scale. */
export const FILING_BUCKET_COLOR: Record<string, ChartColor> = {
  overdue: CHART_STATUS.overdue,
  week: CHART_STATUS.waiting,
  month: CHART_STATUS.active,
  quarter: CHART_STATUS.locked,
};

const DATE_FMT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

function formatSuperDayMonth(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return sep(date.toLocaleDateString('en-IN', DATE_FMT));
}

/** "2h ago" / "3d ago" — compact enough for a dense activity rail. */
export function formatSuperAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatSuperDayMonth(iso);
}

/**
 * The one-line detail under the chip. The chip already names the state, so this
 * says which step and, when it adds something the chip does not, why it has not
 * moved.
 */
export function attentionReason(summary: SuperEngagementSummary): string {
  if (summary.steps.overdue > 0) {
    const step = summary.steps.overdue;
    return `${step} overdue step${step === 1 ? '' : 's'}`;
  }
  if (summary.approvalsPending > 0) {
    const pending = summary.approvalsPending;
    return `${pending} step${pending === 1 ? '' : 's'} awaiting PM review`;
  }
  if (!summary.currentStep) return 'Every step is complete.';
  if (summary.stuckReason === 'on_track') return summary.currentStep.title;
  return `${summary.currentStep.title} · ${summary.stuckLabel.toLowerCase()}`;
}

/** Idle time, only once it is long enough to mean something. */
export function idleLabel(summary: SuperEngagementSummary): string | null {
  if (summary.idleDays === null || summary.idleDays < 3) return null;
  return `Quiet ${summary.idleDays}d`;
}

/**
 * R-13: the row chip in one of the six words, with its tone. The gate state stays the source:
 * PM review and "with the client" both read Waiting (the owner chip says who holds it), and a
 * firm-held journey with nothing done reads Not started.
 */
export function superStateChip(summary: SuperEngagementSummary): {
  word: string;
  tone: 'ok' | 'bad' | 'teal' | 'prog' | 'idle';
  title: string;
} {
  switch (summary.stateKey) {
    case 'complete':
      return { word: 'Done', tone: 'ok', title: summary.stateLabel };
    case 'overdue':
      return { word: 'Overdue', tone: 'bad', title: summary.stateLabel };
    case 'review':
    case 'with-client':
      return { word: 'Waiting', tone: 'teal', title: summary.stateLabel };
    default:
      return summary.progress.done === 0
        ? { word: 'Not started', tone: 'idle', title: summary.stateLabel }
        : { word: 'In progress', tone: 'prog', title: summary.stateLabel };
  }
}

/** R-14: who holds the next move. PM review sits with the manager. */
export function superOwnerOf(summary: SuperEngagementSummary): 'client' | 'sbc' | 'manager' | null {
  if (!summary.currentStep) return null;
  if (summary.stateKey === 'review') return 'manager';
  return summary.currentStep.owner === 'client' ? 'client' : 'sbc';
}

/** The four phase bars (ST5) as `PhaseBar` wants them. */
export function superPhaseTrack(summary: SuperEngagementSummary): {
  done: number[];
  totals: number[];
  names: string[];
} {
  return {
    done: summary.phases.map((phase) => phase.done),
    totals: summary.phases.map((phase) => phase.total),
    names: summary.phases.map((phase) => phase.label),
  };
}

/* ---------- Step numbers and stage words (prototype `codeOf`, `stageLabel`, `INC_PIPELINE`) ---------- */

/** Every active step's place in the catalog: its number over the whole journey and its code in its part. */
const STEP_PLACES: Map<string, { n: number; code: string }> = (() => {
  const seen: Record<string, number> = { Pre: 0, Post: 0, Reg: 0 };
  const out = new Map<string, { n: number; code: string }>();
  getActiveCatalogItems().forEach((item, i) => {
    const part = item.id.startsWith('post') ? 'Post' : item.id.startsWith('reg') ? 'Reg' : 'Pre';
    seen[part] = (seen[part] ?? 0) + 1;
    out.set(item.id, { n: i + 1, code: `${part}-${seen[part]}` });
  });
  return out;
})();

/** The step's code in its part: "Pre-7", "Post-8", "Reg-6". */
export function stepCode(stepId: string | null | undefined): string | null {
  return stepId ? (STEP_PLACES.get(stepId)?.code ?? null) : null;
}

/** "Step 17" for the incorporation and post-incorporation steps, "Reg-6" for a registration. */
export function stepWord(stepId: string | null | undefined): string | null {
  if (!stepId) return null;
  const place = STEP_PLACES.get(stepId);
  if (!place) return null;
  return place.code.startsWith('Reg') ? place.code : `Step ${place.n}`;
}

/** The stage pill: a client is Incorporating until it has its certificate, then in Compliance. */
export function superStageWord(summary: Pick<SuperEngagementSummary, 'incorporated'>): 'Incorporating' | 'Compliance' {
  return summary.incorporated ? 'Compliance' : 'Incorporating';
}

/** The practice area the client's live work sits in, for the Area filter on the clients grid. */
export function superAreaOf(summary: Pick<SuperEngagementSummary, 'incorporated' | 'currentStep'>): 'Incorporation' | 'Registrations' | 'Compliances' {
  if (!summary.incorporated) return 'Incorporation';
  return summary.currentStep?.id.startsWith('reg') ? 'Registrations' : 'Compliances';
}

/** The named incorporation stages, read from the catalog's own steps. */
export const INC_STAGES = [
  { key: 'name', label: 'Name approval' },
  { key: 'spice', label: 'SPICe+ forms' },
  { key: 'mca', label: 'MCA review' },
  { key: 'coi', label: 'Certificate (COI)' },
] as const;

export type IncStageKey = (typeof INC_STAGES)[number]['key'];

const NAME_STEPS = new Set(['pre-1', 'pre-2', 'pre-3', 'pre-4', 'pre-5']);

/** Which named stage a client not yet incorporated sits in, from its current step. */
export function incStageOf(summary: Pick<SuperEngagementSummary, 'currentStep'>): IncStageKey {
  const id = summary.currentStep?.id;
  if (!id || !id.startsWith('pre-') || id === 'pre-12') return 'coi';
  if (NAME_STEPS.has(id)) return 'name';
  return id === 'pre-11' ? 'mca' : 'spice';
}

/** The four parts of the journey by name, in catalog order. */
export const PHASE_NAMES = ['Name application', 'Incorporation', 'Post-incorporation', 'Registrations'];

/** A phase's stage name from its stored short label, for cards fed by the metrics read. */
export function phaseNameOf(label: string): string {
  const i = ['Part A', 'Part B', 'Post-inc', 'Registration'].indexOf(label);
  return i >= 0 ? PHASE_NAMES[i]! : label;
}

/** The step codes each phase runs over ("Pre-1–5"), from the real step counts. */
export function phaseCodes(totals: readonly number[]): string[] {
  const a = totals[0] ?? 0;
  const b = totals[1] ?? 0;
  return [`Pre-1\u2013${a}`, `Pre-${a + 1}\u2013${a + b}`, `Post-1\u2013${totals[2] ?? 0}`, `Reg-1\u2013${totals[3] ?? 0}`];
}

/** A registration's short name for a narrow head: "GST", "PF", "Shops". */
export function shortRegistration(title: string): string {
  if (/^shops\b/i.test(title)) return 'Shops';
  return title.replace(/\s+(registrations?|filing|return|reporting|licence|renewal)$/i, '').trim() || title;
}

/** Signing in is not something an admin did to a client's work, so the feed leaves it out. */
export function isAdminWork(entry: { action: string; label: string }): boolean {
  return !/sign[._-]?in|login/i.test(entry.action) && !/^signed in\b/i.test(entry.label);
}
