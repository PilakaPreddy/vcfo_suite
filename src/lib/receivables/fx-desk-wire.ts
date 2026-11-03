/**
 * RECEIVABLES FX DESK WIRE — the JSON shapes of the FX tab routes (docs/specs/receivables/PLAN.md,
 * Phase 10), shared by the repository, the routes and the hooks. Dates are `YYYY-MM-DD`, money is
 * plain rupees and rates are INR per one unit of the foreign currency.
 */
import type { ExposureRow, HedgeRow, RatePoint, RateTrend, SpreadRow, SpreadSummaryRow, WhatIfMove, WhatIfRow } from './fx-desk';
import type { RateInForceDto } from './reports-wire';

export type FxForwardStatus = 'open' | 'closed' | 'cancelled';

export type FxForwardDto = {
  id: string;
  currency: string;
  bank: string;
  contractNo: string | null;
  amountFc: number;
  forwardRate: number;
  bookedOn: string;
  maturityOn: string;
  utilisedFc: number;
  /** The amount still to be delivered against the contract. */
  unutilisedFc: number;
  status: FxForwardStatus;
  note: string;
  createdAt: string;
};

export type FxForwardInput = {
  currency: string;
  bank: string;
  contractNo?: string | null;
  amountFc: number;
  forwardRate: number;
  bookedOn: string;
  maturityOn: string;
  note?: string | null;
};

export type FxForwardPatch = Partial<FxForwardInput> & { status?: 'open' | 'closed' };

export type FxAlertDirection = 'above' | 'below';

export type FxAlertDto = {
  id: string;
  currency: string;
  direction: FxAlertDirection;
  threshold: number;
  active: boolean;
  lastTriggeredOn: string | null;
  /** Whether today's rate is at or beyond the level. */
  crossedNow: boolean;
  createdAt: string;
};

export type FxAlertInput = { currency: string; direction: FxAlertDirection; threshold: number };
export type FxAlertPatch = Partial<FxAlertInput> & { active?: boolean };

/** One currency's rate card and history. */
export type FxCurrencyDto = {
  currency: string;
  /** Today's rate in force (or the latest within ten days, else the latest stored). */
  today: RateInForceDto | null;
  /** The rate in force per day over the last 90 days, oldest first. */
  history: RatePoint[];
  trend: RateTrend;
  /** Booked rates of the open invoices, for the reference dots on the chart. */
  booked: Array<{ id: string; label: string; date: string; rate: number; fcAmount: number }>;
};

export type FxDeskDto = {
  today: string;
  currencies: FxCurrencyDto[];
  exposure: ExposureRow[];
  exposureTotals: { bookedInr: number; inrToday: number; changeInr: number };
  hedges: HedgeRow[];
  forwards: FxForwardDto[];
  whatIfMoves: WhatIfMove[];
  whatIf: WhatIfRow[];
  spreads: SpreadRow[];
  spreadSummary: SpreadSummaryRow[];
  alerts: FxAlertDto[];
};
