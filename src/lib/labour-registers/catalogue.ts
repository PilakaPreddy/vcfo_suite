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
import { FORMS } from '@/data/labour-registers/forms';
import { stateByCode } from '@/data/labour-registers/states';
import { fieldByKey } from '@/data/labour-registers/fields';
import type { FormSpec, Sphere, StateSpec } from '@/data/labour-registers/types';

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
export function formsFor(stateCode: string, period: Period, sphere: Sphere = 'state'): FormSpec[] {
  const state = stateByCode(stateCode);
  if (!state) return [];

  const live = FORMS.filter((f) => appliesDuring(f, period))
    .filter((f) => f.jurisdiction === 'IN' || f.jurisdiction === state.code)
    /*
     * The central rules bind only where the Centre is the appropriate government — railways,
     * mines, major ports, banking, insurance, telecom, central PSUs. An ordinary commercial
     * establishment is in the state sphere and is not subject to them, so producing one of
     * their registers for such a client is a sheet nobody asked for, citing rules that do not
     * govern them.
     *
     * The state forms survive in both spheres: a central-sphere establishment still sits in a
     * state, and its Shops and Establishments obligations do not vanish.
     */
    .filter((f) => sphere === 'central' || f.regime === 'state');

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
 * The canonical dataset fields a set of forms must have from an upload before a register can
 * be produced.
 *
 * Only the fields every payroll has. A pay head not every employer runs — a night shift
 * allowance, a conveyance allowance, overtime — is marked `optional` on the dataset field and
 * is asked for but never demanded, so a client who does not pay one is not held up over a
 * column they will never fill. `optionalFields` returns those separately.
 */
export function requiredFields(forms: FormSpec[]): string[] {
  return inputFields(forms).filter((key) => !fieldByKey(key)?.optional);
}

/** The fields a form will take if the sheet has them, and print nil if it does not. */
export function optionalFields(forms: FormSpec[]): string[] {
  return inputFields(forms).filter((key) => fieldByKey(key)?.optional);
}

/** Every field these forms read from an uploaded sheet, required or not. */
export function inputFields(forms: FormSpec[]): string[] {
  const out = new Set<string>();
  for (const form of forms) {
    for (const col of form.columns) if (col.source === 'input') out.add(col.field);
  }
  return [...out];
}

/**
 * Columns that stay on the form but print nil, because nothing was mapped to them.
 *
 * The column is never removed, and that matters legally: a prescribed form carries its column
 * whatever the client pays, and the research found that an electronic register may change its
 * layout but not its integrity, serial numbering or column contents. (That principle is ours;
 * a November 2026 research pass could not source the phrasing to any rule, so it is applied as
 * a design rule rather than quoted as law.) So an unmapped optional
 * column prints empty and is listed here, where a reviewer can see what went out blank and
 * decide whether that is right.
 */
export function nilColumns(
  form: FormSpec,
  mappedFields: Iterable<string>,
): Array<{ heading: string; field: string }> {
  const mapped = new Set(mappedFields);
  return form.columns
    .filter((c) => c.source === 'input' && fieldByKey(c.field)?.optional && !mapped.has(c.field))
    .map((c) => ({ heading: c.heading, field: c.field }));
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

/** The leave fields no paysheet carries. A form printing one of these needs the leave sheet. */
const LEAVE_FIELDS = new Set(['leavesAvailed', 'leaveBalance', 'leaveKind', 'weekOffs', 'leaveDatesFrom', 'leaveDatesTo']);

/**
 * The forms that cannot be produced without the leave sheet.
 *
 * Leave is kept in an HR system, not in a payroll run, so a leave register built from a
 * paysheet alone comes out with its three substantive columns blank — a form that looks
 * produced and says nothing. The close reports that in the same terms it reports a missing
 * attendance sheet.
 */
export function formsNeedingLeave(forms: FormSpec[]): FormSpec[] {
  return forms.filter((f) => f.columns.some((c) => c.source === 'input' && LEAVE_FIELDS.has(c.field)));
}

/**
 * The longest retention any applicable form demands, in years. Research put the legacy rules
 * at three years (rule 26A of the Minimum Wages Central Rules, rule 80 of the Contract Labour
 * Central Rules) and the codes at five, and found no support for the eight years an earlier
 * draft of this feature assumed. Rule 72 of the OSH rules also forbids destroying a register
 * after its retention period. That reading of rule 72 could not be corroborated in a November
 * 2026 research pass, so the product keeps the behaviour — nothing is ever hard-deleted — as a
 * conservative default rather than as a cited obligation.
 *
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

