/**
 * MCA FILING STATE — pure. The states one SPICe+ filing moves through, who acts next, the moves
 * allowed, and the statutory clocks. No database and no React, so a client component can use it.
 *
 * Suite only records what people did. It never drives the MCA portal, stores no MCA login, OTP,
 * DSC PIN or token, and software never signs.
 */

export const FILING_FORMS = ['spice-part-a', 'spice-part-b'] as const;
export type FilingForm = (typeof FILING_FORMS)[number];

export const FILING_STATES = [
  'data_ready',
  'part_a_filling',
  'part_a_submitted',
  'name_approved',
  'part_b_filling',
  'pdf_review',
  'awaiting_signatures',
  'signed_ready',
  'upload_pending',
  'payment_pending',
  'submitted',
  'approved',
  'resubmit',
  'cancelled',
] as const;
export type FilingState = (typeof FILING_STATES)[number];

export const FILING_FORM_LABEL: Record<FilingForm, string> = {
  'spice-part-a': 'SPICe+ Part A',
  'spice-part-b': 'SPICe+ Part B',
};

export const FILING_STATE_LABEL: Record<FilingState, string> = {
  data_ready: 'Data ready',
  part_a_filling: 'Part A being filled',
  part_a_submitted: 'Part A submitted',
  name_approved: 'Name approved',
  part_b_filling: 'Part B being filled',
  pdf_review: 'PDF review',
  awaiting_signatures: 'Awaiting signatures',
  signed_ready: 'Signed PDF ready',
  upload_pending: 'Upload pending',
  payment_pending: 'Payment pending',
  submitted: 'Submitted',
  approved: 'Approved',
  resubmit: 'Resubmission needed',
  cancelled: 'Cancelled',
};

export type NextActor = 'lead' | 'professional' | 'signers' | 'mca' | 'nobody';

export interface NextAction {
  who: NextActor;
  whoLabel: string;
  what: string;
}

const ACTIONS: Record<FilingState, NextAction> = {
  data_ready: { who: 'lead', whoLabel: 'Project lead', what: 'Clear the missing values, then start filling the form with VCFO Assist.' },
  part_a_filling: { who: 'lead', whoLabel: 'Project lead', what: 'Check the filled Part A on the MCA portal and submit it yourself.' },
  part_a_submitted: { who: 'mca', whoLabel: 'MCA', what: 'Wait for the name decision, then record it here.' },
  name_approved: { who: 'lead', whoLabel: 'Project lead', what: 'Start Part B before the name approval lapses.' },
  part_b_filling: { who: 'lead', whoLabel: 'Project lead', what: 'Finish Part B on the MCA portal, record the SRN and add the PDF the portal gives.' },
  pdf_review: { who: 'professional', whoLabel: 'Professional', what: 'Read the PDF against the comparison below and record your approval.' },
  awaiting_signatures: { who: 'signers', whoLabel: 'Signers', what: 'Each signer signs the PDF with their own DSC. Add the signed PDF here.' },
  signed_ready: { who: 'lead', whoLabel: 'Project lead', what: 'Upload the signed PDF to the MCA portal yourself.' },
  upload_pending: { who: 'lead', whoLabel: 'Project lead', what: 'Finish the upload on the MCA portal and record it here.' },
  payment_pending: { who: 'lead', whoLabel: 'Project lead', what: 'Pay the MCA fee on the portal and record the date here.' },
  submitted: { who: 'mca', whoLabel: 'MCA', what: 'Wait for the ROC decision, then record it here.' },
  approved: { who: 'nobody', whoLabel: 'Nobody', what: 'The filing is approved. Nothing is left to do here.' },
  resubmit: { who: 'lead', whoLabel: 'Project lead', what: 'Read the ROC remark, correct the form and take it through review again.' },
  cancelled: { who: 'nobody', whoLabel: 'Nobody', what: 'The filing is cancelled.' },
};

const AFTER_APPROVAL: NextAction = { who: 'lead', whoLabel: 'Project lead', what: 'The PDF is approved. Email it to the signers.' };

/** Who acts next. A PDF under review that is already approved waits on the lead, not the professional. */
export function nextAction(state: FilingState, approved = false): NextAction {
  return state === 'pdf_review' && approved ? AFTER_APPROVAL : ACTIONS[state];
}

/** The states each form can be in. Part A ends at the name decision. */
const PART_A_ONLY: ReadonlySet<FilingState> = new Set(['part_a_filling', 'part_a_submitted', 'name_approved']);
const BOTH: ReadonlySet<FilingState> = new Set(['data_ready', 'resubmit', 'cancelled']);

export function stateFitsForm(form: FilingForm, state: FilingState): boolean {
  if (BOTH.has(state)) return true;
  return form === 'spice-part-a' ? PART_A_ONLY.has(state) : !PART_A_ONLY.has(state);
}

