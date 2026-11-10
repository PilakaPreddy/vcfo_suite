/**
 * The notice desk's plain rules (IDEAS-PLAN wave 2, section C): the authorities, the stages, the
 * escalation ladder and the words that mark a document as a notice. No database and no model, so
 * the browser, the job, the drop sorter and the tests all share it.
 */

export const NOTICE_AUTHORITIES = ['gst', 'income_tax', 'tds', 'mca', 'other'] as const;
export type NoticeAuthority = (typeof NOTICE_AUTHORITIES)[number];

export const NOTICE_AUTHORITY_LABEL: Record<NoticeAuthority, string> = {
  gst: 'GST',
  income_tax: 'Income tax',
  tds: 'TDS',
  mca: 'MCA',
  other: 'Other',
};

export const NOTICE_STAGES = ['received', 'analysed', 'docs_requested', 'reply_drafted', 'submitted', 'closed'] as const;
export type NoticeStage = (typeof NOTICE_STAGES)[number];

export const NOTICE_STAGE_LABEL: Record<NoticeStage, string> = {
  received: 'Received',
  analysed: 'Analysed',
  docs_requested: 'Documents requested',
  reply_drafted: 'Reply drafted',
  submitted: 'Reply submitted',
  closed: 'Closed',
};

/** A case is open until the reply is submitted; a submitted case waits on the department. */
export function isOpenStage(stage: string): boolean {
  return stage !== 'closed' && stage !== 'submitted';
}

export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

// ---- Escalations ------------------------------------------------------------------------------

export const ESCALATIONS = ['t7', 't2', 'overdue'] as const;
export type Escalation = (typeof ESCALATIONS)[number];

const RANK: Record<Escalation, number> = { t7: 1, t2: 2, overdue: 3 };

export interface EscalationSubject {
  stage: string;
  responseDueOn: string | null;
  lastEscalation: string | null;
  lastEscalationDueOn: string | null;
}

/**
 * The escalation due today, or null. Seven days or fewer before the response date is t7, two days
 * or fewer is t2, and past it is overdue. Each fires once per due date, and a missed day still
 * fires the stage the case is in now (never the ones it skipped). A new due date starts again.
 */
export function dueEscalation(subject: EscalationSubject, today: string): Escalation | null {
  if (!subject.responseDueOn || !isOpenStage(subject.stage)) return null;
  const days = daysUntil(subject.responseDueOn, today);
  const target: Escalation | null = days < 0 ? 'overdue' : days <= 2 ? 't2' : days <= 7 ? 't7' : null;
  if (!target) return null;
  const last = subject.lastEscalationDueOn === subject.responseDueOn && subject.lastEscalation && subject.lastEscalation in RANK ? (subject.lastEscalation as Escalation) : null;
  if (last && RANK[last] >= RANK[target]) return null;
  return target;
}

/** Who hears of an escalation: the owner and the manager before the date, the partner too after it. */
export function escalationAudience(escalation: Escalation): Array<'owner' | 'manager' | 'partner'> {
  return escalation === 'overdue' ? ['owner', 'manager', 'partner'] : ['owner', 'manager'];
}

export function escalationTitle(escalation: Escalation, input: { companyName: string; label: string; days: number }): string {
  if (escalation === 'overdue') return `Overdue notice reply: ${input.label} for ${input.companyName}`;
  return `Notice reply due in ${input.days} day${input.days === 1 ? '' : 's'}: ${input.label} for ${input.companyName}`;
}

/** "GST notice u/s 73 (FY 2023-24)". */
export function noticeLabel(c: { authority: string; section: string | null; periodLabel: string | null }): string {
  const who = NOTICE_AUTHORITY_LABEL[c.authority as NoticeAuthority] ?? 'Tax';
  return [`${who} notice`, c.section ? `u/s ${c.section}` : null, c.periodLabel ? `(${c.periodLabel})` : null].filter(Boolean).join(' ');
}

/** The staff page each role opens. Super admins have their own shell segment. */
export function noticesHref(role: string): string {
  const seg = role === 'super_admin' ? 'super' : role === 'intern' ? 'intern' : role === 'manager' ? 'manager' : 'admin';
  return `/app/${seg}/compliances/notices`;
}

// ---- Recognising a notice ---------------------------------------------------------------------

/** Words that make a document a notice on their own, wherever they appear (names or read values). */
const NOTICE_WORDS =
  /\b(?:show[\s-]*cause|scn|demand notice|notice of demand|notices? u\/?s|notices? under section|intimation u\/?s|intimation under section|drc[\s-]*0?1a?|asmt[\s-]*1[01]|(?:u\/?s|section)\s*(?:143\s*\(\s*[12]\s*\)|148a?|142\s*\(\s*1\s*\)|156|245|73|74|61|46))(?![a-z0-9])/i;

/** A bare "notice", which counts only beside a tax or company-law word. */
const BARE_NOTICE = /\bnotices?\b/i;

/** Words that, beside "notice", show it is not one a department issued. */
const NOT_A_NOTICE = /\b(?:notice of (?:board|annual|general|extraordinary)|agm notice|egm notice|board meeting notice|meeting notice|notice period|privacy notice)\b/i;

/** The authority the words point to, or null. */
export function authorityFromText(text: string): NoticeAuthority | null {
  const t = text.toLowerCase();
  if (/\b(?:tds|tcs|traces|26q|24q|200a|201\s*\(\s*1\s*\))\b/.test(t)) return 'tds';
  if (/\b(?:gst|gstin|cgst|sgst|igst|drc[\s-]*0?1|asmt|gstr)\b/.test(t)) return 'gst';
  if (/\b(?:income[\s-]*tax|143\s*\(|148a?\b|142\s*\(|assessment year|\bay\s*20\d\d|itba|faceless)\b/.test(t)) return 'income_tax';
  if (/\b(?:roc|registrar of companies|companies act|mca|section 206|adjudication)\b/.test(t)) return 'mca';
  return null;
}

/** The document types a reader would give a tax notice. */
export const NOTICE_DOC_TYPES: ReadonlySet<string> = new Set(['gst_notice', 'income_tax_notice', 'tds_notice', 'mca_notice', 'scn', 'demand_notice', 'tax_notice', 'notice']);

/**
 * True when a document is a department's notice: its type says so, or its names or read text use
 * notice wording ("show cause", "DRC-01", "notice u/s 143(2)") and are not a meeting or a policy
 * notice. A bare "notice" counts only beside a tax or company-law word.
 */
export function looksLikeNotice(input: { docType?: string | null; texts: readonly (string | null | undefined)[] }): boolean {
  if (input.docType && NOTICE_DOC_TYPES.has(input.docType)) return true;
  const text = input.texts.filter(Boolean).join(' \n ').replace(/[_]+/g, ' ');
  if (!text.trim() || NOT_A_NOTICE.test(text)) return false;
  if (NOTICE_WORDS.test(text)) return true;
  return BARE_NOTICE.test(text) && authorityFromText(text) !== null;
}

/** The documents almost every reply needs; the drafting step adds the notice's own list. */
export const BASE_REPLY_DOCUMENTS: readonly string[] = ['A copy of the notice and every earlier letter on it', 'Authorisation letter for the firm'];
