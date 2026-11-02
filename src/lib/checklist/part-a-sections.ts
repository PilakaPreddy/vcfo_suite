import type { ChecklistField } from '@/data/checklist';
import type { OwnershipType } from '@/data/engagements';

/**
 * SPICe+ Part A (step `pre-1`) — the one place that decides which sections a
 * company sees and in what order.
 *
 * The tab strip, the client record, the attachments menu, the validator and
 * the completeness check all read `partAFieldsFor` / `partAsectionsFor`;
 * nothing else may hard-code a section list or a tab count. Fields stay keyed
 * by id, so reordering here never touches saved responses.
 */
export const PART_A_STEP_ID = 'pre-1';

export const PART_A_SECTION = {
  businessDescription: 'Business Description',
  proposedNames: 'Proposed Company Names',
  foreignEntity: 'Foreign Entity Details',
  proposedDirectors: 'Proposed Directors',
  shareCapital: 'Proposed Share Capital Structure',
  boardResolutionSignatory: 'Person Signing the Board Resolution',
  nicCodes: 'NIC Codes',
} as const;

export type PartASection = (typeof PART_A_SECTION)[keyof typeof PART_A_SECTION];

/**
 * Tab order — the owner's Part A list (2026-11-02): what the business does,
 * the two proposed names, the foreign entity with its certificate of
 * incorporation, the proposed directors, the proposed share capital, and the
 * person who signs the board resolution with their KYC. The NIC codes come
 * last; only the project lead fills them and the client never sees that tab.
 * Sections absent from a company's list are skipped, not renumbered.
 */
const PART_A_SECTION_ORDER: readonly PartASection[] = [
  PART_A_SECTION.businessDescription,
  PART_A_SECTION.proposedNames,
  PART_A_SECTION.foreignEntity,
  PART_A_SECTION.proposedDirectors,
  PART_A_SECTION.shareCapital,
  PART_A_SECTION.boardResolutionSignatory,
  PART_A_SECTION.nicCodes,
];

/**
 * Sections that exist only because a parent entity is incorporating the
 * company: who it is (with its certificate) and the person who signs its board
 * resolution (with their KYC). An independent company has none of them.
 */
const PARENT_ENTITY_SECTIONS: ReadonlySet<string> = new Set([
  PART_A_SECTION.foreignEntity,
  PART_A_SECTION.boardResolutionSignatory,
]);

/** Parent-entity fields that live inside an otherwise shared section. */
const PARENT_ENTITY_FIELD_IDS: ReadonlySet<string> = new Set(['boardResolutionDate']);

function isParentEntityField(field: Pick<ChecklistField, 'id' | 'section'>): boolean {
  return (
    (field.section !== undefined && PARENT_ENTITY_SECTIONS.has(field.section)) ||
    PARENT_ENTITY_FIELD_IDS.has(field.id)
  );
}

/** The sections this company's Part A shows, in tab order. */
export function partAsectionsFor(ownershipType: OwnershipType | undefined): PartASection[] {
  const independent = ownershipType === 'independent';
  return PART_A_SECTION_ORDER.filter(
    (section) => !independent || !PARENT_ENTITY_SECTIONS.has(section),
  );
}

/**
 * Part A's fields for this company: parent-entity fields dropped for an
 * independent one, the rest sorted into tab order. Fields with no section
 * (the step remarks) keep their place at the end.
 */
export function partAFieldsFor(
  fields: ChecklistField[],
  ownershipType: OwnershipType | undefined,
): ChecklistField[] {
  const independent = ownershipType === 'independent';
  const rank = new Map<string, number>(
    partAsectionsFor(ownershipType).map((section, index) => [section, index]),
  );
  const kept = independent ? fields.filter((field) => !isParentEntityField(field)) : fields;
  // Unknown sections (a field added without a slot here) land after the known
  // ones; section-less fields last.
  const rankOf = (field: ChecklistField) =>
    field.section === undefined
      ? Number.MAX_SAFE_INTEGER
      : (rank.get(field.section) ?? PART_A_SECTION_ORDER.length);
  // Stable: fields inside a section keep their definition order.
  return kept
    .map((field, index) => ({ field, index }))
    .sort((a, b) => rankOf(a.field) - rankOf(b.field) || a.index - b.index)
    .map(({ field }) => field);
}
