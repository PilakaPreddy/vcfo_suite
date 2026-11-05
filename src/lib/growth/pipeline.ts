/**
 * GROWTH PIPELINE — pure helpers for the super admin sales pipeline (G-21).
 *
 * The rows come from `prospects` through `src/db/repositories/prospects.ts`. Nothing here
 * touches `db` or React, so the view, the routes and the tests share one set of rules. There
 * are no fee amounts anywhere in the pipeline (rule R-37).
 */

export const PROSPECT_STAGES = ['lead', 'contacted', 'proposal', 'won', 'lost'] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const PROSPECT_STAGE_LABEL: Record<ProspectStage, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  proposal: 'Proposal sent',
  won: 'Won',
  lost: 'Lost',
};

export const PROSPECT_SOURCES = ['referral', 'website', 'event', 'partner', 'demo_request', 'other'] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_SOURCE_LABEL: Record<ProspectSource, string> = {
  referral: 'Referral',
  website: 'Website',
  event: 'Event',
  partner: 'Partner',
  demo_request: 'Demo request',
  other: 'Other',
};

export const PROSPECT_SERVICES = ['incorporation', 'compliance', 'registration', 'other'] as const;
export type ProspectService = (typeof PROSPECT_SERVICES)[number];

export const PROSPECT_SERVICE_LABEL: Record<ProspectService, string> = {
  incorporation: 'Incorporation',
  compliance: 'Compliance',
  registration: 'Registration',
  other: 'Other',
};

/** The shape the routes return and the Growth screen reads. Dates are ISO strings. */
export interface Prospect {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: ProspectSource;
  stage: ProspectStage;
  service: ProspectService | null;
  ownerId: string | null;
  ownerName: string | null;
  notes: string | null;
  /** YYYY-MM-DD */
  nextStepOn: string | null;
  closedAt: string | null;
  engagementId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function isProspectStage(value: unknown): value is ProspectStage {
  return typeof value === 'string' && (PROSPECT_STAGES as readonly string[]).includes(value);
}

export function asProspectSource(value: string | null | undefined): ProspectSource {
  return (PROSPECT_SOURCES as readonly string[]).includes(value ?? '') ? (value as ProspectSource) : 'other';
}

export function asProspectService(value: string | null | undefined): ProspectService | null {
  return (PROSPECT_SERVICES as readonly string[]).includes(value ?? '') ? (value as ProspectService) : null;
}

/** A won or lost prospect is closed; the repository stamps `closed_at` on that move. */
function isClosedStage(stage: ProspectStage): boolean {
  return stage === 'won' || stage === 'lost';
}

/**
 * The `closed_at` to store when a prospect moves from `from` to `to`. Moving into won or lost
 * stamps now (unless it was already closed, which keeps the first close date when won turns
 * to lost or back); moving back to an open stage clears it.
 */
export function closedAtForMove(
  from: ProspectStage,
  to: ProspectStage,
  current: Date | null,
  now: Date,
): Date | null {
  if (!isClosedStage(to)) return null;
  if (isClosedStage(from) && current) return current;
  return now;
}

/* ---------- Win rate ---------- */

export const WIN_RATE_WINDOWS = ['30', '90', '365', 'all'] as const;
export type WinRateWindow = (typeof WIN_RATE_WINDOWS)[number];

export const WIN_RATE_WINDOW_LABEL: Record<WinRateWindow, string> = {
  '30': '30 days',
  '90': '90 days',
  '365': '12 months',
  all: 'All time',
};

export interface WinRate {
  won: number;
  lost: number;
  /** Whole percent, or null when nothing closed in the window. */
  pct: number | null;
}

/**
 * Win rate = won / (won + lost), over prospects closed inside the window. Only stored rows
 * count: a prospect without `closed_at` is still open and is left out, so the number never
 * rests on a guess.
 */
export function winRate(
  rows: Array<Pick<Prospect, 'stage' | 'closedAt'>>,
  window: WinRateWindow,
  now: Date,
): WinRate {
  const floor = window === 'all' ? null : now.getTime() - Number(window) * 86_400_000;
  let won = 0;
  let lost = 0;
  for (const row of rows) {
    if (!isClosedStage(row.stage) || !row.closedAt) continue;
    const at = Date.parse(row.closedAt);
    if (Number.isNaN(at)) continue;
    if (floor !== null && at < floor) continue;
    if (row.stage === 'won') won += 1;
    else lost += 1;
  }
  const total = won + lost;
  return { won, lost, pct: total === 0 ? null : Math.round((won / total) * 100) };
}

/** Prospects grouped by stage, in board order, newest change first inside each stage. */
export function byStage<T extends Pick<Prospect, 'stage' | 'updatedAt'>>(rows: T[]): Record<ProspectStage, T[]> {
  const out = Object.fromEntries(PROSPECT_STAGES.map((s) => [s, [] as T[]])) as Record<ProspectStage, T[]>;
  for (const row of rows) out[row.stage]?.push(row);
  for (const stage of PROSPECT_STAGES) out[stage].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Prospects still open (lead, contacted or proposal). */
export function openCount(rows: Array<Pick<Prospect, 'stage'>>): number {
  return rows.filter((r) => !isClosedStage(r.stage)).length;
}
