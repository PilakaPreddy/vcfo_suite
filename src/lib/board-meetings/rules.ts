import { FIXED_END, FIXED_TOP, CIRCULATION_ITEM, type AgendaItem, type MeetingType } from './model';

/**
 * BOARD MEETING RULES — meeting numbers, quorum (Sec 174) and agenda placeholders.
 */

const SKIP = new Set(['and', 'of', 'the', '&']);

/** "NetDocuments India Private Limited" → "NIPL". Letters only, at most 6. */
export function companyPrefix(companyName: string): string {
  const words = companyName
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !SKIP.has(w.toLowerCase()));
  const prefix = words.map((w) => w[0]!.toUpperCase()).join('').slice(0, 6);
  return prefix || 'CO';
}

/** Indian financial year label of a date: 2026-09-10 → "2026-27"; 2027-02-01 → "2026-27". */
export function fyLabel(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** "NIPL/BM/02/2026-27". `seq` is the board meeting number within the financial year. */
export function meetingNumber(prefix: string, seq: number, fy: string, kind: 'board' | 'agm' | 'egm' = 'board'): string {
  const tag = kind === 'board' ? 'BM' : kind === 'agm' ? 'AGM' : 'EGM';
  return `${prefix}/${tag}/${String(seq).padStart(2, '0')}/${fy}`;
}

/** Sec 174: one third of the directors or two, whichever is more (never more than all). */
export function quorumNeeded(directorCount: number): number {
  if (directorCount <= 0) return 0;
  return Math.min(directorCount, Math.max(2, Math.ceil(directorCount / 3)));
}

export type QuorumState = 'ok' | 'at_risk' | 'lost';

/**
 * From the replies: enough "yes" → ok; not enough yet but the open replies could still make it
 * → at risk; not enough even if everyone still open says yes → lost.
 */
export function quorumForecast(replies: Array<'yes' | 'no' | null>): { state: QuorumState; attending: number; needed: number; open: number } {
  const needed = quorumNeeded(replies.length);
  const attending = replies.filter((r) => r === 'yes').length;
  const open = replies.filter((r) => r === null).length;
  if (attending >= needed) return { state: 'ok', attending, needed, open };
  return { state: attending + open >= needed ? 'at_risk' : 'lost', attending, needed, open };
}

const BLANK = /\[[^\]]+\]/g;

/** "[date]" and similar fields still to fill in a text. */
export function placeholdersIn(text: string): string[] {
  return text.match(BLANK) ?? [];
}

/** Every unfilled field in an agenda, item text and sub-points. */
export function agendaPlaceholders(agenda: AgendaItem[]): string[] {
  return agenda.flatMap((a) => [...placeholdersIn(a.text), ...a.subs.flatMap(placeholdersIn)]);
}

/** Split a text into plain and field parts for highlighting. */
export function splitPlaceholders(text: string): Array<{ text: string; blank: boolean }> {
  return text
    .split(/(\[[^\]]+\])/)
    .filter((x) => x)
    .map((x) => ({ text: x, blank: /^\[[^\]]+\]$/.test(x) }));
}

let keySeq = 0;
/** A stable-enough unique key for a new agenda row. */
export function newAgendaKey(): string {
  keySeq += 1;
  return `a${Date.now().toString(36)}${keySeq.toString(36)}`;
}

export interface LibraryLike {
  id: string;
  wording: string;
}

/** Turn library wording into notice wording: drop the trailing full stop (the notice adds it). */
export function agendaTextOf(wording: string): string {
  return wording.trim().replace(/\.\s*$/, '');
}

/**
 * Put the agenda in order: fixed top items first (in the type's order), the lead's items, then
 * the fixed end items. Missing fixed items are added from the library; nothing is dropped.
 */
export function normaliseAgenda(agenda: AgendaItem[], type: MeetingType, library: Map<string, LibraryLike>): AgendaItem[] {
  const top = FIXED_TOP[type];
  const byLib = new Map(agenda.filter((a) => a.libraryId).map((a) => [a.libraryId!, a]));
  const make = (id: string, fixed: 'top' | 'end'): AgendaItem | null => {
    const have = byLib.get(id);
    if (have) return { ...have, fixed };
    const lib = library.get(id);
    return lib ? { key: `fx-${id}`, libraryId: id, text: agendaTextOf(lib.wording), subs: [], fixed } : null;
  };
  const head = top.map((id) => make(id, 'top')).filter((x): x is AgendaItem => Boolean(x));
  const tail = FIXED_END.map((id) => make(id, 'end')).filter((x): x is AgendaItem => Boolean(x));
  const fixedIds = new Set([...top, ...FIXED_END]);
  const middle = agenda.filter((a) => !a.libraryId || !fixedIds.has(a.libraryId)).map((a) => ({ ...a, fixed: undefined }));
  return [...head, ...middle, ...tail];
}

/** Put carried-forward resolutions as sub-points of the circulation item. */
export function withCarriedResolutions(agenda: AgendaItem[], lines: string[]): AgendaItem[] {
  if (lines.length === 0) return agenda;
  return agenda.map((a) => {
    if (a.libraryId !== CIRCULATION_ITEM) return a;
    const keep = a.subs.filter((s) => !lines.includes(s));
    return { ...a, subs: [...lines, ...keep] };
  });
}
