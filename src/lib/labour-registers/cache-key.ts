/**
 * LABOUR REGISTERS — addressing a generated document.
 *
 * The owner's requirement is that a register is built once and afterwards retrieved, so the
 * server bill stays low. The honest way to do that is to address a document by everything that
 * determines its bytes, and the November 2026 research into caching and compliance evidence
 * turned up two corrections to a first design that keyed only on client, state, period and
 * input hash.
 *
 * **One: the key must carry the generator.** If the template or the code that fills it changes,
 * the old bytes are stale, and a key that omits them keeps serving a document built by a
 * version with a bug. Including the template version and the generator revision means a fix
 * changes the address, the stale object simply stops being asked for, and no invalidation
 * table has to be maintained. Locale, time zone and the assumption set go in for the same
 * reason: they all change the bytes.
 *
 * **Two: a filed register must not be re-keyed.** The research found that electronic registers
 * may change layout but not its integrity, serial numbering or column contents — a design
 * principle this product adopted rather than a rule anybody has cited, since a November 2026
 * research pass could not find that phrasing in any rule text — and that the
 * admissibility certificate under section 63 of the Bharatiya Sakshya Adhiniyam 2023
 * reportedly has to disclose a hash value — every citation for which was secondary
 * commentary, so it needs checking against the enacted text before anyone relies on it. Either
 * way the lifecycle splits in two: a draft is a pure cache that a better generator may
 * replace, and an attested document freezes for good. A correction after attestation is a new
 * document that supersedes the old one, never an overwrite. Zoho Books' e-invoicing works
 * this way in India already: cancellation voids irreversibly, identifiers are never reused,
 * and a correction is a fresh document.
 */
import { createHash } from 'node:crypto';

/**
 * The generator's own revision. **Bump this whenever a writer's output bytes change** — a
 * column order, a header block, a number format, a rounding rule. Forgetting to is the classic
 * cache bug, so it sits alone at the top of the file where a reviewer will see it in a diff.
 */
export const GENERATOR_REVISION = '2026-11-02.1';

/** How a register's attendance was arrived at, which changes the document and must be keyed. */
export interface AssumptionSet {
  /** True when no attendance sheet was supplied and the month was marked fully present. */
  fullAttendanceAssumed: boolean;
  /** The week-off rule applied, when attendance was assumed. */
  weekOff?: string;
  /** The holiday list applied, when attendance was assumed. */
  holidayList?: string;
  /** Resolved day-first or month-first, where the uploaded headings were ambiguous. */
  dateOrder?: 'day-first' | 'month-first';
  /** True when overtime was computed at twice the ordinary rate for employees covered by a fixed minimum wage. */
  doubleRateOvertime?: boolean;
  /**
   * Whether this client's "rate of wages" means a month's wages or a day's.
   *
   * It is a property of their payroll rather than anything to infer from the numbers, and every
   * form that prints a rate prints a different figure depending on it — so it is keyed, and
   * changing it correctly rebuilds those registers.
   */
  wageRateBasis?: 'monthly' | 'daily';
  /** Hours in a normal working day, where the client has said something other than eight. */
  dailyHours?: number;
  /**
   * Whose rules this establishment is under: the Centre (railways, mines, ports, banking,
   * telecom, central PSUs) or the State (everything else).
   *
   * Keyed, because it decides which registers exist at all. Switching a client from state to
   * central sphere does not change a figure on any existing sheet — it changes which sheets
   * there are — so the registers already produced stay valid and the new ones build.
   */
  sphere?: 'state' | 'central';
}

export interface DocumentIdentity {
  /** The engagement the register belongs to. */
  engagementId: string;
  /** The state whose form this is, or `IN` for a central form. */
  jurisdiction: string;
  /** The catalogue id of the form, never its number: a number is not an identity. */
  formId: string;
  /** The period, as `YYYY-MM` for a month or `YYYY-MM-DD..YYYY-MM-DD` otherwise. */
  period: string;
  /** Hash of the mapped input data, computed by the caller over the rows actually used. */
  inputsHash: string;
  /** The form template's own version, from the form registry. */
  templateVersion: string;
  assumptions: AssumptionSet;
  /** The locale the document is written in. Affects number and date rendering. */
  locale: string;
  /** The time zone dates were resolved in. A month boundary moves without it. */
  timeZone: string;
}

