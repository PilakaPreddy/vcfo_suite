import { statesForPicker } from '@/data/labour-registers/states';
import { companiesNamed, type LockableEngagement } from '@/lib/ask/data-router/lock';
import type { ReadResult } from '@/lib/ask/data-router/types';
import { normalizeLabel } from '@/lib/ask/field-catalog/rules';
import { authorityFromText, looksLikeNotice, NOTICE_DOC_TYPES, type NoticeAuthority } from '@/lib/notices/model';
import { COPY_FIELD_BY_DOC, UPLOAD_FIELD_BY_DOC, UPLOAD_FIELDS, type UploadField } from '@/lib/ask/field-catalog/upload-fields';
import type { UploadSlot } from '@/lib/labour-registers/parse';
import { parsePeriodHint, type PeriodHint } from '@/lib/labour-registers/period-hint';

/**
 * Sorting one dropped file: which client it is for and where in the app it goes. This file is plain
 * code over what was read and the file's names, so it costs nothing and is easy to test. What it
 * cannot settle from the names alone (the state of a labour register, the open checklist step, the
 * compliance task) it marks in `needs`, and `assemble.ts` settles it with the repositories.
 *
 * The client comes from the first of these that names exactly one of the person's projects: the
 * company the document names, the folder names (the deepest first), the file name, then the files
 * beside it in the same folder, the message, the page the person is on, and their only project.
 */

export type ClientSource = 'document' | 'folder' | 'file' | 'sibling' | 'message' | 'page' | 'only' | 'reply';

export type DropDestination =
  /** A payroll, attendance, overtime, employee or leave sheet for the labour register. */
  | { kind: 'labour'; slot: UploadSlot; period: PeriodHint | null; stateCode: string | null }
  /**
   * A document a checklist upload field takes. `copy` marks an identity document whose copy goes on
   * a director's entry; the data router's `planRows` files that one beside the director's values.
   */
  | { kind: 'checklist'; docType: string; fields: UploadField[]; copy: boolean }
  /** Pasted text: its values only, there is no file to keep. */
  | { kind: 'values' }
  /** A tax, GST, TDS or MCA notice: it opens a case on the notice desk (`compliance.openNotice`). */
  | { kind: 'notice'; authority: NoticeAuthority | null }
  /** Everything else, into the document vault. A compliance task may still claim it in `assemble`. */
  | { kind: 'vault'; category: string };

export type ClassifyNeed = 'client' | 'state' | 'period' | 'field';

export interface ClassifyInput {
  attachmentId: string;
  kind: string;
  fileName: string;
  /** The folder path and file name as dropped. */
  path: string;
  read: ReadResult;
}

export interface ClassifyHints<E extends LockableEngagement> {
  engagements: readonly E[];
  instruction: string;
  pagePath?: string | null;
}

export interface FileClassification<E extends LockableEngagement> {
  attachmentId: string;
  destination: DropDestination;
  /** One entry when the client is settled; several when they tie; none when nothing names one. */
  engagementCandidates: E[];
  clientSource: ClientSource | null;
  /** How sure the client is: 1 when the document or a folder names it, lower for weaker hints. */
  confidence: number;
  needs: ClassifyNeed[];
}

const CONFIDENCE: Record<ClientSource, number> = { document: 1, folder: 1, reply: 1, file: 0.9, sibling: 0.8, message: 0.8, page: 0.6, only: 0.6 };

/** The folders a path sits in, the deepest first. */
export function folderNames(path: string): string[] {
  return path.split(/[\\/]/).slice(0, -1).filter(Boolean).reverse();
}

export function folderOf(path: string): string {
  return path.split(/[\\/]/).slice(0, -1).join('/');
}

const stem = (fileName: string) => fileName.replace(/\.[a-z0-9]{1,5}$/i, '');

