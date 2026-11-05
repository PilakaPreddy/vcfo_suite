import { child, children, descendants, parseXml, textOf, type XmlNode } from './xml';
import type { IncomingCredit } from './types';

/**
 * ISO 20022 bank statements (Phase 6, docs/specs/receivables/PLAN.md). HSBC delivers account
 * information in ISO 20022: camt.053 (the day's statement, also the host-to-host file) and
 * camt.054 (a credit notification). Both carry the same `Ntry` entries, so one reader serves the
 * API, the host-to-host file and a statement file the manager imports by hand.
 *
 * Only booked credits (`CdtDbtInd` CRDT) in INR are taken. The payer is the debtor's name
 * (`RltdPties/Dbtr/Nm`, or `Dbtr/Pty/Nm` in newer versions), falling back to the ultimate debtor
 * and the entry's additional information. A foreign-currency original (`AmtDtls/InstdAmt`) is
 * kept as the FX amount. The bank's own reference (`AcctSvcrRef`, else `NtryRef`, else the
 * transaction id) makes each credit unique, so importing a file twice adds nothing.
 */

export type CamtResult = {
  kind: 'camt.053' | 'camt.054' | 'unknown';
  account: string | null;
  credits: IncomingCredit[];
  /** Entries left out, with the reason (a debit is not counted here). */
  skipped: string[];
};

function amountOf(n: XmlNode | undefined): { value: number; ccy: string } | null {
  if (!n) return null;
  const value = Number(textOf(n));
  return Number.isFinite(value) ? { value, ccy: (n.attrs.Ccy || '').toUpperCase() } : null;
}

function dateOf(n: XmlNode | undefined): string | null {
  const d = textOf(child(n, 'Dt')) || textOf(child(n, 'DtTm'));
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}

function partyName(tx: XmlNode | undefined, role: 'Dbtr' | 'UltmtDbtr'): string {
  return textOf(child(tx, 'RltdPties', role, 'Nm')) || textOf(child(tx, 'RltdPties', role, 'Pty', 'Nm'));
}

export function parseCamt(xml: string, source: IncomingCredit['source'] = 'manual'): CamtResult {
  const doc = parseXml(xml);
  const top = doc.children.find((c) => c.name === 'Document') ?? doc;
  const kind = child(top, 'BkToCstmrStmt') ? 'camt.053' : child(top, 'BkToCstmrDbtCdtNtfctn') ? 'camt.054' : 'unknown';
  const holder = child(top, 'BkToCstmrStmt', 'Stmt') ?? child(top, 'BkToCstmrDbtCdtNtfctn', 'Ntfctn');
  const acct = child(holder, 'Acct', 'Id');
  const account = textOf(child(acct, 'IBAN')) || textOf(child(acct, 'Othr', 'Id')) || null;
  const credits: IncomingCredit[] = [];
  const skipped: string[] = [];

  descendants(top, 'Ntry').forEach((ntry, n) => {
    if (textOf(child(ntry, 'CdtDbtInd')) !== 'CRDT') return;
    const status = textOf(child(ntry, 'Sts', 'Cd')) || textOf(child(ntry, 'Sts'));
    const label = `Entry ${n + 1}`;
    if (status && status !== 'BOOK') {
      skipped.push(`${label}: not booked yet (${status}).`);
      return;
    }
    const amt = amountOf(child(ntry, 'Amt'));
    if (!amt || amt.value <= 0) {
      skipped.push(`${label}: no amount.`);
      return;
    }
    if (amt.ccy && amt.ccy !== 'INR') {
      skipped.push(`${label}: ${amt.ccy} ${amt.value}, not an INR account entry.`);
      return;
    }
    const valueDate = dateOf(child(ntry, 'ValDt')) ?? dateOf(child(ntry, 'BookgDt'));
    if (!valueDate) {
      skipped.push(`${label}: no date.`);
      return;
    }
    const tx = child(ntry, 'NtryDtls', 'TxDtls');
    const fx = amountOf(child(tx, 'AmtDtls', 'InstdAmt', 'Amt'));
    const ref =
      textOf(child(ntry, 'AcctSvcrRef')) ||
      textOf(child(ntry, 'NtryRef')) ||
      textOf(child(tx, 'Refs', 'AcctSvcrRef')) ||
      textOf(child(tx, 'Refs', 'TxId')) ||
      textOf(child(tx, 'Refs', 'EndToEndId'));
    if (!ref) {
      skipped.push(`${label}: no bank reference, so it could be counted twice.`);
      return;
    }
    const narration = [...children(child(tx, 'RmtInf'), 'Ustrd').map(textOf), textOf(child(tx, 'AddtlTxInf')), textOf(child(ntry, 'AddtlNtryInf'))].filter(Boolean).join(' · ');
    const payer = partyName(tx, 'Dbtr') || partyName(tx, 'UltmtDbtr') || textOf(child(ntry, 'AddtlNtryInf')) || 'Unknown payer';
    credits.push({
      source,
      externalRef: ref,
      valueDate,
      payer,
      currency: fx && fx.ccy && fx.ccy !== 'INR' ? fx.ccy : 'INR',
      fcAmount: fx && fx.ccy && fx.ccy !== 'INR' ? fx.value : null,
      inrAmount: amt.value,
      narration: narration.slice(0, 500),
    });
  });
  return { kind, account, credits, skipped };
}