/** A stable JSON rendering: object keys sorted, so key order never changes the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/**
 * The content address of a draft register: a hex digest of everything that determines its
 * bytes. Two requests with the same address are the same document and the second is a
 * retrieval; any difference at all produces a new address.
 */
export function draftKey(id: DocumentIdentity): string {
  const payload = canonical({
    engagementId: id.engagementId,
    jurisdiction: id.jurisdiction,
    formId: id.formId,
    period: id.period,
    inputsHash: id.inputsHash,
    templateVersion: id.templateVersion,
    assumptions: id.assumptions,
    locale: id.locale,
    timeZone: id.timeZone,
    generator: GENERATOR_REVISION,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Hash the rows that will be written, so a change to the data a register prints changes its
 * address even when the file it came from is byte-identical. Rows are hashed in the order they
 * will be rendered, because the order is part of the document.
 */
export function hashRows(rows: Array<Record<string, unknown>>, fields: string[]): string {
  const h = createHash('sha256');
  const cols = [...fields].sort();
  h.update(canonical(cols));
  for (const row of rows) {
    h.update('\u0001');
    for (const field of cols) h.update(`${field}\u0000${String(row[field] ?? '')}\u0000`);
  }
  return h.digest('hex');
}

/**
 * The provenance record stored beside a generated document. It answers, without opening the
 * spreadsheet, who produced this, from what, under which mapping and which assumptions, with
 * which generator. If the reported hash requirement in section 63 of the Bharatiya Sakshya
 * Adhiniyam is right, the certificate for an electronic record can be produced mechanically
 * from this — which is why `artifactSha256` is recorded as its own field rather than inferred.
 */
export interface EvidenceManifest {
  documentId: string;
  key: string;
  identity: DocumentIdentity;
  /** Digest of the produced file itself, not of its inputs. */
  artifactSha256: string;
  byteLength: number;
  /** Who ran the generation, and when. */
  generatedBy: string;
  generatedAt: string;
  /** The mapping used, canonical field to the heading it came from. */
  mapping: Record<string, string>;
  /** The uploads the data came from, by their stored object keys and digests. */
  sources: Array<{ slot: string; objectKey: string; sha256: string; fileName: string }>;
  /** Set once a person attests the document; after this the document never changes. */
  attestation?: {
    byName: string;
    byRole: string;
    at: string;
    /** How it was signed: a printed wet signature, a digital signature certificate, or eSign. */
    method: 'printed-wet-signature' | 'dsc' | 'aadhaar-esign';
  };
  /** The document this one replaces, when a correction was issued after attestation. */
  supersedes?: string;
}

/**
 * Whether a stored document may be replaced in place. A draft may; anything attested may not,
 * and a correction has to be issued as a new document that supersedes it. The caller is
 * expected to branch on this rather than reason about it again.
 */
export function mayReplaceInPlace(manifest: Pick<EvidenceManifest, 'attestation'>): boolean {
  return !manifest.attestation;
}

/**
 * Why a stored document is stale, for the screen that offers to rebuild it. Returns null when
 * the stored key still matches, which is the common case and the whole point of the design.
 */
export function stalenessReason(storedKey: string, storedIdentity: DocumentIdentity, now: DocumentIdentity): string | null {
  if (storedKey === draftKey(now)) return null;
  if (storedIdentity.inputsHash !== now.inputsHash) return 'the uploaded data changed';
  if (canonical(storedIdentity.assumptions) !== canonical(now.assumptions)) return 'the attendance assumptions changed';
  if (storedIdentity.templateVersion !== now.templateVersion) return 'the form template changed';
  if (storedIdentity.locale !== now.locale || storedIdentity.timeZone !== now.timeZone) return 'the locale or time zone changed';
  return 'the generator changed';
}
