import type { StuckReason } from '@/lib/projects/project-stuck';

/**
 * CLIENT HEALTH SCORE (IDEAS-PLAN wave 2, section E). PURE: no db, no env, no clock.
 *
 * A client starts at 100 points. Each signal takes points off, up to its own cap, so no single
 * signal can sink a client alone and the sum stays easy to explain in a tooltip:
 *
 *   Signal                                   Free allowance   Points off               Cap
 *   Oldest open document request             7 days           1 a day after that       20
 *   Days since the client last replied       14 days          1 a day after that       15
 *     or uploaded a file
 *   Overdue compliances and filings          none             8 each                   32
 *   Open notices                             none             6 each                   18
 *   Late receivables (when linked)           none             5 each                   15
 *   Stuck incorporation steps                none             blocked 15, waiting on
 *                                                             the client 8, waiting on
 *                                                             a manager 6, waiting on
 *                                                             the lead 3               15
 *
 * The score is 100 minus the points, never below 0. Bands: 80 and above is Good, 60 to 79 is
 * Watch, 40 to 59 is At risk, below 40 is Critical. A signal the job could not read (null) takes
 * nothing off and the tooltip says it was not counted.
 *
 * `HEALTH_WEIGHTS` and `healthTooltipLines` are exported so the screens show the same numbers.
 */

export const HEALTH_BANDS = ['good', 'watch', 'at_risk', 'critical'] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

export const HEALTH_BAND_LABEL: Record<HealthBand, string> = {
  good: 'Good',
  watch: 'Watch',
  at_risk: 'At risk',
  critical: 'Critical',
};

export function isHealthBand(value: unknown): value is HealthBand {
  return typeof value === 'string' && (HEALTH_BANDS as readonly string[]).includes(value);
}

/** The lowest score of each band, best first. */
export const BAND_FLOOR: Record<HealthBand, number> = { good: 80, watch: 60, at_risk: 40, critical: 0 };

export const HEALTH_WEIGHTS = {
  request: { graceDays: 7, perDay: 1, cap: 20 },
  silence: { graceDays: 14, perDay: 1, cap: 15 },
  overdue: { each: 8, cap: 32 },
  notices: { each: 6, cap: 18 },
  receivables: { each: 5, cap: 15 },
  stuck: {
    cap: 15,
    points: { blocked: 15, waiting_client: 8, waiting_manager: 6, waiting_signed: 6, waiting_lead: 3, on_track: 0 } as Record<StuckReason, number>,
  },
} as const;

/** What the nightly job read for one client. Null means "not available", not zero. */
export interface HealthInputs {
  /** Age in days of the oldest pending document request; null when none is open. */
  oldestRequestDays: number | null;
  /** Days since the client last sent a message or uploaded a file; null when unknown. */
  daysSinceClientActivity: number | null;
  /** Overdue statutory compliances, non-statutory compliance tasks and event filings. */
  overdueCompliances: number;
  /** Open notice cases; null while the notice desk is not available. */
  openNotices: number | null;
  /** Late receivable invoices linked to this client; null when receivables are not linked. */
  lateReceivables: number | null;
  /** The incorporation project's stuck reason; null once the client is past incorporation. */
  stuck: StuckReason | null;
}

export type HealthSignalKey = 'request' | 'silence' | 'overdue' | 'notices' | 'receivables' | 'stuck';

export interface HealthPenalty {
  key: HealthSignalKey;
  /** Points taken off (0 when the signal is fine). */
  points: number;
  cap: number;
  /** One plain line for the tooltip. */
  detail: string;
  /** False when the signal could not be read and was left out. */
  counted: boolean;
}

/** What is stored in `client_health_scores.signals`: the inputs and the points each took off. */
export interface HealthSignals extends HealthInputs {
  penalties: HealthPenalty[];
}

export interface HealthScore {
  score: number;
  band: HealthBand;
  signals: HealthSignals;
}

