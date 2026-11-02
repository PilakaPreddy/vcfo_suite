import type { ReactNode } from 'react';
import type { ChecklistField } from '@/data/checklist';
import { WhatsThisButton } from '@/components/ask/WhatsThisButton';
import { cn } from '@/lib/utils';
import { isFieldEditableForClient } from '@/lib/checklist/checklist-item-lock';
import { isClientOnlyField, isLeadOnlyField } from '@/lib/incorporation/pre-inc-direct-flow';
import { Pre1SectionCard } from '@/views/incorporation/MilestoneResponseFormParts';
import type { ReadOnlyFieldRenderers } from './read-only-field';
import type { MilestoneFormCtx } from './types';

/**
 * The field groups to render: the selected intern tab, Part A / phase 2
 * section cards, or plain titled groups, each as a record list or a form grid.
 */
export function renderMilestoneFieldGroups(
  ctx: MilestoneFormCtx &
    ReadOnlyFieldRenderers & {
      renderEditableField: (field: ChecklistField, options?: { showUnlock?: boolean }) => ReactNode;
    },
) {
  const {
    item,
    readOnly,
    showFieldUnlock,
    compactChrome,
    itemState,
    isClient,
    directFlow,
    enforceClientLock,
    submissionLocked,
    formReadOnly,
    isPre1,
    isPhase2StructuredStep,
    sectionGroups,
    premiumSectionIndex,
    getSectionPending,
    internSectionGroups,
    internSectionNav,
    selectedSectionIndex,
    renderReadOnlyField,
    renderRecordRow,
    renderEditableField,
  } = ctx;

  const isFieldLockedForClient = (fieldId: string) =>
    (enforceClientLock && submissionLocked && !isFieldEditableForClient(itemState, fieldId)) ||
    (isClient && directFlow && isLeadOnlyField(item.id, fieldId)) ||
    // The project lead reads the client's own answers (Part A) and fills only the NIC codes.
    (!isClient && directFlow && isClientOnlyField(item.id, fieldId));

  const showUnlock = showFieldUnlock && submissionLocked && !isClient;
  const groupsForRender =
    internSectionNav && internSectionGroups.length > 0
      ? internSectionGroups.filter((_, index) => index === selectedSectionIndex)
      : sectionGroups;

  const renderedFieldGroups = groupsForRender.map((group, gi) => {
    const fieldIsReadOnly = (fieldId: string) =>
      readOnly || formReadOnly || isFieldLockedForClient(fieldId);
    /**
     * Anyone who only READS a step gets the same record the client gets: a
     * two-column definition list on hairline dividers — the client always, a
     * manager or admin reviewing the lead's answers (`formReadOnly`) too.
     * Only when the whole group is read-only; the lead's working form is
     * untouched.
     */
    const recordLayout =
      (isClient || formReadOnly || (directFlow && group.fields.every((field) => isClientOnlyField(item.id, field.id)))) &&
      group.fields.every((field) => fieldIsReadOnly(field.id));

    const fieldsBlock = recordLayout ? (
      <dl className="milestone-record">{group.fields.map(renderRecordRow)}</dl>
    ) : (
      <div
        className={cn(
          'milestone-form-grid',
          !compactChrome && 'milestone-form-grid-relaxed',
        )}
      >
        {group.fields.map((field) => {
          if (fieldIsReadOnly(field.id)) {
            return renderReadOnlyField(field, { showUnlock });
          }
          return renderEditableField(field, { showUnlock });
        })}
      </div>
    );

    if (internSectionNav && group.section) {
      return (
        <div
          key={group.section}
          role="tabpanel"
          aria-labelledby={`intern-section-tab-${selectedSectionIndex}`}
          className={cn('space-y-3', recordLayout && 'milestone-record-panel')}
        >
          {fieldsBlock}
        </div>
      );
    }

    if ((isPre1 || isPhase2StructuredStep) && group.section) {
      const sectionNum = premiumSectionIndex.get(group.section) ?? gi + 1;
      const pendingItems = getSectionPending(group.fields);
      const complete = pendingItems.length === 0;
      return (
        <Pre1SectionCard
          key={group.section}
          index={sectionNum}
          title={group.section}
          complete={complete}
          pendingItems={pendingItems}
          defaultOpen={!complete}
        >
          {fieldsBlock}
        </Pre1SectionCard>
      );
    }

    return (
      <div
        key={group.section ?? `ungrouped-${gi}`}
        className={cn('space-y-3', recordLayout && 'milestone-record-panel')}
      >
        {group.section && !(compactChrome && group.section === item.title) && (
          <div className="flex items-center gap-1.5">
            <p
              className={
                recordLayout
                  ? 'text-[11.5px] font-semibold tracking-[0.06em] text-ink'
                  : 'text-base font-semibold text-ink'
              }
            >
              {group.section}
            </p>
            <WhatsThisButton compact kind="field" refId={group.section} label={`${item.title}: ${group.section}`} />
          </div>
        )}
        {fieldsBlock}
      </div>
    );
  });

  return renderedFieldGroups;
}
