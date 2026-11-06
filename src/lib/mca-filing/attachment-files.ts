import { getItem } from '@/data/checklist';
import { extractItemResponses, type ChecklistItemResponses } from '@/lib/checklist/checklist-responses';
import { resolveRegisteredOfficeResponses } from '@/lib/checklist/registered-office-responses';
import { isMilestoneStoragePath, MILESTONE_DOCUMENTS_BUCKET } from '@/lib/documents/milestone-document-storage';
import {
  directorEntriesFromDirectors,
  readProposedDirectors,
  type DirectorEntry,
  type StepStateMap,
} from '@/lib/incorporation/proposed-directors';
import { directorSignedFieldIdFor, draftFieldIdFor, type IncorpDocKind } from '@/lib/incorporation-docs/types';
import type { SpiceAttachment } from '@/lib/spice-attachments/derive';
import { EXTENSION_TO_MIME } from '@/lib/upload-limits';

/**
 * ATTACHMENT FILES — pure. `getSpiceAttachments` says how far each SPICe+ attachment has got; this
 * says which stored object, if any, is the file. One attachment can be several files (the office
 * proof is two, the KYC several per director), and the extension fetches one file by one key, so
 * those rows split into keys such as `office-proof.noc` and `director-kyc.1.pan`.
 *
 * Where the files live:
 *   - board-resolution: the accepted signed copy (its Vault document, else the signed path).
 *   - parent-proof: `certificateOfIncorporationUrl` on `pre-1`.
 *   - office-proof: `registeredOfficeNocUrl` and `registeredOfficeUtilityBillCopyUrl` on `pre-14`.
 *   - director-kyc: the copy fields of each `pre-15` entry.
 *   - dir-2, inc-9: a signed upload on the legacy `pre-8` step, on older engagements only.
 *   - moa, aoa: only a Word draft on `pre-7`; Suite holds no signed or PDF copy.
 *
 * A Word draft is never offered as the file. It is unsigned, and the portal takes PDFs. A row with
 * no stored object has `storagePath` null and is reported as not available, never guessed.
 */

export interface AttachmentSlot {
  key: string;
  /** The `SPICE_ATTACHMENT_DEFS` key this file belongs to. */
  group: string;
  label: string;
  status: SpiceAttachment['status'];
  /** The full object key in storage, inside this engagement; null when there is no file. */
  storageKey: string | null;
  /** Why it is not available, or what to do with it; null when nothing needs saying. */
  note: string | null;
}

export interface AttachmentSlotInput {
  /** The engagement's database id: a stored path outside it is refused. */
  dbId: string;
  items: SpiceAttachment[];
  state: StepStateMap;
  /** The accepted board resolution's object key, already a full storage key; else null. */
  boardResolutionKey: string | null;
}

const NO_UPLOAD = 'No file is stored in Suite yet.';
const WORD_DRAFT_ONLY = 'Suite holds only an unsigned Word draft. Add the signed PDF on the portal by hand.';
const NOT_STORED = 'Suite does not store a signed copy of this document. Add it on the portal by hand.';

function responsesOf(state: StepStateMap, stepId: string): ChecklistItemResponses {
  const item = getItem(stepId);
  return item ? extractItemResponses(item, state?.[stepId]) : {};
}

/** A stored checklist value as a storage key, only when it is this engagement's own object. */
export function ownMilestoneKey(dbId: string, value: string | undefined | null): string | null {
  const path = (value ?? '').trim().replace(/^\/+/, '');
  if (!path || path.includes('..') || !isMilestoneStoragePath(path)) return null;
  if (!path.startsWith(`${dbId}/`)) return null;
  return `${MILESTONE_DOCUMENTS_BUCKET}/${path}`;
}

/** The name a person sees: the last path segment without the upload time. */
export function fileNameFromKey(key: string): string {
  return (key.split('/').pop() ?? 'document').replace(/^\d+-/, '') || 'document';
}

export function contentTypeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return (EXTENSION_TO_MIME as Record<string, string>)[ext] ?? 'application/octet-stream';
}

/** The KYC copies a director needs, by residency; an optional copy appears only when stored. */
const KYC_COPIES: Array<{ part: string; label: string; field: string; requiredFor: 'yes' | 'no' | 'both' | null }> = [
  { part: 'aadhaar', label: 'Aadhaar', field: 'aadhaarCopyUrl', requiredFor: 'yes' },
  { part: 'pan', label: 'PAN', field: 'panCopyUrl', requiredFor: 'yes' },
  { part: 'passport', label: 'passport', field: 'passportCopyUrl', requiredFor: 'no' },
  { part: 'driving-licence', label: 'driving licence', field: 'drivingLicenceCopyUrl', requiredFor: null },
  { part: 'utility-bill', label: 'utility bill', field: 'utilityBillCopyUrl', requiredFor: 'both' },
  { part: 'photo', label: 'photograph', field: 'recentPhotographUrl', requiredFor: null },
];