const PAGE_PROJECT = /\/(?:projects|engagements|clients)\/([^/?#]+)/;

/** The vault folder for a document type the reader knows. */
const VAULT_CATEGORY: Record<string, string> = {
  gst_certificate: 'Registrations',
  rent_agreement: 'Contracts',
  bank_document: 'Bank',
  company_letter: 'Letters',
  tax_notice: 'Notices',
  din_letter: 'Director KYC',
  incorporation_certificate: 'Incorporation',
  pan_card: 'Identity',
  aadhaar_card: 'Identity',
  passport: 'Identity',
  voter_id: 'Identity',
  driving_licence: 'Identity',
  utility_bill: 'Address proof',
  form: 'Forms',
};

export function vaultCategory(docType: string): string {
  return VAULT_CATEGORY[docType] ?? 'Other';
}

// ---- The state of a labour register, from names ----------------------------------------------

/** Cities a payroll folder is often named after, for the state they are in. */
const CITY_STATE: Record<string, string> = {
  bengaluru: 'KA', bangalore: 'KA', mysuru: 'KA', mysore: 'KA', mangaluru: 'KA', mangalore: 'KA',
  hyderabad: 'TG', secunderabad: 'TG', warangal: 'TG',
  kochi: 'KL', cochin: 'KL', trivandrum: 'KL', thiruvananthapuram: 'KL', kozhikode: 'KL',
  gurugram: 'HR', gurgaon: 'HR', faridabad: 'HR',
  mumbai: 'MH', pune: 'MH', nagpur: 'MH', chennai: 'TN', coimbatore: 'TN', delhi: 'DL',
  noida: 'UP', lucknow: 'UP', kolkata: 'WB', ahmedabad: 'GJ', surat: 'GJ', vadodara: 'GJ',
  visakhapatnam: 'AP', vijayawada: 'AP', jaipur: 'RJ', chandigarh: 'CH', bhubaneswar: 'OD', goa: 'GA',
};

/** Old or short names for a state. */
const STATE_ALIASES: Record<string, string> = { orissa: 'OD', pondicherry: 'PY', uttaranchal: 'UK', ts: 'TG' };

const STATE_NAMES = statesForPicker().map((s) => ({ code: s.code as string, name: normalizeLabel(s.name) }));
const STATE_CODES = new Set(STATE_NAMES.map((s) => s.code));

/** The state code a set of names points to, the first name first; null when none names one. */
export function stateFromNames(names: readonly string[]): string | null {
  for (const raw of names) {
    const text = ` ${normalizeLabel(raw)} `;
    // A whole state name, the longest first so "andhra pradesh" is not read as "pradesh".
    const byName = [...STATE_NAMES].sort((a, b) => b.name.length - a.name.length).find((s) => text.includes(` ${s.name} `));
    if (byName) return byName.code;
    for (const word of text.trim().split(' ')) {
      if (CITY_STATE[word]) return CITY_STATE[word]!;
      if (STATE_ALIASES[word]) return STATE_ALIASES[word]!;
    }
    // A code counts only in capitals as its own word ("KA", "Payroll_TG"), never inside a word.
    for (const token of raw.split(/[^A-Za-z]+/)) {
      if (token.length === 2 && token === token.toUpperCase() && STATE_CODES.has(token)) return token;
    }
  }
  return null;
}

/** A state name as the checklist stores it ("Karnataka") to its code. */
export function stateCodeOfName(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const text = normalizeLabel(name);
  return STATE_NAMES.find((s) => s.name === text)?.code ?? STATE_ALIASES[text] ?? null;
}

// ---- Checklist upload fields ------------------------------------------------------------------

const STOP_WORDS = new Set(['copy', 'scan', 'scanned', 'final', 'the', 'of', 'and', 'for', 'from', 'with', 'doc', 'file', 'pdf', 'signed', 'new', 'old', 'draft']);
const ACRONYMS: Record<string, string> = { noc: 'no objection certificate', coi: 'certificate of incorporation', moa: 'memorandum of association', aoa: 'articles of association' };

const meaningful = (text: string) =>
  normalizeLabel(text)
    .split(' ')
    .flatMap((w) => (ACRONYMS[w] ? ACRONYMS[w]!.split(' ') : [w]))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

/**
 * Upload fields whose label shares at least two meaningful words with the file name ("NOC from
 * owner.pdf" and "No-objection certificate from the owner"). Used only when the reader's document
 * type maps to no field.
 */
export function uploadFieldsByLabel(fileName: string): UploadField[] {
  const words = new Set(meaningful(stem(fileName)));
  if (words.size === 0) return [];
  const scored = UPLOAD_FIELDS.map((field) => ({ field, shared: new Set(meaningful(field.label).filter((w) => words.has(w))).size })).filter((s) => s.shared >= 2);
  const best = Math.max(0, ...scored.map((s) => s.shared));
  return scored.filter((s) => s.shared === best).map((s) => s.field);
}

// ---- Compliance tasks -------------------------------------------------------------------------

export interface TaskLike {
  id: string;
  name: string;
  activityName?: string | null;
  periodLabel: string | null;
  title?: string;
  dueDate: string;
}

/** The words of a task's name that must all appear: "GSTR-3B" is "gstr 3b". */
const taskWords = (task: TaskLike) => [task.name, task.activityName].filter((n): n is string => Boolean(n?.trim())).map((n) => normalizeLabel(n)).filter((n) => n.length >= 3);

const namesTask = (text: string, task: TaskLike) => {
  const haystack = ` ${normalizeLabel(text)} `;
  return taskWords(task).some((words) => haystack.includes(` ${words} `));
};

/**
 * The open task a file is evidence for, or null. It counts only when the message or a folder names
 * the task (a period in the names then picks between its months, else the one due first), or when
 * the file name names the task and a period that matches the task's own period.
 */
export function matchTask<T extends TaskLike>(tasks: readonly T[], input: { instruction: string; path: string; fileName: string }): T | null {
  if (tasks.length === 0) return null;
  const folders = folderNames(input.path);
  const hint = parsePeriodHint(input.fileName, ...folders);
  const samePeriod = (task: T) => {
    const own = parsePeriodHint(task.periodLabel, task.title) ?? null;
    return Boolean(hint && own && own.from === hint.from);
  };
  const byContext = tasks.filter((t) => namesTask(input.instruction, t) || folders.some((f) => namesTask(f, t)));
  if (byContext.length > 0) {
    const inPeriod = byContext.filter(samePeriod);
    if (inPeriod.length > 0) return inPeriod[0]!;
    if (hint) return null; // The names give a period no open task has.
    return [...byContext].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]!;
  }
  if (!hint) return null;
  return tasks.find((t) => namesTask(stem(input.fileName), t) && samePeriod(t)) ?? null;
}

// ---- The client -------------------------------------------------------------------------------

function clientHints<E extends LockableEngagement>(input: ClassifyInput, hints: ClassifyHints<E>): Array<{ source: ClientSource; matches: E[] }> {
  const { engagements } = hints;
  const out: Array<{ source: ClientSource; matches: E[] }> = [];
  const companies = [...new Set([input.read.company, ...(input.read.parts ?? []).map((p) => p.company)].filter((c): c is string => Boolean(c?.trim())))];
  for (const company of companies) out.push({ source: 'document', matches: companiesNamed(company, engagements) });
  for (const folder of folderNames(input.path)) out.push({ source: 'folder', matches: companiesNamed(folder, engagements) });
  if (input.kind !== 'paste') out.push({ source: 'file', matches: companiesNamed(stem(input.fileName), engagements) });
  return out;
}

function laterHints<E extends LockableEngagement>(hints: ClassifyHints<E>): Array<{ source: ClientSource; matches: E[] }> {
  const { engagements } = hints;
  const out: Array<{ source: ClientSource; matches: E[] }> = [{ source: 'message', matches: companiesNamed(hints.instruction, engagements) }];
  const key = hints.pagePath ? PAGE_PROJECT.exec(hints.pagePath)?.[1] : null;
  const onPage = key ? engagements.filter((e) => e.slug === key || e.id === key) : [];
  out.push({ source: 'page', matches: onPage });
  out.push({ source: 'only', matches: engagements.length === 1 ? [...engagements] : [] });
  return out;
}

/**
 * The first hint that names exactly one client wins. A hint that names several narrows the field:
 * a later hint that names one of them settles it, otherwise the tie is returned as candidates.
 */
function pickClient<E extends LockableEngagement>(levels: Array<{ source: ClientSource; matches: E[] }>): { candidates: E[]; source: ClientSource | null } {
  let tie: E[] | null = null;
  let tieSource: ClientSource | null = null;
  for (const { source, matches } of levels) {
    if (matches.length === 0) continue;
    if (!tie) {
      if (matches.length === 1) return { candidates: matches, source };
      tie = matches;
      tieSource = source;
      continue;
    }
    const narrowed = matches.filter((m) => tie!.some((t) => t.id === m.id));
    if (narrowed.length === 1) return { candidates: narrowed, source };
  }
  return { candidates: tie ?? [], source: tie ? tieSource : null };
}

// ---- The destination --------------------------------------------------------------------------

/** Document types a notice may be read as, besides the notice types themselves. */
const NOTICE_READ_AS = new Set(['other', 'form', 'company_letter']);

/**
 * A department's notice, by the reader's type or by notice wording in the file name, its folders
 * or the values read from it. Returns null for anything else.
 */
export function noticeDestination(input: Pick<ClassifyInput, 'fileName' | 'path' | 'read'>): Extract<DropDestination, { kind: 'notice' }> | null {
  const { read } = input;
  if (!NOTICE_DOC_TYPES.has(read.docType) && !NOTICE_READ_AS.has(read.docType)) return null;
  const texts = [stem(input.fileName), ...folderNames(input.path), ...read.values.slice(0, 40).map((v) => `${v.label} ${v.value}`)];
  if (!looksLikeNotice({ docType: read.docType, texts })) return null;
  return { kind: 'notice', authority: authorityFromText(texts.join(' ')) };
}

function destinationOf(input: ClassifyInput): DropDestination {
  const { read } = input;
  if (input.kind === 'paste') return { kind: 'values' };
  if (read.labourSheet) {
    const names = [stem(input.fileName), ...folderNames(input.path)];
    return {
      kind: 'labour',
      slot: read.labourSheet.slot,
      period: read.labourSheet.periodHint ?? parsePeriodHint(...names),
      stateCode: stateFromNames(names),
    };
  }
  const notice = noticeDestination(input);
  if (notice) return notice;
  const byDoc = UPLOAD_FIELD_BY_DOC[read.docType] ?? [];
  if (byDoc.length > 0) return { kind: 'checklist', docType: read.docType, fields: [...byDoc], copy: Boolean(COPY_FIELD_BY_DOC[read.docType]) && byDoc.every((f) => f.group === 'directors') };
  const byLabel = read.docType === 'other' || read.docType === 'form' ? uploadFieldsByLabel(input.fileName) : [];
  if (byLabel.length > 0) return { kind: 'checklist', docType: read.docType, fields: byLabel, copy: false };
  return { kind: 'vault', category: vaultCategory(read.docType) };
}

export function classifyFile<E extends LockableEngagement>(input: ClassifyInput, hints: ClassifyHints<E>, opts: { skipLaterHints?: boolean } = {}): FileClassification<E> {
  const destination = destinationOf(input);
  const levels = [...clientHints(input, hints), ...(opts.skipLaterHints ? [] : laterHints(hints))];
  const { candidates, source } = pickClient(levels);
  const needs: ClassifyNeed[] = [];
  if (candidates.length !== 1) needs.push('client');
  if (destination.kind === 'labour') {
    if (!destination.stateCode) needs.push('state');
    if (!destination.period) needs.push('period');
  }
  if (destination.kind === 'checklist' && destination.fields.length > 1) needs.push('field');
  return {
    attachmentId: input.attachmentId,
    destination,
    engagementCandidates: candidates,
    clientSource: candidates.length === 1 ? source : null,
    confidence: candidates.length === 1 && source ? CONFIDENCE[source] : 0,
    needs,
  };
}

/**
 * Every file of a drop. A file whose own names and document say nothing takes the client of the
 * files beside it in the same folder, when those agree on one; only then do the message, the page
 * and the person's only project count.
 */
export function classifyDrop<E extends LockableEngagement>(inputs: readonly ClassifyInput[], hints: ClassifyHints<E>): FileClassification<E>[] {
  const own = inputs.map((input) => classifyFile(input, hints, { skipLaterHints: true }));
  const byFolder = new Map<string, Set<string>>();
  inputs.forEach((input, i) => {
    const found = own[i]!;
    if (found.engagementCandidates.length !== 1 || input.kind === 'paste') return;
    const folder = folderOf(input.path);
    if (!folder) return;
    const set = byFolder.get(folder) ?? new Set<string>();
    set.add(found.engagementCandidates[0]!.id);
    byFolder.set(folder, set);
  });
  return inputs.map((input, i) => {
    const found = own[i]!;
    if (found.engagementCandidates.length === 1) return found;
    const siblings = input.kind === 'paste' ? undefined : byFolder.get(folderOf(input.path));
    if (found.engagementCandidates.length === 0 && siblings?.size === 1) {
      const engagement = hints.engagements.find((e) => e.id === [...siblings][0]);
      if (engagement) return { ...found, engagementCandidates: [engagement], clientSource: 'sibling', confidence: CONFIDENCE.sibling, needs: found.needs.filter((n) => n !== 'client') };
    }
    const full = classifyFile(input, hints);
    // A tie from the file's own hints stays a tie unless a later hint settles it.
    return full;
  });
}

// ---- The reply to "Where should these go?" ----------------------------------------------------

/** One instruction in a reply: which files (by their number in the question, or all) and where. */
export interface DropReplyAssignment {
  files: number[] | 'all';
  engagementId?: string;
  stateCode?: string;
  period?: PeriodHint;
}

export interface DropReply {
  cancel: boolean;
  assignments: DropReplyAssignment[];
}

const REPLY_CANCEL = /^\s*(?:no|nope|cancel|stop|leave (?:it|them|those)|never ?mind|skip (?:it|them|those)|forget (?:it|them))\b/i;
const REPLY_ALL = /\b(?:all|every(?:thing|one)?|the rest|rest|both|them)\b/i;
/** Where the files end and their place begins: "3 -> Acme", "file 3: Acme", "2 and 4 are Acme", "all to Acme". */
const REPLY_SPLIT = /\s*(?:->|→|=>|:|=|\bis\b|\bare\b|\bgoes to\b|\bgo to\b|\bto\b|\bfor\b|\bbelongs? to\b)\s*/i;
const FILE_REFS = /(?:\bfiles?\b|#|\bno\.?|\bnumbers?\b)\s*((?:\d{1,2}\s*(?:,|and|&|-|to)?\s*)+)/i;

function numbersIn(text: string, count: number): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d{1,2})\s*(?:-|to)\s*(\d{1,2})|(\d{1,2})/g)) {
    if (m[3]) out.add(Number(m[3]));
    else for (let n = Number(m[1]); n <= Number(m[2]) && n - Number(m[1]) < 60; n += 1) out.add(n);
  }
  return [...out].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
}

