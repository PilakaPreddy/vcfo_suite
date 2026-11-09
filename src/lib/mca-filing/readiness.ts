import type { AssistProfile, AssistProfileMissing } from '@/lib/assist-profile/types';
import { daysBetween, type FilingForm } from '@/lib/mca-filing/filing-state';
import type { KnownSigner } from '@/lib/mca-filing/signers';
import type { AssistAttachmentItem } from '@/lib/mca-filing/types';

/**
 * FILING READINESS — pure. Everything here needs no MCA portal access: it reads what Suite holds and
 * says what blocks a filing before anyone logs in. Four parts: the checks on each signer, the DSC
 * dates the deadline job alerts on, the frozen filing packet and its hash, and the causes of MCA
 * remarks that turn repeat rejections into checks. No Node import, so the card can use it too;
 * the packet's SHA-256 is in `packet-hash.ts`.
 */

/* ---------------------------------------------------------------------------------------- */
/* Signers                                                                                      */
/* ---------------------------------------------------------------------------------------- */

/** What staff recorded about a signer's MCA set-up. Suite cannot read this from the portal. */
export interface SignerPortalFacts {
  /** When staff confirmed the signer is registered as a Business User on MCA. */
  businessUserOn: string | null;
  /** When staff confirmed the signer's DSC is associated with that account. */
  dscAssociatedOn: string | null;
}

export type ReadinessKey = 'email' | 'dsc' | 'dsc_expiry' | 'business_user' | 'dsc_associated';

export interface ReadinessItem {
  key: ReadinessKey;
  ok: boolean;
  text: string;
}

export interface SignerReadiness {
  signerId: string;
  name: string;
  ready: boolean;
  items: ReadinessItem[];
  portal: SignerPortalFacts;
}

/** A DSC that lapses within this many days of today is not safe to start a filing with. */
export const DSC_SAFE_DAYS = 30;

