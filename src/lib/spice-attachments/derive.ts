import { checklist, type StatusCode } from '@/data/checklist';
import type { DocPackItem, DocPackSummary } from '@/lib/doc-pack/types';

/**
 * SPICe+ ATTACHMENTS — pure read model (spec T6 of the Board resolution (NOC) page,
 * docs/ui-port/BR-NOC-API.md).
 *
 * The documents MCA SPICe+ Part B needs as attachments, each with a status from records that
 * already exist: the checklist step status, the document pack readiness, and the board
 * resolution (NOC) state. Nothing is stored for this list. Nothing here touches the database,
 * S3 or React, so the derivation is safe in a client component and easy to test.
 *
 * Rules:
 *   - SPICe+ Filing (pre-10) completed: every attachment is Done ("Filed with SPICe+").
 *   - Board resolution (NOC): Done when Accepted, with the vault copy. Waiting when a draft or
 *     a signed copy exists, or its steps have started. It is left out when the company has no
 *     board resolution (its steps are not applicable).
 *   - A step-backed attachment follows its step: completed is Done, not started is Not started,
 *     anything else (in progress, waiting on the client, overdue) is Waiting.
 *   - A generated document (DIR-2, INC-9, MOA, AOA) is Done when every copy in the document pack
 *     is ready, Waiting when a source step (the pack registry's `sourceStepIds`) has started,
 *     else Not started.
 */

export type SpiceAttachmentStatus = 'not-started' | 'waiting' | 'done';

export const SPICE_ATTACHMENT_STATUS_LABEL: Record<SpiceAttachmentStatus, string> = {
  'not-started': 'Not started',
  waiting: 'Waiting',
  done: 'Done',
};

export interface SpiceAttachment {
  key: string;
  label: string;
  /** The checklist step that holds the attachment (its title is shown as "From"). */
  stepId: string;
  stepTitle: string;
  status: SpiceAttachmentStatus;
  /** A short state value: "Accepted", "2 of 2 copies ready", "Needs 3 inputs". */
  detail: string;
  /** The Vault document to open, when there is one (the accepted board resolution). */
  vaultDocumentId: string | null;
}

export interface SpiceAttachmentList {
  items: SpiceAttachment[];
  done: number;
  total: number;
}

/** The board resolution (NOC) facts the list needs (from `NocState`). */
export interface SpiceNocFacts {
  drafted: boolean;
  signed: boolean;
  accepted: boolean;
  vaultDocumentId: string | null;
}

export interface SpiceAttachmentInputs {
  /** The display status of a checklist step; undefined reads as not started. */
  stepStatus: (stepId: string) => StatusCode | undefined;
  /** Null when the pack could not be read: generated documents then follow their step. */
  docPack: DocPackSummary | null;
  noc: SpiceNocFacts | null;
}

type Def =
  | { key: string; label: string; kind: 'noc'; stepId: string }
  | { key: string; label: string; kind: 'step'; stepId: string; needsBoardResolution?: boolean }
  | { key: string; label: string; kind: 'pack'; stepId: string; docIds: string[]; sources: string[] };

/** The SPICe+ Part B attachments, in the order the MCA form asks for them. */
const SPICE_ATTACHMENT_DEFS: readonly Def[] = [
  { key: 'board-resolution', label: 'Board resolution (NOC)', kind: 'noc', stepId: 'pre-3' },
  { key: 'parent-proof', label: 'Parent entity certificate of incorporation', kind: 'step', stepId: 'pre-1', needsBoardResolution: true },
  { key: 'office-proof', label: 'Registered office proof: owner’s NOC and utility bill', kind: 'step', stepId: 'pre-14' },
  { key: 'director-kyc', label: 'Director KYC: identity and address proof', kind: 'step', stepId: 'pre-15' },
  { key: 'dir-2', label: 'DIR-2 consent to act as director', kind: 'pack', stepId: 'pre-7', docIds: ['dir-2'], sources: ['pre-5', 'pre-15'] },
  { key: 'inc-9', label: 'INC-9 declaration by first director', kind: 'pack', stepId: 'pre-7', docIds: ['inc-9'], sources: ['pre-5', 'pre-15'] },
  { key: 'moa', label: 'Memorandum of association (MOA)', kind: 'pack', stepId: 'pre-7', docIds: ['moa'], sources: ['pre-1', 'pre-5', 'pre-13', 'pre-14'] },
  { key: 'aoa', label: 'Articles of association (AOA)', kind: 'pack', stepId: 'pre-7', docIds: ['aoa'], sources: ['pre-5', 'pre-15'] },
];

const FILING_STEP = 'pre-10';

function stepTitle(stepId: string): string {
  return checklist.find((it) => it.id === stepId)?.title ?? stepId;
}

