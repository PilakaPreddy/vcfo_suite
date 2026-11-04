import { getRegistrationPhases, type ChecklistItem } from '@/data/checklist';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { REG_ROWS } from '@/lib/client-portal/credentials';

/**
 * REGISTRATION FACTS — the stored facts of each registration-phase step for one
 * engagement (G-05, G-06): the number, the date of registration, the certificate, and the
 * issue date, expiry and renewal period.
 *
 * Pure: the repository hands in the slim registration state (already redacted for the
 * viewer), the credentials workbook's "reg" rows (`fields` only, never the secret
 * ciphertext) and the documents filed against registration steps. The same precedence as
 * the credentials workbook applies: a value SBC typed on the workbook row wins over the
 * value read from the step's answers. Nothing is invented; a fact nobody recorded stays
 * null.
 *
 * Renewal fields live in the reg row's `fields` as `issuedOn`, `expiresOn` (ISO dates)
 * and `renewEveryMonths` (a whole number as text). A step with no template row on the
 * Registrations sheet stores them under the row key `step:<stepId>`, which the workbook
 * never lists.
 */

export const RENEWAL_FIELDS = ['issuedOn', 'expiresOn', 'renewEveryMonths'] as const;

/** Days before expiry when a registration reads "Due soon" (owner rule for G-05). */
const RENEW_SOON_DAYS = 30;

interface StepSource {
  /** Step answer fields that hold the number, first match wins. */
  number?: string[];
  /** Step answer fields that hold the registration date. */
  date?: string[];
  /** Step file field that holds the certificate upload. */
  cert?: string;
  /** Step answer field that holds an expiry date. */
  expiry?: string;
}

/**
 * Answer fields per registration step, the same ones `derive.ts` reads for the
 * credentials workbook. LUT is answered either on the GST step or on its own step.
 */
const SOURCES: Record<string, StepSource> = {
  'reg-4': { number: ['gstinNumber'], date: ['gstRegistrationDate'], cert: 'gstCertificateUrl' },
  'reg-1': { number: ['pfRegistrationNumber'], date: ['pfRegistrationDate'] },
  'reg-3': { number: ['esiRegistrationNumber'], date: ['esiRegistrationDate'] },
  'reg-7': { number: ['ptRegistrationNumberCompany'], date: ['ptRegistrationDate'] },
  'reg-6': { number: ['leiNumber'], date: ['leiRegistrationDate'], expiry: 'leiExpiryDate' },
  'reg-15': { number: ['msmeUdyamNumber'], date: ['msmeRegistrationDate'] },
  'reg-8': { number: ['iecCode'], date: ['iecRegistrationDate'], cert: 'iecCertificateUrl' },
  'reg-5': { number: ['lutArn'], date: ['lutFilingDate'] },
  'reg-13': { number: ['clraRegistrationNumber'] },
  'reg-14': { number: ['poshSheBoxId'] },
};

/** LUT may be answered on the GST step (reg-4) as well as on its own step (reg-5). */
const ALSO_FROM: Record<string, string[]> = { 'reg-5': ['reg-4'] };

/** Every answer field the slim read must keep (the narrow SQL selects only these). */
export const REGISTRATION_ANSWER_FIELDS: string[] = [
  ...new Set(
    Object.values(SOURCES).flatMap((s) => [...(s.number ?? []), ...(s.date ?? []), ...(s.cert ? [s.cert] : []), ...(s.expiry ? [s.expiry] : [])]),
  ),
];

function registrationItems(): ChecklistItem[] {
  return getRegistrationPhases().flatMap((p) => p.items);
}

const ROW_BY_TITLE = new Map(REG_ROWS.map(([key, label]) => [label.toLowerCase(), key]));

/** The credentials "reg" row key a step's facts live on. */
export function rowKeyForStep(stepId: string): string | null {
  const item = registrationItems().find((i) => i.id === stepId);
  if (!item) return null;
  return ROW_BY_TITLE.get(item.title.toLowerCase()) ?? `step:${stepId}`;
}

export function isRegistrationStep(stepId: string): boolean {
  return registrationItems().some((i) => i.id === stepId);
}

export interface RegistrationFacts {
  stepId: string;
  /** The credentials row key the facts live on. */
  rowKey: string;
  number: string | null;
  /** ISO when the stored text parses as a date, else the text as typed. */
  registeredOn: string | null;
  /** The certificate's file name, and whether a file can be downloaded. */
  certificate: { name: string; downloadable: boolean } | null;
  issuedOn: string | null;
  expiresOn: string | null;
  renewEveryMonths: number | null;
}

/** Facts by step id. */
export type RegistrationFactsMap = Record<string, RegistrationFacts>;

/** Where a certificate file lives (server side only; never sent to the browser). */
export type CertificateSource =
  | { kind: 'step'; path: string; name: string }
  | { kind: 'document'; objectKey: string; name: string };

