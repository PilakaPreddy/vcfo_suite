/**
 * LABOUR REGISTERS — which forms apply, and what they need.
 *
 * The catalogue in `src/data/labour-registers/` is a list of every form we know. This file
 * turns it into an answer to the only question a preparer asks: for this client, in this
 * state, for this month, what has to be produced?
 *
 * The answer is a hybrid, and that is the point. The four labour codes commenced on 21
 * November 2025 and the central rules were notified on 8 May 2026, but none of Telangana,
 * Karnataka, Kerala or Haryana has notified final state rules. A client in those states
 * therefore owes the central code registers AND its state's existing registers for the same
 * month. A generator that picked one stack would under-file.
 */
import { CHECKLIST_HEADS, headById } from '@/data/labour-registers/checklist-heads';
import { FORMS } from '@/data/labour-registers/forms';
import { stateByCode } from '@/data/labour-registers/states';
import { fieldByKey } from '@/data/labour-registers/fields';
import type { FormSpec, StateSpec } from '@/data/labour-registers/types';

/** The period a batch covers, as a first and last day. */
export interface Period {
  /** ISO date of the first day covered. */
  from: string;
  /** ISO date of the last day covered. */
  to: string;
}

/** A calendar month as a period. `month` is 1 to 12. */
export function monthPeriod(year: number, month: number): Period {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Whether a form was in force at any point during a period. */
export function appliesDuring(form: FormSpec, period: Period): boolean {
  if (form.effective.from && form.effective.from > period.to) return false;
  if (form.effective.to && form.effective.to < period.from) return false;
  return true;
}

/**
 * The forms to produce for a state and a period.
 *
 * Returned in filing order: the state's own registers first, because they are what an
 * inspector of that state asks for, then the central code registers, then what remains of the
 * legacy central registers. A form that another form is deemed to satisfy is dropped, so rule
 * 72(3) of the OSH rules saves a near-duplicate sheet rather than producing one.
 */
export function formsFor(stateCode: string, period: Period): FormSpec[] {
  const state = stateByCode(stateCode);
  if (!state) return [];

  const live = FORMS.filter((f) => appliesDuring(f, period)).filter(
    (f) => f.jurisdiction === 'IN' || f.jurisdiction === state.code,
  );

  /* Drop a form whose obligation another live form discharges. */
  const liveIds = new Set(live.map((f) => f.id));
  const kept = live.filter((f) => !(f.deemedSatisfiedBy && liveIds.has(f.deemedSatisfiedBy)));

  const rank: Record<FormSpec['regime'], number> = { state: 0, 'central-code': 1, 'central-legacy': 2 };
  return kept.sort((a, b) => rank[a.regime] - rank[b.regime] || a.id.localeCompare(b.id));
}

/**
 * The forms grouped the way the client's own filing folders are grouped, which is also how the
 * downloaded archive is laid out. Keeping the firm's existing folder names means a staff
 * member recognises the archive without being taught it.
 */
export function formsByAct(forms: FormSpec[]): Array<{ act: string; forms: FormSpec[] }> {
  const groups = new Map<string, FormSpec[]>();
  for (const f of forms) {
    const list = groups.get(f.act) ?? [];
    list.push(f);
    groups.set(f.act, list);
  }
  return [...groups.entries()].map(([act, list]) => ({ act, forms: list }));
}

/**
 * The canonical dataset fields a set of forms needs from an upload, given the heads the
 * client's payroll checklist has ticked.
 *
 * This is what makes the checklist load-bearing rather than decorative: an unticked head
 * removes its columns from the demand, so a client who pays no night shift allowance is never
 * asked to map one, and no register goes out with an empty statutory column.
 */
export function requiredFields(forms: FormSpec[], activeHeads: Iterable<string>): string[] {
  const on = new Set(activeHeads);
  const out = new Set<string>();
  for (const form of forms) {
    for (const col of form.columns) {
      if (col.source !== 'input' && col.source !== 'checklist') continue;
      /* A column may be gated two ways, and both have to be honoured. The form can say so
         directly (`requiresHead`), and the dataset field can carry its own governing head —
         a prescribed form names an overtime column outright, so the gate lives on the field
         rather than on that column. Either one being off means the data is not demanded. */
      const gate = col.requiresHead ?? fieldByKey(col.field)?.head;
      if (gate && !on.has(gate)) continue;
      out.add(col.field);
    }
  }
  return [...out];
}

/**
 * Columns that stay on the form but print nil, because the head that would fill them is off.
 *
 * This is the difference between the two ways a column can be absent, and it matters
 * legally. A column the prescribed form carries is printed whatever the client pays, with a
 * nil in it — removing it would alter a statutory layout, and the research found that an
 * electronic register may change its layout but not its "integrity, serial number and column
 * contents". A column the catalogue itself marks `checklist` is one we add for the client's
 * own benefit, and that one simply does not appear.
 */
export function nilColumns(form: FormSpec, activeHeads: Iterable<string>): Array<{ heading: string; head: string }> {
  const on = new Set(activeHeads);
  return form.columns
    .filter((c) => {
      if (c.source !== 'input') return false;
      const gate = fieldByKey(c.field)?.head;
      return Boolean(gate && !on.has(gate));
    })
    .map((c) => ({ heading: c.heading, head: headById(fieldByKey(c.field)!.head!)?.label ?? fieldByKey(c.field)!.head! }));
}

/** The fields a set of forms fills from the client record rather than an upload. */
export function masterFields(forms: FormSpec[]): string[] {
  const out = new Set<string>();
  for (const form of forms) {
    for (const col of form.columns) if (col.source === 'master') out.add(col.field);
  }
  return [...out];
}

/** True when any applicable form carries a per-day block, so attendance is required. */
export function needsAttendanceGrid(forms: FormSpec[]): boolean {
  return forms.some((f) => f.columns.some((c) => c.source === 'grid'));
}

/** The forms that cannot be produced without the per-day block, for the "no sheet" dialog. */
export function formsNeedingAttendance(forms: FormSpec[]): FormSpec[] {
  return forms.filter((f) => f.columns.some((c) => c.source === 'grid'));
}

/**
 * The columns of a form that a given checklist leaves out. Printed on the batch so a reviewer
 * can see what was omitted and why, rather than wondering where a column went.
 */
export function omittedColumns(form: FormSpec, activeHeads: Iterable<string>): Array<{ heading: string; head: string }> {
  const on = new Set(activeHeads);
  return form.columns
    .filter((c) => c.source === 'checklist' && c.requiresHead && !on.has(c.requiresHead))
    .map((c) => ({ heading: c.heading, head: headById(c.requiresHead!)?.label ?? c.requiresHead! }));
}

/**
 * The longest retention any applicable form demands, in years. Research put the legacy rules
 * at three years (rule 26A of the Minimum Wages Central Rules, rule 80 of the Contract Labour
 * Central Rules) and the codes at five, and found no support for the eight years an earlier
 * draft of this feature assumed. Rule 72 of the OSH rules also forbids destroying a register
 * after the period unless it has been properly transferred, so nothing is ever hard-deleted —
 * this number drives a review prompt, not a delete job.
 */
export function retentionYears(forms: FormSpec[]): number {
  return forms.reduce((max, f) => Math.max(max, f.retentionYears), 0);
}

/**
 * What the catalogue screen says about a state's position. A state at draft stage gets the
 * hybrid warning, because that is the difference between a complete filing and a short one.
 */
export function regimeSummary(state: StateSpec, period: Period): { hybrid: boolean; stateForms: number; centralForms: number } {
  const forms = formsFor(state.code, period);
  return {
    hybrid: state.codeRules !== 'notified',
    stateForms: forms.filter((f) => f.regime === 'state').length,
    centralForms: forms.filter((f) => f.regime !== 'state').length,
  };
}

/** Every head id the catalogue knows, for validating a stored checklist. */
export function knownHeadIds(): Set<string> {
  return new Set(CHECKLIST_HEADS.map((h) => h.id));
}