const STUCK_WORD: Record<StuckReason, string> = {
  blocked: 'a step is overdue',
  waiting_client: 'waiting on the client',
  waiting_manager: 'waiting on a manager',
  waiting_signed: 'waiting on a signed return',
  waiting_lead: 'waiting on the lead',
  on_track: 'on track',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function overGrace(days: number | null, w: { graceDays: number; perDay: number; cap: number }): number {
  if (days == null || days <= w.graceDays) return 0;
  return Math.min(w.cap, Math.round((days - w.graceDays) * w.perDay));
}

export function healthPenalties(i: HealthInputs): HealthPenalty[] {
  const W = HEALTH_WEIGHTS;
  const out: HealthPenalty[] = [];
  out.push({
    key: 'request',
    points: overGrace(i.oldestRequestDays, W.request),
    cap: W.request.cap,
    counted: true,
    detail: i.oldestRequestDays == null ? 'No open document request' : `Oldest open document request: ${plural(i.oldestRequestDays, 'day')} old`,
  });
  out.push({
    key: 'silence',
    points: overGrace(i.daysSinceClientActivity, W.silence),
    cap: W.silence.cap,
    counted: i.daysSinceClientActivity != null,
    detail:
      i.daysSinceClientActivity == null
        ? 'Last client reply or upload: not known yet'
        : `Last client reply or upload: ${plural(i.daysSinceClientActivity, 'day')} ago`,
  });
  out.push({
    key: 'overdue',
    points: Math.min(W.overdue.cap, Math.max(0, i.overdueCompliances) * W.overdue.each),
    cap: W.overdue.cap,
    counted: true,
    detail: i.overdueCompliances > 0 ? `${plural(i.overdueCompliances, 'overdue compliance')}` : 'No overdue compliance',
  });
  out.push({
    key: 'notices',
    points: i.openNotices == null ? 0 : Math.min(W.notices.cap, Math.max(0, i.openNotices) * W.notices.each),
    cap: W.notices.cap,
    counted: i.openNotices != null,
    detail: i.openNotices == null ? 'Notices: not counted' : i.openNotices > 0 ? `${plural(i.openNotices, 'open notice')}` : 'No open notice',
  });
  out.push({
    key: 'receivables',
    points: i.lateReceivables == null ? 0 : Math.min(W.receivables.cap, Math.max(0, i.lateReceivables) * W.receivables.each),
    cap: W.receivables.cap,
    counted: i.lateReceivables != null,
    detail:
      i.lateReceivables == null
        ? 'Late receivables: not linked to this client'
        : i.lateReceivables > 0
          ? `${plural(i.lateReceivables, 'late receivable')}`
          : 'No late receivable',
  });
  out.push({
    key: 'stuck',
    points: i.stuck == null ? 0 : Math.min(W.stuck.cap, W.stuck.points[i.stuck] ?? 0),
    cap: W.stuck.cap,
    counted: i.stuck != null,
    detail: i.stuck == null ? 'Incorporation: finished or not started here' : `Incorporation: ${STUCK_WORD[i.stuck]}`,
  });
  return out;
}

export function bandForScore(score: number): HealthBand {
  if (score >= BAND_FLOOR.good) return 'good';
  if (score >= BAND_FLOOR.watch) return 'watch';
  if (score >= BAND_FLOOR.at_risk) return 'at_risk';
  return 'critical';
}

export function computeHealth(inputs: HealthInputs): HealthScore {
  const penalties = healthPenalties(inputs);
  const lost = penalties.reduce((n, p) => n + p.points, 0);
  const score = Math.max(0, Math.min(100, 100 - lost));
  return { score, band: bandForScore(score), signals: { ...inputs, penalties } };
}

const BAND_RANK: Record<HealthBand, number> = { good: 0, watch: 1, at_risk: 2, critical: 3 };

/** How many bands a client fell (positive) or rose (negative) between two runs. */
export function bandDrop(previous: HealthBand | null | undefined, next: HealthBand): number {
  if (!previous) return 0;
  return BAND_RANK[next] - BAND_RANK[previous];
}

/** A fall of two bands or more opens a partner check-in. */
export function needsPartnerCheckIn(previous: HealthBand | null | undefined, next: HealthBand): boolean {
  return bandDrop(previous, next) >= 2;
}

/** Worst first, for sorting lists. */
export function bandRank(band: HealthBand): number {
  return BAND_RANK[band];
}

/** The tooltip: the score, then one line per signal with the points it took off. */
export function healthTooltipLines(score: number, signals: Pick<HealthSignals, 'penalties'>): string[] {
  return [
    `Score ${score} of 100`,
    ...signals.penalties.map((p) => (p.points > 0 ? `${p.detail} (-${p.points}, at most ${p.cap})` : p.detail)),
  ];
}