/** A DSC date as `YYYY-MM-DD`, or null. Suite stores ISO dates; older rows may be `DD/MM/YYYY`. */
export function dscDate(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

const NO_FACTS: SignerPortalFacts = { businessUserOn: null, dscAssociatedOn: null };

/** The checks for one signer. A representative of a body corporate signs with their own DSC too. */
export function signerReadiness(signer: KnownSigner, facts: SignerPortalFacts | undefined, today: string): SignerReadiness {
  const portal = facts ?? NO_FACTS;
  const items: ReadinessItem[] = [];
  items.push(signer.email ? { key: 'email', ok: true, text: 'Email on record' } : { key: 'email', ok: false, text: 'No email on record, so Suite cannot send the PDF' });
  if (signer.hasDsc === false) items.push({ key: 'dsc', ok: false, text: 'No DSC. The signer must get one' });
  else if (signer.hasDsc === null && signer.role !== 'representative') items.push({ key: 'dsc', ok: false, text: 'Suite does not know if the signer has a DSC' });
  else items.push({ key: 'dsc', ok: true, text: 'DSC held' });
  const expiry = dscDate(signer.dscExpiry);
  if (signer.hasDsc !== false) {
    if (!expiry) items.push({ key: 'dsc_expiry', ok: false, text: signer.dscExpiry ? `DSC expiry "${signer.dscExpiry}" is not a date` : 'No DSC expiry on record' });
    else if (expiry < today) items.push({ key: 'dsc_expiry', ok: false, text: `DSC expired on ${expiry}` });
    else if (daysBetween(today, expiry) < DSC_SAFE_DAYS) items.push({ key: 'dsc_expiry', ok: false, text: `DSC expires on ${expiry}, in ${daysBetween(today, expiry)} days` });
    else items.push({ key: 'dsc_expiry', ok: true, text: `DSC valid until ${expiry}` });
  }
  items.push(portal.businessUserOn
    ? { key: 'business_user', ok: true, text: `Business User on MCA, confirmed ${portal.businessUserOn}` }
    : { key: 'business_user', ok: false, text: 'Business User registration on MCA not confirmed' });
  items.push(portal.dscAssociatedOn
    ? { key: 'dsc_associated', ok: true, text: `DSC associated on MCA, confirmed ${portal.dscAssociatedOn}` }
    : { key: 'dsc_associated', ok: false, text: 'DSC association on MCA not confirmed' });
  return { signerId: signer.id, name: signer.name, ready: items.every((i) => i.ok), items, portal };
}

/* ---------------------------------------------------------------------------------------- */
/* DSC dates for the deadline job                                                              */
/* ---------------------------------------------------------------------------------------- */

export interface DscDeadline {
  /** `dsc:<signer id>`, the key the job stores in `alerted_on`. */
  key: string;
  label: string;
  dueOn: string;
  daysLeft: number;
  source: string;
}

/** Alert from 15 days before a DSC lapses, and for a week after. */
const DSC_ALERT_FROM = 15;
const DSC_ALERT_UNTIL = -7;

/** The DSCs to alert about today, each once a day. */
export function dscDeadlinesToAlert(signers: Pick<KnownSigner, 'id' | 'name' | 'hasDsc' | 'dscExpiry'>[], today: string, alertedOn: Record<string, string>): DscDeadline[] {
  const out: DscDeadline[] = [];
  for (const s of signers) {
    const dueOn = dscDate(s.dscExpiry);
    if (s.hasDsc === false || !dueOn) continue;
    const daysLeft = daysBetween(today, dueOn);
    const key = `dsc:${s.id}`;
    if (daysLeft > DSC_ALERT_FROM || daysLeft < DSC_ALERT_UNTIL || alertedOn[key] === today) continue;
    out.push({ key, label: `DSC of ${s.name} lapses`, dueOn, daysLeft, source: 'DSC expiry date in Suite' });
  }
  return out;
}

/* ---------------------------------------------------------------------------------------- */
/* Remark causes                                                                                */
/* ---------------------------------------------------------------------------------------- */

export const REMARK_CAUSES = [
  'name',
  'objects',
  'office_proof',
  'director_kyc',
  'subscriber_details',
  'capital_stamp_duty',
  'signature_dsc',
  'attachment',
  'moa_aoa',
  'other',
] as const;
export type RemarkCause = (typeof REMARK_CAUSES)[number];

/** A label for each cause, and the check a lead does before the next filing. */
export const REMARK_CAUSE_INFO: Record<RemarkCause, { label: string; check: string }> = {
  name: { label: 'Company name', check: 'Check the proposed name against the naming rules and existing companies before Part A.' },
  objects: { label: 'Main objects', check: 'Check the main objects and the NIC code agree.' },
  office_proof: { label: 'Registered office proof', check: 'Check the utility bill is recent and the NOC names the same address.' },
  director_kyc: { label: 'Director KYC', check: 'Check each director\'s proof copies are clear, current and match the names typed.' },
  subscriber_details: { label: 'Subscriber details', check: 'Check subscriber names, shares and addresses against their proofs.' },
  capital_stamp_duty: { label: 'Capital or stamp duty', check: 'Check authorised and paid-up capital, and the state for stamp duty.' },
  signature_dsc: { label: 'Signature or DSC', check: 'Check every signer\'s DSC is valid and associated before they sign.' },
  attachment: { label: 'Attachment', check: 'Check every attachment is a readable PDF of the right document.' },
  moa_aoa: { label: 'MOA or AOA', check: 'Check the MOA and AOA clauses match Part B.' },
  other: { label: 'Other', check: 'Read the earlier remark before filing.' },
};

export function isRemarkCause(v: unknown): v is RemarkCause {
  return typeof v === 'string' && (REMARK_CAUSES as readonly string[]).includes(v);
}

export interface CauseCount {
  cause: RemarkCause;
  label: string;
  check: string;
  count: number;
}

/** Remark causes counted, most first. A cause seen at least `repeatAt` times becomes a check. */
export function repeatCauses(causes: Array<string | null | undefined>, repeatAt = 2): CauseCount[] {
  const counts = new Map<RemarkCause, number>();
  for (const c of causes) if (isRemarkCause(c) && c !== 'other') counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= repeatAt)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, count]) => ({ cause, count, ...REMARK_CAUSE_INFO[cause] }));
}

/* ---------------------------------------------------------------------------------------- */
/* Filing packet                                                                                */
/* ---------------------------------------------------------------------------------------- */

/** What a frozen packet holds: the data any filing route needs. No storage keys and no files. */
export interface PacketContent {
  profile: AssistProfile;
  attachments: Array<{ key: string; label: string; fileName: string | null; size: number | null; available: boolean }>;
  signers: Array<{ id: string; name: string; role: KnownSigner['role']; dscExpiry: string | null }>;
  missing: string[];
}

export type PacketPart = keyof PacketContent;
export const PACKET_PARTS: readonly PacketPart[] = ['profile', 'attachments', 'signers', 'missing'];