const MOVES: Record<FilingState, readonly FilingState[]> = {
  data_ready: ['part_a_filling', 'part_b_filling', 'cancelled'],
  part_a_filling: ['part_a_submitted', 'data_ready', 'cancelled'],
  part_a_submitted: ['name_approved', 'resubmit', 'cancelled'],
  name_approved: ['resubmit', 'cancelled'],
  part_b_filling: ['pdf_review', 'data_ready', 'cancelled'],
  pdf_review: ['awaiting_signatures', 'part_b_filling', 'cancelled'],
  awaiting_signatures: ['signed_ready', 'pdf_review', 'cancelled'],
  signed_ready: ['upload_pending', 'payment_pending', 'awaiting_signatures', 'pdf_review', 'cancelled'],
  upload_pending: ['payment_pending', 'signed_ready', 'cancelled'],
  payment_pending: ['submitted', 'upload_pending', 'cancelled'],
  submitted: ['approved', 'resubmit'],
  approved: [],
  resubmit: ['part_a_filling', 'part_b_filling', 'pdf_review', 'cancelled'],
  cancelled: ['data_ready'],
};

/** The moves a person may make now, for the buttons. */
export function movesFrom(form: FilingForm, state: FilingState): FilingState[] {
  return MOVES[state].filter((to) => stateFitsForm(form, to));
}

/** A refusal with a stable code the extension and the card can both read. */
export class FilingRefusal extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = 'FilingRefusal';
    this.code = code;
    this.status = status;
  }
}

