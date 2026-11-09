import { RUN_OVER_BUDGET_COPY } from '@/lib/ask/do/run-context';
import { maskIdentityNumbers } from '@/lib/ask/mask';
import type { DropGroup, DropState } from './types';

/**
 * The drop's messages in the chat: the closing message the job writes, and the answer to a "Where
 * should these go?" reply. One line per card, then the files that need an answer (numbered, so the
 * person can reply "file 3 is Acme"), then what was not read or left out. Identity numbers are
 * masked, and the text fits the answer envelope's 1,200 characters.
 */

export const NOT_READ_BUDGET = 'Not read: the drop used up its reading budget.';
export const NOT_SORTED_BUDGET = 'Not sorted: the drop used up its reading budget.';

const LINE_MAX = 1200;
const UNPLACED_SHOWN = 8;
const CARDS_LINKED = 3;

const listOf = (items: string[], max: number) => {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} and ${items.length - max} more` : shown;
};

/*
 * The answer carries the first card itself, so a single card needs no link; with two or three cards
 * each line names where its card opens. More than that would not fit the message, and the drop's own
 * panel lists every card.
 */

/** Where a card opens for this role: the role's own Ask page with the card in the address. */
export function cardHref(role: string, changesetId: string): string {
  const area = role === 'super_admin' ? 'super' : role;
  return `/app/${area}/ask?changeset=${changesetId}`;
}

function cardLines(state: Pick<DropState, 'groups' | 'files'>, role: string | undefined): string[] {
  const { groups, files } = state;
  if (groups.length === 0) return [];
  const line = (g: DropGroup) => {
    const count = files.filter((f) => f.status === 'placed' && f.engagementId === g.engagementId).length;
    const link = role && groups.length > 1 && groups.length <= CARDS_LINKED ? ` (${cardHref(role, g.changesetId)})` : '';
    return `${g.companyName}${count > 0 ? `, ${count} file${count === 1 ? '' : 's'}` : ''}${link}`;
  };
  if (groups.length === 1) return [`I prepared a card for ${line(groups[0]!)}. Nothing is saved until you accept.`];
  return [`I prepared ${groups.length} cards, one for each client: ${groups.map(line).join('; ')}. Nothing is saved until you accept.`];
}

/** The numbered "Where should these go?" question, or nothing when every file found its place. */
export function whereQuestion(state: Pick<DropState, 'unplaced'>): string | null {
  const { unplaced } = state;
  if (unplaced.length === 0) return null;
  const shown = unplaced.slice(0, UNPLACED_SHOWN).map((u, i) => `${i + 1}. ${u.path}: ${u.reason}`);
  const more = unplaced.length > UNPLACED_SHOWN ? ` And ${unplaced.length - UNPLACED_SHOWN} more.` : '';
  return `Where should ${unplaced.length === 1 ? 'this' : 'these'} go? ${shown.join(' ')}${more} Reply like "file 1 is Acme, Karnataka, Aug 2026" or "all of them are Acme".`;
}

/** The closing message: one line per card, the files that need an answer, and what was not read. */
export function dropSummaryLine(state: DropState, opts: { role?: string } = {}): string {
  const parts: string[] = [...cardLines(state, opts.role)];
  const { groups, unplaced, files } = state;
  const question = whereQuestion(state);
  if (question) parts.push(question);
  const unread = files.filter((f) => f.reason === NOT_READ_BUDGET).map((f) => f.path);
  const unsorted = files.filter((f) => f.reason === NOT_SORTED_BUDGET).map((f) => f.path);
  if (state.overBudget) {
    parts.push(`${RUN_OVER_BUDGET_COPY}${unread.length > 0 ? ` Not read: ${listOf(unread, 5)}.` : ''}${unsorted.length > 0 ? ` Not sorted: ${listOf(unsorted, 5)}.` : ''}`);
  }
  const failed = files.filter((f) => (f.status === 'failed' || f.status === 'skipped') && f.reason !== NOT_READ_BUDGET && f.reason !== NOT_SORTED_BUDGET);
  if (failed.length > 0) parts.push(`${failed.length === 1 ? 'One file was' : `${failed.length} files were`} left out: ${listOf(failed.map((f) => `${f.path} (${f.reason ?? 'not read'})`), 3)}.`);
  for (const note of state.notes ?? []) if (!parts.includes(note)) parts.push(note);
  if (groups.length === 0 && unplaced.length === 0 && parts.length === 0) parts.push('I found nothing to file in these files. Nothing was saved.');
  return truncate(maskIdentityNumbers(parts.join(' ')));
}

/** The answer to a "where" reply: what moved onto which card, and what still waits. */
export function dropReplyLine(state: DropState, placed: number, opts: { role?: string } = {}): string {
  const parts: string[] = [];
  if (placed > 0) parts.push(`Done: I added ${placed} file${placed === 1 ? '' : 's'} to the cards. Nothing is saved until you accept.`);
  else parts.push('I could not place those files from that reply.');
  parts.push(...cardLines(state, opts.role).map((l) => l.replace(/ Nothing is saved until you accept\.$/, '')));
  const question = whereQuestion(state);
  if (question) parts.push(question);
  for (const note of state.notes ?? []) if (!parts.includes(note)) parts.push(note);
  return truncate(maskIdentityNumbers(parts.join(' ')));
}

function truncate(text: string): string {
  return text.length <= LINE_MAX ? text : `${text.slice(0, LINE_MAX - 1).trimEnd()}…`;
}
