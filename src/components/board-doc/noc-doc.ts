import { coerceOwnershipType, coerceParentIndianRelationship } from '@/data/engagements';
import { BOARD_RESOLUTION_MERGE_FIELD_KEYS, type BoardResolutionMergeFields } from '@/lib/board-resolution/board-resolution';
import { parseBoardResolutionPatchContent } from '@/lib/board-resolution/board-resolution-docx-body';
import { resolveNocVariant, type NocVariant } from '@/lib/noc/variant';
import { isPlaceholder } from './merge-segments';
import type { DocModel, EvidenceRow, MergeValue } from './types';

/*
 * The board resolution (NOC) adapters: they turn the stored draft and the merge fields into the
 * shared part's DocModel and MergeValue list, and the three project answers into the evidence
 * rows (prototype docs/BOARD-RESOLUTION-NOC.md, C5 and C8).
 */

/** Where each merge value comes from. A click on a tinted value names this field. */
const NOC_FIELD_SOURCES: Record<keyof BoardResolutionMergeFields, string> = {
  PARENT_ENTITY_NAME: 'Pre-1 · Parent company name',
  PARENT_ENTITY_ADDRESS: 'Pre-1 · Parent address',
  RESOLUTION_EFFECTIVE_DATE: 'Pre-1 · Board resolution date',
  PARENT_JURISDICTION: 'Pre-1 · Parent country',
  PARENT_STATE: 'Pre-1 · Parent state',
  PROPOSED_NAME_1: 'Pre-1 · Proposed name 1',
  PROPOSED_NAME_2: 'Pre-1 · Proposed name 2',
  PROPOSED_NAMES: 'Pre-1 · Proposed names',
  NIC_CODES: 'Pre-1 · NIC codes',
  AUTHORISED_CAPITAL: 'Pre-1 · Authorised capital',
  PAID_UP_CAPITAL: 'Pre-1 · Paid-up capital',
  INDIAN_DIRECTOR_LINE: 'Pre-1 · Directors',
  SECOND_DIRECTOR_LINE: 'Pre-1 · Directors',
  DIRECTOR_NAMES: 'Pre-1 · Directors',
  SIGNATORY_NAME: 'Pre-1 · Authorised person',
  SIGNATORY_DESIGNATION: 'Pre-1 · Designation',
  CERTIFICATION_DATE: 'Pre-1 · Board resolution date',
  CERTIFICATION_PLACE: 'Pre-1 · Parent country',
  RESOLUTION_DAY: 'Pre-1 · Board resolution date',
  NAME_WORD: 'Pre-1 · Parent company name',
  SIGNATORY_DIN: 'Filled by hand on the printed copy',
};

/** The merge values of the draft. Each director is its own value; placeholders come back missing. */
export function nocMergeValues(fields: BoardResolutionMergeFields | null | undefined): MergeValue[] {
  if (!fields) return [];
  const out: MergeValue[] = [];
  const seen = new Set<string>();
  const add = (key: string, raw: string) => {
    const value = raw.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ key, value, source: NOC_FIELD_SOURCES[key as keyof BoardResolutionMergeFields] ?? key, missing: isPlaceholder(value) || undefined });
  };
  for (const key of BOARD_RESOLUTION_MERGE_FIELD_KEYS) {
    const raw = fields[key] ?? '';
    if (key === 'DIRECTOR_NAMES') raw.split('\n').forEach((line) => add(key, line));
    else add(key, raw);
  }
  return out;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "SEPTEMBER 24, 2026" or "24th September, 2026" to "24 Sep 2026". Other text stays as it is. */