/* ---------------------------------------------------------------------------------------- */
/* Clocks                                                                                      */
/* ---------------------------------------------------------------------------------------- */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** The India date of an instant, `YYYY-MM-DD`. */
export function istDate(at: Date | string): string {
  const d = at instanceof Date ? at : new Date(at);
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Midnight in India on a date, as an instant. */
export function istMidnight(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00+05:30`);
}

function addDays(dateOnly: string, days: number): string {
  return new Date(Date.parse(`${dateOnly}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** MCA FAQ: the signed form goes up within 15 days of the SRN. */
export const UPLOAD_DAYS = 15;
/** MCA FAQ: the fee is paid within 7 days of the signed upload. */
export const PAYMENT_DAYS = 7;
/** Name validity: from a secondary source, to be confirmed against the MCA rules. */
export const NAME_VALIDITY_DAYS = 20;

export type DeadlineKey = 'upload' | 'payment' | 'name';

export interface FilingDeadline {
  key: DeadlineKey;
  label: string;
  dueOn: string;
  daysLeft: number;
  source: string;
  /** False while the rule rests on a secondary source. */
  confirmed: boolean;
}

export interface DeadlineInput {
  form: FilingForm;
  state: FilingState;
  srnAt: Date | string | null;
  signedUploadedAt: Date | string | null;
  paidAt: Date | string | null;
  nameApprovedAt: Date | string | null;
}

const NO_CLOCK: ReadonlySet<FilingState> = new Set(['submitted', 'approved', 'resubmit', 'cancelled']);

/** The clocks running on a filing today. A step already done has no clock. */
export function deadlines(input: DeadlineInput, today: string): FilingDeadline[] {
  if (NO_CLOCK.has(input.state)) return [];
  const out: FilingDeadline[] = [];
  const clock = (key: DeadlineKey, label: string, from: Date | string, days: number, source: string, confirmed: boolean) => {
    const dueOn = addDays(istDate(from), days);
    out.push({ key, label, dueOn, daysLeft: daysBetween(today, dueOn), source, confirmed });
  };
  if (input.form === 'spice-part-b' && input.srnAt && !input.signedUploadedAt) {
    clock('upload', 'Upload the signed form', input.srnAt, UPLOAD_DAYS, 'MCA FAQ: within 15 days of the SRN', true);
  }
  if (input.form === 'spice-part-b' && input.signedUploadedAt && !input.paidAt) {
    clock('payment', 'Pay the MCA fee', input.signedUploadedAt, PAYMENT_DAYS, 'MCA FAQ: within 7 days of the signed upload', true);
  }
  if (input.form === 'spice-part-a' && input.state === 'name_approved' && input.nameApprovedAt) {
    clock('name', 'Name approval lapses', input.nameApprovedAt, NAME_VALIDITY_DAYS, 'Secondary source, to be confirmed', false);
  }
  return out;
}

/** Alert from 3 days before the date, and for a week after it, once per day and deadline. */
const ALERT_FROM = 3;
const ALERT_UNTIL = -7;

export function deadlinesToAlert(input: DeadlineInput, today: string, alertedOn: Record<string, string>): FilingDeadline[] {
  return deadlines(input, today).filter(
    (d) => (d.key === 'upload' || d.key === 'payment') && d.daysLeft <= ALERT_FROM && d.daysLeft >= ALERT_UNTIL && alertedOn[d.key] !== today,
  );
}

/* ---------------------------------------------------------------------------------------- */
/* Applying a change                                                                            */
/* ---------------------------------------------------------------------------------------- */

export interface FilingRemark {
  at: string;
  byName: string;
  text: string;
}

export interface FilingPatch {
  state?: FilingState;
  srn?: string;
  srnOn?: string;
  remark?: string;
  paidOn?: string;
  signedUploadedOn?: string;
}

export interface FilingFacts {
  form: FilingForm;
  state: FilingState;
  srn: string | null;
  srnAt: Date | null;
  signedUploadedAt: Date | null;
  paidAt: Date | null;
  nameApprovedAt: Date | null;
  reviewedAt: Date | null;
  remarks: FilingRemark[];
  /** A signed PDF of the current portal PDF exists. */
  hasFreshSignedPdf: boolean;
}

export const SRN_PATTERN = /^[A-Z0-9]{6,20}$/;

function pastDate(dateOnly: string, today: string, label: string): Date {
  if (dateOnly > today) throw new FilingRefusal('date_in_future', `The ${label} date cannot be in the future.`, 422);
  return istMidnight(dateOnly);
}

/**
 * What a PATCH changes, or a refusal. Dates are stamped here so the route, the extension and the
 * card agree: moving to `name_approved` starts the name clock, moving to `payment_pending` starts
 * the payment clock, and recording the payment on a filing waiting for it moves it to `submitted`.
 */
export function planFilingPatch(facts: FilingFacts, patch: FilingPatch, now: Date, byName: string): Partial<Omit<FilingFacts, 'form' | 'hasFreshSignedPdf'>> & { lastRemark?: string } {
  const today = istDate(now);
  const set: Partial<Omit<FilingFacts, 'form' | 'hasFreshSignedPdf'>> & { lastRemark?: string } = {};

  if (patch.srn !== undefined) {
    const srn = patch.srn.trim().toUpperCase();
    if (!SRN_PATTERN.test(srn)) throw new FilingRefusal('bad_srn', 'An SRN is 6 to 20 letters and digits.', 422);
    set.srn = srn;
    if (srn !== facts.srn || patch.srnOn) set.srnAt = patch.srnOn ? pastDate(patch.srnOn, today, 'SRN') : now;
  } else if (patch.srnOn) {
    if (!facts.srn) throw new FilingRefusal('bad_srn', 'Record the SRN with its date.', 422);
    set.srnAt = pastDate(patch.srnOn, today, 'SRN');
  }

  if (patch.remark !== undefined) {
    const text = patch.remark.trim();
    if (!text) throw new FilingRefusal('empty_remark', 'Write the remark first.', 422);
    set.lastRemark = text;
    set.remarks = [...facts.remarks, { at: now.toISOString(), byName, text }];
  }

  const signedUploadedAt = patch.signedUploadedOn ? pastDate(patch.signedUploadedOn, today, 'upload') : null;
  if (signedUploadedAt) set.signedUploadedAt = signedUploadedAt;
  const paidAt = patch.paidOn ? pastDate(patch.paidOn, today, 'payment') : null;
  if (paidAt) {
    if (facts.form !== 'spice-part-b') throw new FilingRefusal('not_part_b', 'Only Part B has a fee to record here.', 422);
    set.paidAt = paidAt;
  }

  let to = patch.state;
  if (!to && paidAt && facts.state === 'payment_pending') to = 'submitted';
  if (to && to !== facts.state) {
    if (!stateFitsForm(facts.form, to)) throw new FilingRefusal('state_not_for_form', `${FILING_STATE_LABEL[to]} does not apply to ${FILING_FORM_LABEL[facts.form]}.`, 422);
    if (!MOVES[facts.state].includes(to)) throw new FilingRefusal('invalid_move', `A filing cannot go from ${FILING_STATE_LABEL[facts.state]} to ${FILING_STATE_LABEL[to]}.`);
    if (to === 'awaiting_signatures' && !facts.reviewedAt) throw new FilingRefusal('not_reviewed', 'The professional has not approved the PDF yet.');
    if ((to === 'signed_ready' || to === 'upload_pending' || to === 'payment_pending') && !facts.hasFreshSignedPdf) {
      throw new FilingRefusal('no_signed_pdf', 'There is no signed copy of the current portal PDF.');
    }
    if (to === 'submitted' && !(paidAt ?? facts.paidAt)) throw new FilingRefusal('not_paid', 'Record the payment date first.');
    if (to === 'name_approved') set.nameApprovedAt = now;
    if (to === 'payment_pending' && !(signedUploadedAt ?? facts.signedUploadedAt)) set.signedUploadedAt = now;
    set.state = to;
  }
  return set;
}
