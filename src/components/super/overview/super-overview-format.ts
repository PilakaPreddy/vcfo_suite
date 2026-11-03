import { sep } from '@/lib/date-format';
import type { IconChipTone } from '@/components/common/IconChip';
import { CHART_STATUS, chartPhaseColor, type ChartColor } from '@/components/charts';
import type { SuperEngagementSummary, SuperStateKey } from '@/lib/super/super-overview';

/**
 * Display mapping for the super admin surface. Every tone here resolves to a
 * canonical `IconChipTone`, so a status chip on this dashboard is the same
 * object as a status chip on the lead dashboard — never a parallel palette.
 */

/**
 * Gate state → chip tone. This is the tone the row chip uses, because
 * `stateKey` is what the gate actually says (see `SuperStateKey`).
 */
const STATE_TONE: Record<SuperStateKey, IconChipTone> = {
  complete: 'success',
  overdue: 'danger',
  review: 'pink',
  'with-client': 'violet',
  'with-firm': 'primary',
};

/** Engagement health column → chip tone. */
const HEALTH_TONE: Record<string, IconChipTone> = {
  'on-track': 'success',
  'at-risk': 'warning',
  overdue: 'danger',
};

export const HEALTH_LABEL: Record<string, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  overdue: 'Overdue',
};

/** Filing status → chip tone, matching the compliance screens. */
const FILING_TONE: Record<string, IconChipTone> = {
  filed: 'success',
  'in-progress': 'sky',
  upcoming: 'cyan',
  overdue: 'danger',
};

/** Runway bucket → chart fill, from the shared status scale. */
export const FILING_BUCKET_COLOR: Record<string, ChartColor> = {
  overdue: CHART_STATUS.overdue,
  week: CHART_STATUS.waiting,
  month: CHART_STATUS.active,
  quarter: CHART_STATUS.locked,
};

function phaseFill(phaseId: string): ChartColor {
  return chartPhaseColor(phaseId);
}

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
