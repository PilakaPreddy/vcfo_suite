import { COMPLIANCE_OBLIGATIONS } from '@/lib/compliance/obligations-seed';
import type { RegArea, RegChangeType } from './types';

/**
 * Which clients an update touches, worked out by code from client data and never by the model. An
 * update that names a filing touches the clients with that filing still open. Otherwise its law area
 * decides, through the client's legal form and registrations. Where client data cannot answer, as for
 * securities or insolvency, the list stays empty and says so rather than guessing.
 */
const NAMED_FILINGS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\bgstr[\s-]?1\b/i, ['gst-gstr-1']],
  [/\bgstr[\s-]?3b\b/i, ['gst-gstr-3b']],
  [/\bgstr[\s-]?9c?\b/i, ['gst-gstr-9']],
  [/\badvance tax\b/i, ['it-advance-tax-q1', 'it-advance-tax-q2', 'it-advance-tax-q3', 'it-advance-tax-q4']],
  [/\b(tds|tcs)\b[^.]{0,40}\b(returns?|statements?)\b|\bform\s?(24q|26q|27q)\b/i, ['it-tds-return-q1', 'it-tds-return-q2', 'it-tds-return-q3', 'it-tds-return-q4']],
  [/\b(tds|tax deducted at source)\b[^.]{0,40}\b(deposit|payment|remittance)\b/i, ['it-tds-payment']],
  [/\b(itr|income[- ]tax returns?|returns? of income)\b/i, ['it-itr']],
  [/\bform[\s-]?16\b/i, ['it-form-16']],
  [/\bdir[\s-]?3[\s-]?kyc\b/i, ['mca-dir3-kyc']],
  [/\bdpt[\s-]?3\b/i, ['mca-dpt-3']],
  [/\bmsme[\s-]?1\b/i, ['mca-msme-1-apr', 'mca-msme-1-oct']],
  [/\baoc[\s-]?4\b/i, ['mca-aoc-4']],
  [/\bmgt[\s-]?7a?\b/i, ['mca-mgt-7']],
  [/\bllp\b[^.]{0,60}\bform[\s-]?11\b|\bform[\s-]?11\b[^.]{0,60}\bllp\b/i, ['llp-form-11']],
  [/\bllp\b[^.]{0,60}\bform[\s-]?8\b|\bform[\s-]?8\b[^.]{0,60}\bllp\b/i, ['llp-form-8']],
  [/\bdesignated partners?\b[^.]{0,60}\bkyc\b/i, ['llp-partner-kyc']],
  [/\becr\b|\b(pf|epf|epfo|provident fund)\b[^.]{0,40}\b(deposit|payment|remittance|contributions?|due date|returns?)\b/i, ['labour-pf-payment']],
  [/\b(esi|esic|state insurance)\b[^.]{0,40}\b(deposit|payment|contributions?|due date|returns?)\b/i, ['labour-esi-return']],
  [/\bfla return\b|\bforeign liabilities and assets\b/i, ['fema-fla']],
];

/** Filings a text names, by the form's own name. */
export function obligationsNamedIn(text: string): string[] {
  return NAMED_FILINGS.flatMap(([name, ids]) => (name.test(text) ? ids : []));
}

export const obligationName = (id: string): string => COMPLIANCE_OBLIGATIONS.find((row) => row.id === id)?.particular ?? id;

/** One client as this file needs it: built by the repository from engagement data. */
export interface ClientFacts {
  engagementId: string;
  companyName: string;
  legalForm: string;
  gst: boolean;
  tan: boolean;
  pf: boolean;
  esi: boolean;
  pt: boolean;
  foreignInvestment: boolean;
  /** Obligations with an instance not yet filed. */
  openObligations: readonly string[];
}

export interface UpdateForImpact {
  title: string;
  area: string | null;
  act: string | null;
  changeType: string | null;
  summary: string | null;
  affects: string | null;
  quote: string | null;
}

export interface AffectedClient {
  engagementId: string;
  companyName: string;
  reason: string;
}

export type ImpactBasis = 'filing' | 'area' | 'none';

export const updateText = (update: UpdateForImpact): string => [update.title, update.summary, update.affects, update.quote].filter(Boolean).join('\n');

type Rule = (client: ClientFacts) => string | null;

const LLP = /\bllp\b|limited liability partnership/i;
const COMPANY = /\bcompan(y|ies)\b/i;

function mcaRule(act: string): Rule {
  const llp = LLP.test(act);
  const company = COMPANY.test(act);
  return (client) => {
    if (client.legalForm === 'llp' && (llp || !company)) return 'LLP';
    if (client.legalForm === 'company' && (company || !llp)) return 'Company';
    return null;
  };
}

const LABOUR_RULES: ReadonlyArray<readonly [RegExp, keyof Pick<ClientFacts, 'pf' | 'esi' | 'pt'>, string]> = [
  [/\b(epf|epfo|provident fund)\b/i, 'pf', 'PF registered'],
  [/\b(esi|esic|state insurance)\b/i, 'esi', 'ESI registered'],
  [/\bprofessional tax\b/i, 'pt', 'Professional tax registered'],
];

function labourRule(text: string): Rule {
  const named = LABOUR_RULES.filter(([name]) => name.test(text));
  const rules = named.length > 0 ? named : LABOUR_RULES;
  return (client) => rules.find(([, key]) => client[key])?.[2] ?? null;
}

const flag = (key: 'gst' | 'tan' | 'foreignInvestment', reason: string): Rule => (client) => (client[key] ? reason : null);

function areaRule(update: UpdateForImpact, text: string): Rule | null {
  switch (update.area as RegArea | null) {
    case 'gst':
      return flag('gst', 'GST registered');
    case 'tax':
      return /\b(tds|tcs|tan)\b/i.test(text) ? flag('tan', 'Deducts TDS') : () => 'Files income tax';
    case 'mca':
      return mcaRule(update.act ?? '');
    case 'fema':
      return flag('foreignInvestment', 'Has foreign investment');
    case 'labour':
      return labourRule(text);
    default:
      return null;
  }
}

/** A draft changes nothing yet, so nobody is affected by it. */
export function affectedClients(update: UpdateForImpact, clients: readonly ClientFacts[]): { basis: ImpactBasis; clients: AffectedClient[] } {
  if ((update.changeType as RegChangeType | null) === 'consultation') return { basis: 'none', clients: [] };
  const text = updateText(update);
  const named = new Set(obligationsNamedIn(text));
  if (named.size > 0) {
    return {
      basis: 'filing',
      clients: clients.flatMap((client) => {
        const open = client.openObligations.find((id) => named.has(id));
        return open ? [{ engagementId: client.engagementId, companyName: client.companyName, reason: `${obligationName(open)} open` }] : [];
      }),
    };
  }
  const rule = areaRule(update, text);
  if (!rule) return { basis: 'none', clients: [] };
  return {
    basis: 'area',
    clients: clients.flatMap((client) => {
      const reason = rule(client);
      return reason ? [{ engagementId: client.engagementId, companyName: client.companyName, reason }] : [];
    }),
  };
}
