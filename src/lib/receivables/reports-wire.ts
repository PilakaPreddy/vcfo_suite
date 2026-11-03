/**
 * RECEIVABLES REPORTS WIRE — the JSON shapes of the Phase 9 routes (Reports tab, FX rates,
 * credit notes, disputes, TDS and FIRAs), shared by the repositories, the routes and the hooks
 * (docs/specs/receivables/PLAN.md, Phase 9). Dates are `YYYY-MM-DD`, money is plain rupees and
 * rates are INR per one unit of the foreign currency.
 */
import type { AgeingBucket, ClientDaysToPay } from './ageing';
import type { CashForecast } from './forecast';

export type FxSource = 'fbil' | 'ecb' | 'manual';

export type FxRateDto = {
  currency: string;
  rateDate: string;
  rate: number;
  source: FxSource;
  note: string;
  updatedAt: string;
};

/** The rate in force for a day: the manual override when there is one, else the fetched rate. */
export type RateInForceDto = Pick<FxRateDto, 'currency' | 'rateDate' | 'rate' | 'source'>;

export type FxOpenRowDto = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  dueDate: string;
  currency: string;
  fcAmount: number;
  bookedRate: number | null;
  bookedInr: number;
  /** Null when there is no rate for today yet. */
  inrToday: number | null;
  changeInr: number | null;
  changePct: number | null;
};

export type FxRealisedRowDto = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  paidOn: string | null;
  currency: string;
  fcAmount: number | null;
  receivedFc: number | null;
  receivedInr: number | null;
  bookedRate: number | null;
  effectiveRate: number | null;
  /** Null when the USD received or the booked rate is not recorded, so no gain can be worked out. */
  realisedInr: number | null;
  bankChargesFc: number | null;
  bankChargesInr: number | null;
};

export type TdsRowDto = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  paidOn: string | null;
  tdsInr: number;
  certificateOn: string | null;
  status: 'received' | 'awaited';
};

export type FiraDto = {
  id: string;
  invoiceId: string | null;
  clientName: string | null;
  invoiceNo: string | null;
  status: 'awaited' | 'received';
  firaNo: string | null;
  issuedOn: string | null;
  currency: string;
  fcAmount: number | null;
  inrAmount: number | null;
  note: string;
  createdAt: string;
};

export type DisputeRowDto = {
  id: string;
  clientName: string;
  invoiceNo: string | null;
  dueDate: string;
  amountInr: number;
  disputedAt: string;
  reason: string;
};

export type ReportsDto = {
  today: string;
  ageing: {
    buckets: Array<{ bucket: AgeingBucket; label: string; count: number; inr: number }>;
    total: { count: number; inr: number };
  };
  daysToPay: ClientDaysToPay[];
  forecast: CashForecast;
  fx: {
    /** The USD rate in force today (or the latest before today); null before the first fetch. */
    rate: RateInForceDto | null;
    open: FxOpenRowDto[];
    openTotals: { bookedInr: number; inrToday: number; changeInr: number };
    realised: FxRealisedRowDto[];
    realisedTotals: { realisedInr: number; bankChargesInr: number };
  };
  tds: { rows: TdsRowDto[]; totals: { tdsInr: number; awaitedInr: number; awaitedCount: number } };
  firas: { rows: FiraDto[]; awaited: number; received: number };
  disputes: DisputeRowDto[];
};

export type CreditNoteDto = {
  id: string;
  invoiceId: string;
  number: string | null;
  issuedOn: string;
  amountInr: number;
  reason: string;
  createdAt: string;
};

/** `onDate` is present when the request named a day: the USD rate in force on it, or null. */
export type FxRatesDto = { rates: FxRateDto[]; today: RateInForceDto | null; onDate?: RateInForceDto | null };