/**
 * Reads a reply such as "file 3 -> Acme, Karnataka, Aug 2026", "1 and 2 are Routeware" or "all of
 * them are Routeware". Each line or semicolon-separated part is one instruction; a part that names no
 * file counts for every file still waiting (or the only one). Returns null when the message names
 * neither a file nor a client, state or month, or asks a question, so the chat answers it instead.
 */
export function parseDropReply<E extends LockableEngagement>(message: string, unplacedCount: number, engagements: readonly E[]): DropReply | null {
  if (unplacedCount === 0 || !message.trim()) return null;
  if (REPLY_CANCEL.test(message)) return { cancel: true, assignments: [] };
  // A question is a new question, even when it names a client.
  if (message.trim().endsWith('?')) return null;
  const assignments: DropReplyAssignment[] = [];
  for (const segment of message.split(/\n|;|\.\s+(?=[A-Za-z#])/).map((s) => s.trim()).filter(Boolean)) {
    const split = REPLY_SPLIT.exec(segment);
    const left = split ? segment.slice(0, split.index) : '';
    const right = split ? segment.slice(split.index + split[0].length) : segment;
    let files: number[] | 'all' | null = null;
    const refs = FILE_REFS.exec(split ? left : segment);
    if (refs) files = numbersIn(refs[1]!, unplacedCount);
    else if (split && /^\s*[\d\s,&-]+(?:and[\d\s,&-]+)*$/i.test(left)) files = numbersIn(left, unplacedCount);
    else if (REPLY_ALL.test(left || segment)) files = 'all';
    // The place: the text after the separator, without the file numbers.
    const place = refs && !split ? segment.replace(refs[0], ' ') : right;
    const named = companiesNamed(place, engagements);
    const stateCode = stateFromNames([place]);
    const period = parsePeriodHint(place);
    if (named.length !== 1 && !stateCode && !period) continue;
    if (files === null || (Array.isArray(files) && files.length === 0)) files = unplacedCount === 1 ? [1] : 'all';
    assignments.push({ files, ...(named.length === 1 ? { engagementId: named[0]!.id } : {}), ...(stateCode ? { stateCode } : {}), ...(period ? { period } : {}) });
  }
  return assignments.length > 0 ? { cancel: false, assignments } : null;
}
