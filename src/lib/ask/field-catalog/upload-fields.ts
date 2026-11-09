import { getActiveCatalogItems, type ChecklistField } from '@/data/checklist';
import { getClientResponseFields } from '@/lib/checklist/checklist-responses';
import { isRepeatField } from '@/lib/checklist/checklist-repeat';

/**
 * Every checklist field that takes a file, built from the step definitions so a new upload field is
 * picked up without a list to keep in step. `checklist.attachFile` accepts exactly these, and the
 * drop's sorting maps a recognised document type onto them through `UPLOAD_FIELD_BY_DOC`.
 *
 * A field inside a repeating list (a director's PAN copy) carries the list's id as `group`; the row
 * that fills it names the entry too.
 */
export interface UploadField {
  stepId: string;
  stepTitle: string;
  fieldId: string;
  label: string;
  /** The repeating list the field sits in, for example `directors`. */
  group?: string;
  /** The noun for one entry of that list, for example "Director". */
  entryLabel?: string;
  accept?: string;
}

function collect(): UploadField[] {
  const out: UploadField[] = [];
  for (const item of getActiveCatalogItems()) {
    if (item.bucket !== 'pre-inc' && item.bucket !== 'post-inc') continue;
    const visit = (fields: readonly ChecklistField[], group?: ChecklistField) => {
      for (const field of fields) {
        if (isRepeatField(field)) visit(field.entryFields ?? [], field);
        else if (field.type === 'file') {
          out.push({
            stepId: item.id,
            stepTitle: item.title,
            fieldId: field.id,
            label: field.label,
            ...(group ? { group: group.id, ...(group.entryLabel ? { entryLabel: group.entryLabel } : {}) } : {}),
            ...(field.accept ? { accept: field.accept } : {}),
          });
        }
      }
    };
    visit(getClientResponseFields(item));
  }
  return out;
}

export const UPLOAD_FIELDS: readonly UploadField[] = collect();

const BY_STEP_FIELD = new Map(UPLOAD_FIELDS.map((f) => [`${f.stepId}/${f.fieldId}`, f]));

/** The upload field a step and field id name, or undefined when it is not a file field. */
export function uploadField(stepId: string, fieldId: string): UploadField | undefined {
  return BY_STEP_FIELD.get(`${stepId}/${fieldId}`);
}

export function isUploadField(stepId: string, fieldId: string): boolean {
  return BY_STEP_FIELD.has(`${stepId}/${fieldId}`);
}

/**
 * Which upload fields a recognised document can fill, by the reader's docType, in order of
 * preference. Only incorporation steps (pre-inc and post-inc) take files from chat, the same rule
 * as `isWritableUse`, so a GST certificate goes to the vault. Field ids are listed here; the steps
 * come from `UPLOAD_FIELDS`, so a field that is moved or retired drops out on its own. A docType
 * with no entry goes to the document vault.
 */
const FIELD_IDS_BY_DOC: Readonly<Record<string, readonly string[]>> = {
  pan_card: ['panCopyUrl'],
  aadhaar_card: ['aadhaarCopyUrl'],
  passport: ['passportCopyUrl'],
  driving_licence: ['drivingLicenceCopyUrl'],
  utility_bill: ['utilityBillCopyUrl', 'registeredOfficeUtilityBillCopyUrl'],
  incorporation_certificate: ['certificateOfIncorporationFinalUrl', 'certificateOfIncorporationUrl'],
};

export const UPLOAD_FIELD_BY_DOC: Readonly<Record<string, readonly UploadField[]>> = Object.fromEntries(
  Object.entries(FIELD_IDS_BY_DOC).map(([docType, ids]) => [docType, ids.flatMap((id) => UPLOAD_FIELDS.filter((f) => f.fieldId === id))]),
);

/**
 * The director's copy field for an identity document, the shape the data router used before drops
 * (`plan.ts`). Kept as an alias of `UPLOAD_FIELD_BY_DOC` so that caller compiles unchanged.
 */
export const COPY_FIELD_BY_DOC: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(UPLOAD_FIELD_BY_DOC)
    .map(([docType, fields]) => [docType, fields.find((f) => f.group === 'directors')?.fieldId] as const)
    .filter((pair): pair is readonly [string, string] => Boolean(pair[1])),
);
