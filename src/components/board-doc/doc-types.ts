import { NOC_TEMPLATES } from '@/lib/noc/templates';
import type { NocVariant } from '@/lib/noc/variant';
import type { DocCheckDef, DocKind, DocStageDef, DocTodoDef, DocTypeDef } from './types';

/*
 * Document types of the shared board document part (prototype docs/BOARD-RESOLUTION-NOC.md,
 * sections 3 to 5, and the proposal's section 7 table). Each type gives its steps, its
 * letterhead source, its "What you do" list and its receive checklist.
 */

export const NOC_STAGE_KEYS = {
  drafted: 'drafted',
  released: 'released',
  signed: 'signed',
  notarised: 'notarised',
  apostilled: 'apostilled',
  accepted: 'accepted',
} as const;

/** The record key of the signed scan upload. The "Upload the scan" line ticks on it. */
export const UPLOADED_KEY = 'uploaded';

/** D1: a foreign parent's resolution is notarised and apostilled. Indian parents skip both (D4). */
function needsNotary(variant: NocVariant | null | undefined): boolean {
  return variant === 'foreign-parent';
}

/**
 * The board resolution (NOC). `variant` null (standalone, or an Indian parent whose role is not
 * chosen yet) keeps the Indian track. `notary: false` is SBC's switch that turns the notary and
 * apostille steps off for one client.
 */
export function nocDocType(variant: NocVariant | null | undefined, opts: { notary?: boolean } = {}): DocTypeDef {
  const notary = needsNotary(variant) && opts.notary !== false;
  const k = NOC_STAGE_KEYS;
  const stages: DocStageDef[] = [
    { key: k.drafted, label: 'Drafted' },
    { key: k.released, label: 'Released' },
    { key: k.signed, label: 'Signed' },
    ...(notary
      ? [
          { key: k.notarised, label: 'Notarised' },
          { key: k.apostilled, label: 'Apostilled' },
        ]
      : []),
    { key: k.accepted, label: 'Accepted' },
  ];
  const todo: DocTodoDef[] = [
    { key: 'download', label: 'Download the Word file', stage: k.signed },
    { key: 'print', label: 'Print it on the parent’s letterhead', stage: k.signed },
    { key: 'sign', label: 'A director signs', stage: k.signed },
    ...(notary ? [{ key: 'notarise', label: 'Notarise, then apostille', stage: k.apostilled }] : []),
    { key: 'upload', label: 'Upload the scan', stage: UPLOADED_KEY },
  ];
  const checks: DocCheckDef[] = [
    { key: 'signature', label: 'Signature of a parent director' },
    { key: 'date-place', label: 'Date and place filled' },
    { key: 'letterhead', label: 'On the parent’s letterhead' },
    ...(notary
      ? [
          { key: 'notary', label: 'Notary stamp' },
          { key: 'apostille', label: 'Apostille certificate' },
        ]
      : []),
    { key: 'names', label: 'Names match the draft' },
  ];
  return {
    kind: 'board-resolution-noc',
    title: 'Board resolution (NOC)',
    subtitle: variant ? NOC_TEMPLATES[variant].label : undefined,
    letterhead: 'parent',
    stages,
    todo,
    checks,
  };
}

function simple(kind: DocKind, title: string, stages: string[], checks: string[]): DocTypeDef {
  return {
    kind,
    title,
    letterhead: 'company',
    stages: stages.map((label) => ({ key: label.toLowerCase().replace(/\s+/g, '-'), label })),
    todo: [],
    checks: checks.map((label, i) => ({ key: `c${i + 1}`, label })),
  };
}

/** The later board meeting documents. They use the company's letterhead. */
export const DOC_TYPES = {
  resolutionByCirculation: simple(
    'resolution-by-circulation',
    'Resolution by circulation',
    ['Drafted', 'Released', 'Signed', 'Accepted', 'In next agenda'],
    ['Signature of each selected director', 'DIN beside each signature', 'Date filled', 'On the company’s letterhead', 'Names match the draft'],
  ),
  noticeAgenda: simple('notice-agenda', 'Notice and agenda', ['Drafted', 'Approved', 'Sent'], ['Date, time and place filled', 'Every agenda item listed', 'Signed by the company secretary or a director']),
  minutes: simple('minutes', 'Minutes', ['Drafted', 'Circulated', 'Signed', 'Accepted'], ['Signature of the chairperson', 'Date and place filled', 'Every resolution recorded', 'On the company’s letterhead']),
} satisfies Record<string, DocTypeDef>;