export interface RegistrationDocument {
  stepId: string;
  fileName: string;
  objectKey: string;
  createdAt: Date | string;
}

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "2026-10-12", "12 Oct 2026" or "12/10/2026" (day first) as ISO; null when it does not parse. */
export function isoOfText(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const named = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})$/);
  const slash = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (named && MON[named[2]!.toLowerCase()] !== undefined) [y, m, d] = [Number(named[3]), MON[named[2]!.toLowerCase()]!, Number(named[1])];
  else if (slash) [y, m, d] = [Number(slash[3]), Number(slash[2]) - 1, Number(slash[1])];
  else return null;
  const date = new Date(Date.UTC(y, m, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

function fileName(path: string): string {
  const seg = path.split('?')[0]!.split('/').pop() ?? path;
  const dash = seg.indexOf('-');
  const name = dash > 0 && /^\d+$/.test(seg.slice(0, dash)) ? seg.slice(dash + 1) : seg;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function monthsOf(value: string | undefined): number | null {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 && n <= 240 ? n : null;
}

/**
 * Build the facts of every registration step for one engagement. `state` is the slim,
 * viewer-redacted checklist state; `stored` the reg rows' `fields` by row key; `documents`
 * the documents filed against registration steps that the viewer may read, newest first.
 */
export function buildRegistrationFacts(input: {
  state: Record<string, ChecklistItemStateSlice | undefined>;
  stored: Record<string, Record<string, string> | undefined>;
  documents: RegistrationDocument[];
}): { facts: RegistrationFactsMap; certificates: Record<string, CertificateSource> } {
  const facts: RegistrationFactsMap = {};
  const certificates: Record<string, CertificateSource> = {};
  const items = registrationItems();
  const answersCache = new Map<string, Record<string, string>>();
  const answers = (stepId: string): Record<string, string> => {
    if (!answersCache.has(stepId)) {
      const item = items.find((i) => i.id === stepId);
      answersCache.set(stepId, item ? extractItemResponses(item, input.state[stepId] ?? null) : {});
    }
    return answersCache.get(stepId)!;
  };
  const pick = (stepIds: string[], fields: string[] | undefined): string | null => {
    for (const s of stepIds) for (const f of fields ?? []) {
      const v = answers(s)[f]?.trim();
      if (v) return v;
    }
    return null;
  };

  for (const item of items) {
    const stepId = item.id;
    const rowKey = rowKeyForStep(stepId)!;
    const src = SOURCES[stepId] ?? {};
    const from = [stepId, ...(ALSO_FROM[stepId] ?? [])];
    const stored = input.stored[rowKey] ?? {};
    const typedDate = stored.date?.trim() || null;
    const autoDate = pick(from, src.date);

    let certificate: RegistrationFacts['certificate'] = null;
    const certPath = src.cert ? answers(stepId)[src.cert]?.trim() : undefined;
    const doc = input.documents.find((d) => d.stepId === stepId);
    if (certPath && !/^https?:/i.test(certPath)) {
      const name = fileName(certPath);
      certificates[stepId] = { kind: 'step', path: certPath, name };
      certificate = { name, downloadable: true };
    } else if (doc) {
      certificates[stepId] = { kind: 'document', objectKey: doc.objectKey, name: doc.fileName };
      certificate = { name: doc.fileName, downloadable: true };
    } else if (stored.cert?.trim()) {
      certificate = { name: stored.cert.trim(), downloadable: false };
    }

    const issuedOn = isoOfText(stored.issuedOn) ?? null;
    const renewEveryMonths = monthsOf(stored.renewEveryMonths);
    const storedExpiry = isoOfText(stored.expiresOn);
    const answerExpiry = src.expiry ? isoOfText(answers(stepId)[src.expiry]) : null;
    const expiresOn = storedExpiry ?? answerExpiry ?? (issuedOn && renewEveryMonths ? addMonths(issuedOn, renewEveryMonths) : null);

    facts[stepId] = {
      stepId,
      rowKey,
      number: stored.number?.trim() || pick(from, src.number),
      registeredOn: typedDate ? (isoOfText(typedDate) ?? typedDate) : (isoOfText(autoDate) ?? autoDate),
      certificate,
      issuedOn,
      expiresOn,
      renewEveryMonths,
    };
  }
  return { facts, certificates };
}

export type RenewalWord = 'Due soon' | 'Overdue';

export interface Renewal {
  /** The date by which the registration must be renewed: its expiry. */
  renewBy: string;
  /** Whole days from today to `renewBy` (negative once expired). */
  days: number;
  /** "Due soon" within 30 days of expiry, "Overdue" after it, otherwise null. */
  word: RenewalWord | null;
}

/** The renewal state of one registration, or null when no expiry is known. */
export function renewalOf(facts: Pick<RegistrationFacts, 'expiresOn'> | null | undefined, now: Date): Renewal | null {
  const renewBy = facts?.expiresOn;
  if (!renewBy) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const due = Date.parse(`${renewBy}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  const days = Math.round((due - today) / 86_400_000);
  return { renewBy, days, word: days < 0 ? 'Overdue' : days <= RENEW_SOON_DAYS ? 'Due soon' : null };
}
