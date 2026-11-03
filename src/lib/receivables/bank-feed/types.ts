/**
 * The bank feed (Phase 6, docs/specs/receivables/PLAN.md): anything that can hand over the
 * credits booked on the client's account since a date. The HSBC API, a host-to-host statement
 * file and a statement file the manager imports all produce the same `IncomingCredit` rows,
 * which `systemIngestCredits` stores once and runs through the matcher.
 */

export type IncomingCredit = {
  source: 'hsbc_api' | 'alert_email' | 'manual';
  /** The bank's own reference; with the source, it is the de-duplication key. */
  externalRef: string;
  valueDate: string;
  payer: string;
  /** The original currency when the payer paid in a foreign currency, else INR. */
  currency: string;
  fcAmount: number | null;
  inrAmount: number;
  narration?: string;
};

export interface BankFeed {
  readonly source: IncomingCredit['source'];
  /** Credits booked on or after `since` (ISO date, India time). */
  fetchCredits(since: string): Promise<IncomingCredit[]>;
}