export function plainDocDate(raw: string): string {
  const t = raw.trim();
  if (!t || isPlaceholder(t)) return '';
  const cleaned = t.replace(/(\d+)(st|nd|rd|th)\b/i, '$1').replace(/,/g, ' ');
  const ms = Date.parse(cleaned);
  if (Number.isNaN(ms)) return t;
  const d = new Date(ms);
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

type Label = 'Purpose' | 'Decision' | 'Who signs' | 'Filing agent' | 'Certifies';

const CERT_MARK = /^(##|\/\/)\s*CERTIFIED TRUE COPY\s*(##|\/\/)$/i;

/** The margin label a paragraph starts, or null when it continues the section above. */
function labelOf(p: string): Label | null {
  if (/^THE FOLLOWING IS A CERTIFIED/i.test(p)) return 'Purpose';
  if (/^["“]?RESOLVED THAT|^Pursuant to/i.test(p)) return 'Decision';
  if (/^RESOLVED FURTHER THAT\.?$/i.test(p)) return 'Who signs';
  if (/^Filing the requisite/i.test(p)) return 'Filing agent';
  if (/^RESOLVED FURTHER THAT the Company shall have no objection/i.test(p)) return 'Filing agent';
  if (/^RESOLVED FURTHER THAT a copy of this resolution/i.test(p) || CERT_MARK.test(p)) return 'Certifies';
  if (/^RESOLVED FURTHER THAT/i.test(p)) return 'Decision';
  return null;
}

/**
 * The paper for the Draft tab from the stored draft content (plain lines or the structured form)
 * with the margin labels Purpose · Decision · Who signs · Filing agent · Certifies, and two dated
 * labels, Meeting and Certified (P3). Pass the generated draft when nothing is stored yet.
 */
export function nocDocModel({
  content,
  fields,
  letterhead,
  dates,
}: {
  content: string;
  fields?: BoardResolutionMergeFields | null;
  letterhead?: DocModel['letterhead'];
  dates?: DocModel['dates'];
}): DocModel {
  const paragraphs = (content.trim() ? parseBoardResolutionPatchContent(content) : [])
    .map((p) => p.text.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);
  let heading: string | undefined;
  if (paragraphs[0] && /^CERTIFIED TRUE COPY/i.test(paragraphs[0])) heading = paragraphs.shift();

  const sections: DocModel['sections'] = [];
  for (const raw of paragraphs) {
    const p = CERT_MARK.test(raw) ? 'CERTIFIED TRUE COPY' : raw;
    const label = labelOf(raw);
    const last = sections[sections.length - 1];
    if (!last || (label && label !== last.label)) sections.push({ label: label ?? undefined, paragraphs: [p] });
    else last.paragraphs.push(p);
  }

  const parent = fields && !isPlaceholder(fields.PARENT_ENTITY_NAME) ? fields.PARENT_ENTITY_NAME.trim() : '';
  const address = fields && !isPlaceholder(fields.PARENT_ENTITY_ADDRESS) ? fields.PARENT_ENTITY_ADDRESS.trim() : '';
  const meeting = fields ? plainDocDate(fields.RESOLUTION_EFFECTIVE_DATE) : '';
  const certified = fields ? plainDocDate(fields.CERTIFICATION_DATE) : '';
  return {
    letterhead: letterhead !== undefined ? letterhead : parent ? { name: parent, address: address || undefined } : null,
    heading,
    dates:
      dates ??
      [
        { label: 'Meeting', value: meeting },
        { label: 'Certified', value: certified },
      ].filter((d) => d.value),
    sections,
  };
}

export type NocOutcome = 'standalone' | 'foreign' | 'indian-name-only' | 'indian-investing' | 'indian-not-chosen' | 'incomplete';

/** Tree node ids, in the order the chosen path lights them. */
export type NocPathNode = 'standalone' | 'subsidiary' | 'foreign' | 'indian' | 'name-only' | 'investing' | 'not-chosen';

/**
 * C8: why VCFO chose this template, from the three project answers (F3). The rows, the result,
 * and the tree path agree with `resolveNocVariant()` because they read the same answers.
 */
export function nocEvidence(project: { ownershipType?: string | null; companyType?: string | null; parentIndianRelationship?: string | null }): {
  rows: EvidenceRow[];
  outcome: NocOutcome;
  variant: NocVariant | null;
  path: NocPathNode[];
} {
  const variant = resolveNocVariant(project);
  const rows: EvidenceRow[] = [];
  const ownership = coerceOwnershipType(project.ownershipType);
  if (ownership === 'independent') {
    rows.push({ n: 1, asked: 'Project setup · Ownership type', answer: 'Standalone', chose: 'No NOC' });
    return { rows, outcome: 'standalone', variant, path: ['standalone'] };
  }
  rows.push({ n: 1, asked: 'Project setup · Ownership type', answer: 'Subsidiary', chose: 'Subsidiary, not standalone' });
  if (project.companyType === 'foreign') {
    rows.push({ n: 2, asked: 'Project setup · Company type', answer: 'Foreign subsidiary', chose: 'NOC — Foreign subsidiary' });
    return { rows, outcome: 'foreign', variant, path: ['subsidiary', 'foreign'] };
  }
  if (project.companyType !== 'domestic') {
    rows.push({ n: 2, asked: 'Project setup · Company type', answer: 'Not chosen yet', chose: 'No NOC yet', missing: true });
    return { rows, outcome: 'incomplete', variant, path: ['subsidiary'] };
  }
  rows.push({ n: 2, asked: 'Project setup · Company type', answer: 'Indian subsidiary', chose: 'Indian subsidiary, not foreign' });
  const role = coerceParentIndianRelationship(project.parentIndianRelationship);
  if (role === 'name_only') {
    rows.push({ n: 3, asked: 'Project setup · Parent’s role', answer: 'Name use only', chose: 'NOC — Indian subsidiary (name use)' });
    return { rows, outcome: 'indian-name-only', variant, path: ['subsidiary', 'indian', 'name-only'] };
  }
  if (role === 'investing') {
    rows.push({ n: 3, asked: 'Project setup · Parent’s role', answer: 'Investing', chose: 'NOC — Indian subsidiary (investing)' });
    return { rows, outcome: 'indian-investing', variant, path: ['subsidiary', 'indian', 'investing'] };
  }
  rows.push({ n: 3, asked: 'Project setup · Parent’s role', answer: 'Not chosen yet', chose: 'No NOC yet', missing: true });
  return { rows, outcome: 'indian-not-chosen', variant, path: ['subsidiary', 'indian', 'not-chosen'] };
}
