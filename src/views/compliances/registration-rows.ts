import { coerceStatusCode, getRegistrationPhases, type ChecklistItem, type StatusCode } from '@/data/checklist';
import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import { extractItemResponses, getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { coerceRegistrationWorkflowStage, type RegistrationWorkflowStage } from '@/lib/incorporation/registration-workflow';
import { computeDueDate } from '@/lib/projects/deadlines';
import { windowForStep } from '@/lib/projects/schedule-windows';
import { REG_ROWS } from '@/lib/client-portal/credentials';
import type { Owner } from '@/components/ui/spectrum-chip';
import { daysUntil, plainDate, type SixWord } from '@/views/compliances/spectrum-status';

/**
 * REGISTRATIONS for the staff portals — pure logic over data already in hand.
 *
 * One row per registration-phase checklist step (phase 4, `getRegistrationPhases`)
 * per engagement in the caller's roster. The roster comes from `useApp()`,
 * already scoped by `AuthContext` (a lead's assignments, a manager's projects,
 * the firm), and the step state from `getStateForEngagement`. Nothing is
 * invented: the status is the step's own status code, the dates are the
 * step's completion date, its registration date answer, its manager window
 * and the checklist's own deadline rule, and a registration number is shown
 * only when the step's answers or the credentials workbook hold one.
 */

export type RegCategory = 'Tax' | 'Labour' | 'Business' | 'IP' | 'FEMA';
export const REG_CATEGORIES: RegCategory[] = ['Tax', 'Labour', 'Business', 'IP', 'FEMA'];

/** Category and authority per step (the same table as the client portal's registrations card). */
const REG_META: Record<string, [RegCategory, string]> = {
  'reg-4': ['Tax', 'GSTN'],
  'reg-5': ['Tax', 'GSTN'],
  'reg-1': ['Labour', 'EPFO'],
  'reg-3': ['Labour', 'ESIC'],
  'reg-7': ['Labour', 'State PT department'],
  'reg-9': ['Labour', 'State Labour Dept'],
  'reg-13': ['Labour', 'Labour Dept'],
  'reg-14': ['Labour', 'Local Committee'],
  'reg-15': ['Business', 'Ministry of MSME'],
  'reg-8': ['Business', 'DGFT'],
  'reg-10': ['Business', 'Municipal corporation'],
  'reg-6': ['Business', 'LEIL'],
  'reg-16': ['Business', 'CBIC · ICEGATE'],
  'reg-11': ['Business', 'STPI'],
  'reg-19': ['Business', 'ICDR'],
  'reg-12': ['IP', 'IP India'],
  'reg-17': ['IP', 'IP India'],
  'reg-18': ['IP', 'IP India'],
  'reg-20': ['FEMA', 'RBI · FIRMS'],
  'reg-21': ['FEMA', 'RBI · FIRMS'],
  'reg-22': ['FEMA', 'RBI · FIRMS'],
  'reg-23': ['FEMA', 'RBI'],
  'reg-24': ['FEMA', 'RBI · FIRMS'],
};

/** Credentials workbook "Registrations" row key for a step, matched on the shared title. */
const WORKBOOK_ROW_BY_TITLE = new Map(REG_ROWS.map(([key, label]) => [label.toLowerCase(), key]));
export function workbookRowKey(item: Pick<ChecklistItem, 'title'>): string | undefined {
  return WORKBOOK_ROW_BY_TITLE.get(item.title.toLowerCase());
}

/** "Due in the next 15 days" (owner decision for the Registrations rail). */
const REG_SOON_DAYS = 15;

export type RegWord = SixWord | 'Not needed';

export interface RegistrationRow {
  /** `${engagementId}~${itemId}`, the record id in the URL. */
  key: string;
  engagement: Engagement;
  item: ChecklistItem;
  /** Step number inside the registration phase. */
  step: number;
  name: string;
  category: RegCategory;
  authority: string;
  form: string | null;
  code: StatusCode;
  word: RegWord;
  stage?: RegistrationWorkflowStage;
  /** Whose move it is: client, SBC, or the authority (MCA tone, "Authority"). */
  owner: Owner | null;
  assigneeId?: string;
  completedOn?: string;
  registrationDate?: string;
  /** The checklist deadline rule from the incorporation date, or the window end. */
  dueDate?: string;
  window?: { from: string; to: string };
  /** Number from the step's answers, when the answers in hand hold one. */
  number?: string;
}

export function registrationKey(engagementId: string, itemId: string): string {
  return `${engagementId}~${itemId}`;
}

export function parseRegistrationKey(key: string): { engagementId: string; itemId: string } | null {
  const at = key.lastIndexOf('~');
  if (at <= 0 || at === key.length - 1) return null;
  return { engagementId: key.slice(0, at), itemId: key.slice(at + 1) };
}

function isoOf(value: string | undefined | null): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/** The step's answers for its number and its registration date, when present. */
function answersOf(item: ChecklistItem, slice: ChecklistItemStateSlice | undefined): { number?: string; date?: string } {
  if (!slice?.responses) return {};
  const fields = getClientResponseFields(item);
  const resp = extractItemResponses(item, slice);
  const numF = fields.find((f) => /(number|arn|code|gstin)$/i.test(f.id) && f.type !== 'file');
  const dateF = fields.find((f) => /(registration|filing)Date$/i.test(f.id)) ?? fields.find((f) => /Date$/.test(f.id));
  const number = numF ? resp[numF.id]?.trim() || undefined : undefined;
  const date = dateF ? isoOf(resp[dateF.id]) : undefined;
  return { number, date };
}

function wordOf(code: StatusCode, slice: ChecklistItemStateSlice | undefined, dueDate: string | undefined, now: Date): RegWord {
  if (code === 'not-applicable') return 'Not needed';
  if (code === 'completed') return 'Done';
  if (code === 'overdue') return 'Overdue';
  if (code === 'awaiting-client') return 'Waiting';
  const fill = slice?.clientFillRequest;
  if (fill?.status === 'approved' && !fill.fulfilledAt) return 'Waiting';
  const days = dueDate ? daysUntil(dueDate, now) : null;
  if (days !== null && days < 0) return 'Overdue';
  if (code === 'in-progress' || slice?.reviewStatus === 'reviewing') return 'In progress';
  if (days !== null && days <= REG_SOON_DAYS) return 'Due soon';
  return 'Not started';
}

function ownerOf(word: RegWord, stage: RegistrationWorkflowStage | undefined): Owner | null {
  if (word === 'Done' || word === 'Not needed') return null;
  if (word === 'Waiting') return 'client';
  if (stage === 'collection') return 'client';
  if (stage === 'approval') return 'mca';
  return 'sbc';
}

export function registrationRows(
  engagements: readonly Engagement[],
  stateFor: (engagement: Engagement) => Record<string, ChecklistItemStateSlice> | undefined,
  now: Date,
): RegistrationRow[] {
  const items = getRegistrationPhases().flatMap((phase) => phase.items);
  const out: RegistrationRow[] = [];
  for (const engagement of engagements) {
    const state = stateFor(engagement) ?? {};
    const incorporated = engagement.incorporationDate ? new Date(`${engagement.incorporationDate.slice(0, 10)}T00:00:00Z`) : null;
    items.forEach((item, index) => {
      const slice = state[item.id];
      const code = coerceStatusCode(slice?.status);
      const win = windowForStep(engagement.schedule, item.id);
      const ruleDue = computeDueDate(item.deadline, incorporated && !Number.isNaN(incorporated.getTime()) ? incorporated : null);
      const dueDate = win?.to ?? (ruleDue ? ruleDue.toISOString().slice(0, 10) : undefined);
      const stage = coerceRegistrationWorkflowStage(slice?.workflowStage);
      const word = wordOf(code, slice, dueDate, now);
      const answers = answersOf(item, slice);
      const [category, authority] = REG_META[item.id] ?? ['Business', 'SBC'];
      out.push({
        key: registrationKey(engagement.id, item.id),
        engagement,
        item,
        step: index + 1,
        name: item.title,
        category,
        authority,
        form: item.forms[0] ?? null,
        code,
        word,
        stage,
        owner: ownerOf(word, stage),
        assigneeId: slice?.assigneeId,
        completedOn: isoOf(slice?.completedOn),
        registrationDate: answers.date,
        dueDate,
        window: win ? { from: win.from, to: win.to } : undefined,
        number: answers.number,
      });
    });
  }
  return out;
}

/** Not done, not needed, and due today or within the next 15 days (or already late). */
export function regDueSoon(row: RegistrationRow, now: Date): boolean {
  if (row.word === 'Done' || row.word === 'Not needed' || !row.dueDate) return false;
  const days = daysUntil(row.dueDate, now);
  return days !== null && days <= REG_SOON_DAYS;
}

export interface RegFlow {
  documents: number;
  application: number;
  review: number;
  granted: number;
}

/**
 * Progress flow from the registration workflow stage (Client → VCFO →
 * Department): documents (collection, or waiting on the client), application
 * (filing), authority review (approval) and granted (done). A started step
 * with no stage recorded counts as application.
 */
export function regFlow(rows: RegistrationRow[]): RegFlow {
  const out: RegFlow = { documents: 0, application: 0, review: 0, granted: 0 };
  for (const r of rows) {
    if (r.word === 'Not needed') continue;
    if (r.word === 'Done') out.granted += 1;
    else if (r.stage === 'approval') out.review += 1;
    else if (r.stage === 'collection' || r.word === 'Waiting') out.documents += 1;
    else if (r.stage === 'filing' || r.word === 'In progress') out.application += 1;
  }
  return out;
}

/** The date a row shows: done on, due by, or how late it is. */
export function regDateLabel(r: RegistrationRow, now: Date): { text: string; className?: string } {
  if (r.word === 'Done') return { text: plainDate(r.registrationDate ?? r.completedOn, now) };
  if (r.word === 'Not needed' || !r.dueDate) return { text: '—' };
  const days = daysUntil(r.dueDate, now);
  if (days !== null && days < 0) return { text: `${-days}d late`, className: 'font-medium text-danger' };
  return { text: `By ${plainDate(r.dueDate, now)}`, className: r.word === 'Waiting' ? 'font-medium text-waiting' : undefined };
}