function directorKycSlots(input: AttachmentSlotInput, item: SpiceAttachment): AttachmentSlot[] {
  const directors = readProposedDirectors(input.state);
  const out: AttachmentSlot[] = [];
  for (const director of directors) {
    const resident = (director.values.indiaResident ?? '').trim();
    const name = [director.values.firstName, director.values.lastName].map((v) => (v ?? '').trim()).filter(Boolean).join(' ') || `Director ${director.index}`;
    for (const copy of KYC_COPIES) {
      const storageKey = ownMilestoneKey(input.dbId, director.values[copy.field]);
      const required = copy.requiredFor === 'both' || copy.requiredFor === resident;
      if (!storageKey && !required) continue;
      out.push({
        key: `${item.key}.${director.index}.${copy.part}`,
        group: item.key,
        label: `Director KYC: ${name}, ${copy.label}`,
        status: item.status,
        storageKey,
        note: storageKey ? null : NO_UPLOAD,
      });
    }
  }
  return out.length ? out : [{ key: item.key, group: item.key, label: item.label, status: item.status, storageKey: null, note: 'No director is listed yet.' }];
}

function directorDocSlots(
  input: AttachmentSlotInput,
  item: SpiceAttachment,
  doc: IncorpDocKind,
  entries: DirectorEntry[],
  pre7: ChecklistItemResponses,
  pre8: ChecklistItemResponses,
): AttachmentSlot[] {
  const out: AttachmentSlot[] = [];
  for (const entry of entries) {
    const signedField = directorSignedFieldIdFor(doc, entry.key);
    const draftField = draftFieldIdFor(doc, entry.key);
    if (!signedField && !draftField) continue;
    const storageKey = signedField ? ownMilestoneKey(input.dbId, pre8[signedField]) : null;
    const hasDraft = Boolean(draftField && ownMilestoneKey(input.dbId, pre7[draftField]));
    out.push({
      key: `${item.key}.${entry.director.index}`,
      group: item.key,
      label: `${item.label}: ${entry.displayName}`,
      status: item.status,
      storageKey,
      note: storageKey ? null : hasDraft ? WORD_DRAFT_ONLY : NOT_STORED,
    });
  }
  return out.length ? out : [{ key: item.key, group: item.key, label: item.label, status: item.status, storageKey: null, note: 'No director is listed yet.' }];
}

/** One row per file the extension could fetch, in the order of the attachment list. */
export function attachmentSlots(input: AttachmentSlotInput): AttachmentSlot[] {
  const pre1 = responsesOf(input.state, 'pre-1');
  const pre7 = responsesOf(input.state, 'pre-7');
  const pre8 = responsesOf(input.state, 'pre-8');
  const office = resolveRegisteredOfficeResponses(responsesOf(input.state, 'pre-6'), pre8, responsesOf(input.state, 'pre-14'));
  const entries = directorEntriesFromDirectors(readProposedDirectors(input.state));

  const out: AttachmentSlot[] = [];
  for (const item of input.items) {
    const one = (key: string, label: string, storageKey: string | null, note: string | null) =>
      out.push({ key, group: item.key, label, status: item.status, storageKey, note: storageKey ? null : note });
    switch (item.key) {
      case 'board-resolution':
        one(item.key, item.label, input.boardResolutionKey, 'Available once the signed board resolution is accepted.');
        break;
      case 'parent-proof':
        one(item.key, item.label, ownMilestoneKey(input.dbId, pre1.certificateOfIncorporationUrl), NO_UPLOAD);
        break;
      case 'office-proof':
        one(`${item.key}.noc`, 'Registered office proof: owner’s NOC', ownMilestoneKey(input.dbId, office.registeredOfficeNocUrl), NO_UPLOAD);
        one(`${item.key}.utility-bill`, 'Registered office proof: utility bill', ownMilestoneKey(input.dbId, office.registeredOfficeUtilityBillCopyUrl), NO_UPLOAD);
        break;
      case 'director-kyc':
        out.push(...directorKycSlots(input, item));
        break;
      case 'dir-2':
      case 'inc-9':
        out.push(...directorDocSlots(input, item, item.key, entries, pre7, pre8));
        break;
      case 'moa':
      case 'aoa': {
        const draft = ownMilestoneKey(input.dbId, pre7[draftFieldIdFor(item.key, 'company') ?? '']);
        one(item.key, item.label, null, draft ? WORD_DRAFT_ONLY : NOT_STORED);
        break;
      }
      default:
        one(item.key, item.label, null, NO_UPLOAD);
    }
  }
  return out;
}