/** One step status as an attachment status. */
export function statusFromStep(status: StatusCode | undefined): SpiceAttachmentStatus {
  if (status === 'completed') return 'done';
  if (!status || status === 'not-started') return 'not-started';
  return 'waiting';
}

function started(status: StatusCode | undefined): boolean {
  return Boolean(status && status !== 'not-started' && status !== 'not-applicable');
}

function nocRow(inputs: SpiceAttachmentInputs): { status: SpiceAttachmentStatus; detail: string; vault: string | null } {
  const noc = inputs.noc;
  if (noc?.accepted) return { status: 'done', detail: 'Accepted', vault: noc.vaultDocumentId };
  if (noc?.signed) return { status: 'waiting', detail: 'Signed copy to receive', vault: null };
  if (noc?.drafted) return { status: 'waiting', detail: 'Drafted', vault: null };
  const s2 = inputs.stepStatus('pre-2');
  const s3 = inputs.stepStatus('pre-3');
  if (started(s2) || started(s3)) return { status: 'waiting', detail: 'In progress', vault: null };
  return { status: 'not-started', detail: 'No draft yet', vault: null };
}

function packRow(
  copies: DocPackItem[],
  sourceStarted: boolean,
): { status: SpiceAttachmentStatus; detail: string } {
  if (copies.length === 0) return { status: sourceStarted ? 'waiting' : 'not-started', detail: 'No director yet' };
  const ready = copies.filter((c) => c.status === 'ready').length;
  const copyWord = copies.length === 1 ? 'copy' : 'copies';
  if (ready === copies.length) return { status: 'done', detail: `${ready} of ${copies.length} ${copyWord} ready` };
  const missing = new Set(copies.flatMap((c) => c.missing.map((m) => m.key))).size;
  const waitsRelease = copies.some((c) => c.status === 'waiting-release');
  const detail = missing > 0 ? `Needs ${missing} input${missing === 1 ? '' : 's'}` : waitsRelease ? 'Waits on a release' : `${ready} of ${copies.length} ${copyWord} ready`;
  return { status: sourceStarted || ready > 0 ? 'waiting' : 'not-started', detail };
}

export function deriveSpiceAttachments(inputs: SpiceAttachmentInputs): SpiceAttachmentList {
  const filed = inputs.stepStatus(FILING_STEP) === 'completed';
  const boardResolutionApplies =
    inputs.stepStatus('pre-3') !== 'not-applicable' && inputs.stepStatus('pre-2') !== 'not-applicable';

  const items: SpiceAttachment[] = [];
  for (const def of SPICE_ATTACHMENT_DEFS) {
    if ((def.kind === 'noc' || (def.kind === 'step' && def.needsBoardResolution)) && !boardResolutionApplies) continue;
    if (def.kind === 'step' && inputs.stepStatus(def.stepId) === 'not-applicable') continue;

    const base = { key: def.key, label: def.label, stepId: def.stepId, stepTitle: stepTitle(def.stepId) };
    if (def.kind === 'noc') {
      const row = nocRow(inputs);
      // An accepted copy keeps its own state and link even after the filing.
      if (filed && row.status !== 'done') {
        items.push({ ...base, status: 'done', detail: 'Filed with SPICe+', vaultDocumentId: null });
      } else {
        items.push({ ...base, status: row.status, detail: row.detail, vaultDocumentId: row.vault });
      }
      continue;
    }
    if (filed) {
      items.push({ ...base, status: 'done', detail: 'Filed with SPICe+', vaultDocumentId: null });
      continue;
    }
    if (def.kind === 'step') {
      const status = statusFromStep(inputs.stepStatus(def.stepId));
      const detail = status === 'done' ? 'Received' : status === 'waiting' ? 'In progress' : 'Not asked yet';
      items.push({ ...base, status, detail, vaultDocumentId: null });
      continue;
    }
    if (!inputs.docPack) {
      const status = statusFromStep(inputs.stepStatus(def.stepId));
      items.push({ ...base, status, detail: status === 'done' ? 'Received' : 'Pack not read', vaultDocumentId: null });
      continue;
    }
    const copies = inputs.docPack.items.filter((it) => def.docIds.includes(it.docId));
    const sources = [...new Set([...def.sources, ...copies.flatMap((c) => c.sourceStepIds)])];
    const sourceStarted = sources.some((id) => started(inputs.stepStatus(id))) || started(inputs.stepStatus(def.stepId));
    const row = packRow(copies, sourceStarted);
    items.push({ ...base, status: row.status, detail: row.detail, vaultDocumentId: null });
  }

  return { items, done: items.filter((it) => it.status === 'done').length, total: items.length };
}
