/**
 * Step progress and pre-fill notes for the client's step page (G-10). Both are DERIVED from the
 * checklist definitions and the current answers; nothing new is stored and the ported checklist
 * code is only read.
 *
 * Sub-steps: a step's client-visible fields, grouped by section when it has two or more,
 * else one per field (two to eight fields), else its `infoRequired` lines. A group is done
 * when one of its fields has an answer; the first open group is "now".
 *
 * Pre-fill notes ("Copied from step n"), only where the source is knowable:
 *  - the same field id is defined on an earlier step of the journey and both hold the same
 *    non-empty answer (for example the LUT fields that GST Registration and LUT Filing share);
 *  - the Registered Office step records where it seeded its address (`registeredOfficeSource`):
 *    project setup, or the old Director KYC step that is no longer a numbered step.
 * A field with no knowable source gets no note.
 */
import { getIncorporationPhases, type ChecklistField, type ChecklistItem } from '@/data/checklist';
import { extractItemResponses, getClientResponseFields, isStepRemarksField } from '@/lib/checklist/checklist-responses';
import { filterFieldsByViewer } from '@/lib/checklist/checklist-field-access';
import { isLeadOnlyField } from '@/lib/incorporation/pre-inc-direct-flow';
import {
  REGISTERED_OFFICE_FIELD_IDS,
  REGISTERED_OFFICE_SOURCE_FIELD_ID,
} from '@/lib/checklist/registered-office-responses';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';

export type SubStepState = 'done' | 'now' | 'todo';

export interface SubStep {
  /** Short label (about 22 characters). */
  l: string;
  s: SubStepState;
}

/** Where the step stands as a whole: finished, not open yet, or open. */
export type StepStage = 'done' | 'up' | 'live';

type Responses = Record<string, string | undefined>;

/** Prototype `short()`: a label cut to about 22 characters. */
export function shortLabel(l: string): string {
  const t = String(l).replace(/\s*\(.*$/, '').replace(/,.*$/, '').replace(/\s+—.*$/, '');
  return t.length > 22 ? `${t.slice(0, 20).replace(/\s+\S*$/, '')}…` : t;
}

function clientFields(item: ChecklistItem): ChecklistField[] {
  // The project lead's own fields (Part A NIC codes) are not a client sub-step.
  return filterFieldsByViewer(getClientResponseFields(item), 'client').filter(
    (f) => !isStepRemarksField(f) && !isLeadOnlyField(item.id, f.id),
  );
}

/** The sub-steps of one step, with their state from the current answers. */
export function subStepsOf(item: ChecklistItem, responses: Responses, stage: StepStage): SubStep[] {
  const fields = clientFields(item);
  const filled = (id: string) => String(responses[id] ?? '').trim().length > 0;
  let groups: Array<{ l: string; ids: string[] }>;
  const sections = [...new Set(fields.map((f) => f.section).filter(Boolean))] as string[];
  if (sections.length >= 2) {
    groups = sections.map((sec) => ({ l: shortLabel(sec), ids: fields.filter((f) => f.section === sec).map((f) => f.id) }));
  } else if (fields.length >= 2 && fields.length <= 8) {
    groups = fields.map((f) => ({ l: shortLabel(f.label), ids: [f.id] }));
  } else if (item.infoRequired.length) {
    groups = item.infoRequired.slice(0, 8).map((q) => ({ l: shortLabel(q.split(' — ')[0] ?? q), ids: [] }));
  } else groups = [{ l: shortLabel(item.title), ids: [] }];
  if (stage === 'done') return groups.map((g) => ({ l: g.l, s: 'done' }));
  if (stage === 'up') return groups.map((g) => ({ l: g.l, s: 'todo' }));
  let now = false;
  return groups.map((g) => {
    if (g.ids.length > 0 && g.ids.some(filled)) return { l: g.l, s: 'done' };
    if (!now) {
      now = true;
      return { l: g.l, s: 'now' };
    }
    return { l: g.l, s: 'todo' };
  });
}

/** "2 of 5" for a list of sub-steps. */
export function subStepCount(subs: SubStep[]): { done: number; total: number } {
  return { done: subs.filter((x) => x.s === 'done').length, total: subs.length };
}

/* ------------------------------------------------------------- pre-fill notes */

/** The journey's steps in order, numbered from 1 the way the client portal numbers them. */
function journey(): Array<{ n: number; item: ChecklistItem }> {
  let n = 0;
  return getIncorporationPhases().flatMap((p) => p.items.map((item) => ({ n: (n += 1), item })));
}

/** Every answer field of a step (any filler), remarks left out: the pre-fill notes cover all rows shown. */
function answerFields(item: ChecklistItem): ChecklistField[] {
  return getClientResponseFields(item).filter((f) => !isStepRemarksField(f));
}

const REGISTERED_OFFICE_STEP = 'pre-14';
const PROJECT_SETUP_FIELDS = new Set(['registeredOfficeCompleteAddress']);

/**
 * Notes for the fields of `itemId` whose answer was copied from somewhere knowable, keyed by
 * field id. `state` is the client's (redacted) checklist state.
 */
export function prefillNotes(
  itemId: string,
  state: Record<string, ChecklistItemStateSlice | undefined> | null | undefined,
): Record<string, string> {
  const steps = journey();
  const at = steps.findIndex((x) => x.item.id === itemId);
  if (at < 0) return {};
  const here = steps[at]!.item;
  const mine = extractItemResponses(here, state?.[itemId]) as Responses;
  const val = (r: Responses, id: string) => String(r[id] ?? '').trim();
  const notes: Record<string, string> = {};

  // 1. a field defined on an earlier step with the same answer
  const earlier = steps.slice(0, at).map((x) => ({ ...x, ids: new Set(answerFields(x.item).map((f) => f.id)) }));
  for (const f of answerFields(here)) {
    if (f.type === 'repeat') continue;
    const v = val(mine, f.id);
    if (!v) continue;
    // the nearest earlier step that defines the same field wins
    for (let i = earlier.length - 1; i >= 0; i -= 1) {
      const src = earlier[i]!;
      if (!src.ids.has(f.id)) continue;
      const theirs = val(extractItemResponses(src.item, state?.[src.item.id]) as Responses, f.id);
      if (theirs && theirs === v) notes[f.id] = `Copied from step ${src.n} · ${src.item.title}`;
      break;
    }
  }

  // 2. the Registered Office step's recorded seed
  if (itemId === REGISTERED_OFFICE_STEP) {
    const raw = (state?.[itemId]?.responses ?? {}) as Responses;
    const source = val(mine, REGISTERED_OFFICE_SOURCE_FIELD_ID) || val(raw, REGISTERED_OFFICE_SOURCE_FIELD_ID);
    const seeded =
      source === 'project-setup'
        ? { ids: PROJECT_SETUP_FIELDS, note: 'Copied from project setup' }
        : source === 'director-kyc'
          ? { ids: new Set<string>(REGISTERED_OFFICE_FIELD_IDS), note: 'Copied from the earlier Director KYC step' }
          : null;
    if (seeded) for (const id of seeded.ids) if (val(mine, id) && !notes[id]) notes[id] = seeded.note;
  }
  return notes;
}