export function packetContent(profile: AssistProfile, attachments: AssistAttachmentItem[], signers: KnownSigner[], missing: AssistProfileMissing[]): PacketContent {
  return {
    profile,
    attachments: attachments.map((a) => ({ key: a.key, label: a.label, fileName: a.fileName, size: a.size, available: a.available })),
    signers: signers.map((s) => ({ id: s.id, name: s.name, role: s.role, dscExpiry: s.dscExpiry })),
    missing: missing.map((m) => m.key).sort(),
  };
}

/** JSON with object keys sorted, so the same data always gives the same text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Which parts differ between two packets. */
export function packetChanges(a: PacketContent, b: PacketContent): PacketPart[] {
  return PACKET_PARTS.filter((part) => canonicalJson(a[part]) !== canonicalJson(b[part]));
}

/* ---------------------------------------------------------------------------------------- */
/* The verdict                                                                                  */
/* ---------------------------------------------------------------------------------------- */

export interface ReadinessLine {
  group: 'values' | 'attachments' | 'signers' | 'packet' | 'history';
  text: string;
}

export interface FilingReadiness {
  ready: boolean;
  /** Each stops the filing until fixed. */
  blockers: ReadinessLine[];
  /** Each a person reads before the portal. */
  warnings: ReadinessLine[];
  /** Repeat MCA remark causes, as checks. */
  checks: CauseCount[];
}

export interface ReadinessInput {
  form: FilingForm;
  missing: AssistProfileMissing[];
  attachments: AssistAttachmentItem[] | null;
  signers: SignerReadiness[];
  /** `portalPdf`: a portal PDF of this form is stored, so a change after the freeze may not be in it. */
  packet: { frozenVersion: number | null; changed: PacketPart[]; portalPdf: boolean };
  causes: CauseCount[];
}

/** Attachments no portal step takes from Suite: the portal makes eMoA and eAoA, and DIR-2 and INC-9 are legacy uploads. */
const NOT_FROM_SUITE = new Set(['moa', 'aoa', 'dir-2', 'inc-9']);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One verdict for a form. Part A reserves the name and takes no DSC, so signer gaps are only
 * warnings there; Part B needs every signer ready and every attachment Suite supplies.
 */
export function filingReadiness(input: ReadinessInput): FilingReadiness {
  const blockers: ReadinessLine[] = [];
  const warnings: ReadinessLine[] = [];
  if (input.missing.length) {
    const own = input.missing.filter((m) => !m.reason);
    const none = input.missing.length - own.length;
    if (own.length) blockers.push({ group: 'values', text: `${plural(own.length, 'value')} blank in Suite. Fill them on their checklist steps.` });
    if (none) warnings.push({ group: 'values', text: `${plural(none, 'value')} Suite does not hold. A person types them on the portal.` });
  }
  if (input.form === 'spice-part-b') {
    if (input.attachments === null) warnings.push({ group: 'attachments', text: 'Attachment files could not be checked.' });
    else {
      const needed = input.attachments.filter((a) => !NOT_FROM_SUITE.has(a.group) && !a.available);
      if (needed.length) blockers.push({ group: 'attachments', text: `${plural(needed.length, 'attachment')} not stored: ${needed.slice(0, 3).map((a) => a.label).join(', ')}${needed.length > 3 ? ', and more' : ''}.` });
      const noted = input.attachments.filter((a) => a.available && a.note);
      if (noted.length) warnings.push({ group: 'attachments', text: `${plural(noted.length, 'attachment')} stored with a note (not a PDF, or too large).` });
    }
  }
  const signerLines = input.form === 'spice-part-b' ? blockers : warnings;
  if (input.signers.length === 0) signerLines.push({ group: 'signers', text: 'Suite holds no signer for this company.' });
  for (const s of input.signers) {
    const open = s.items.filter((i) => !i.ok);
    if (open.length) signerLines.push({ group: 'signers', text: `${s.name}: ${open.map((i) => i.text.charAt(0).toLowerCase() + i.text.slice(1)).join('; ')}.` });
  }
  if (input.packet.frozenVersion === null) warnings.push({ group: 'packet', text: 'No filing packet frozen yet. Freeze one before the portal, so later changes show.' });
  else if (input.packet.changed.length) {
    const line = { group: 'packet' as const, text: `Suite data changed since packet ${input.packet.frozenVersion} (${input.packet.changed.join(', ')}). Check the portal form, then freeze a new packet.` };
    if (input.packet.portalPdf) blockers.push(line);
    else warnings.push(line);
  }
  return { ready: blockers.length === 0, blockers, warnings, checks: input.causes };
}
