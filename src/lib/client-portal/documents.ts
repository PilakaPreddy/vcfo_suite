/**
 * Client portal v7 — Documents page model (pure; shared by the repository,
 * the API routes and the page components).
 *
 * One flat list of "document nodes" for the client's engagement, merged on
 * the server from every source the client may read:
 *   - checklist uploads (paths in the client-redacted `checklist_state`),
 *     with earlier S3 uploads of the same field as "Replaced" versions
 *   - indexed `documents` rows shared with the client
 *   - the finalized board resolution (+ the signed copy)
 *   - document requests: open ones as outlined "missing" rows, answered ones
 *     as files (with their own version history)
 * The page builds the phase → step (or category) tree from it with the
 * shared step model (`usePortalIncorporation()`).
 */
import { getIncorporationPhases } from '@/data/checklist';

export type DocStatus = 'Final' | 'Approved' | 'In review' | 'Replaced' | 'Missing';
export type DocCategoryId = 'c1' | 'c2' | 'c3' | 'c4' | 'c5';

export interface DocNode {
  /** Stable id within the engagement (also the `?doc=` deep link). */
  id: string;
  /** File reference for `/api/client/documents/file?ref=` (absent for missing rows). */
  ref?: string;
  /** Readable row name ("PAN card — Ravi Kumar"). */
  label: string;
  /** Actual file name ("ravi-kumar-pan.pdf"); "—" for missing rows. */
  fileName: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  status: DocStatus;
  /** An older upload replaced by a newer file (hidden by default). */
  replaced: boolean;
  /** "SBC · Arjun Mehta" · "Northwind" · "Asked by Arjun Mehta". */
  from: string;
  fromSbc: boolean;
  /** Upload / delivery date (ISO), or the due date for a missing row. */
  date?: string;
  /** Checklist item id of the owning step; undefined → "Other documents". */
  stepId?: string;
  categoryId: DocCategoryId;
  /** Dated proof older than 2 months. */
  stale?: boolean;
  /** A signed copy (a checklist field ending in "Signed", or the signed board resolution). */
  signed?: boolean;
  portal?: { label: string; url: string };
  /** Missing rows (open document requests). */
  requestId?: string;
  due?: string;
  overdue?: boolean;
  /** SBC's reason when they asked for a new file. */
  note?: string;
  noteBy?: string;
  /** Source, for the viewer's info line. */
  source: 'milestone' | 'index' | 'board-resolution' | 'request';
  /** Staff reads only: the documents-table row behind the file, for the Vault's review and delete. */
  indexRow?: {
    id: string;
    uploadedBy: string | null;
    reviewStatus: string;
    reviewNote: string | null;
    reviewedAt: string | null;
    replacedAt: string | null;
  };
}

export interface OpenRequest {
  id: string;
  label: string;
  due?: string;
  overdue: boolean;
  stepId?: string;
  note?: string;
  noteBy?: string;
  askedBy?: string;
  /** Re-upload: a file was sent before and SBC asked again. */
  reupload: boolean;
}

export interface ClientDocumentsPayload {
  engagementId: string;
  companyName: string;
  companyShort: string;
  nodes: DocNode[];
  openRequests: OpenRequest[];
  /** "PDF · JPG · PNG · DOCX · up to 50 MB" — accepted upload types. */
  accept: { exts: string[]; maxLabel: string };
}

export const DOC_CATEGORIES: Array<{ id: DocCategoryId; name: string }> = [
  { id: 'c1', name: 'Identity & KYC' },
  { id: 'c2', name: 'Office address' },
  { id: 'c3', name: 'Company records' },
  { id: 'c4', name: 'Certificates' },
  { id: 'c5', name: 'Banking & capital' },
];

const STEP_CATEGORY: Record<string, DocCategoryId> = {
  'pre-1': 'c1',
  'pre-2': 'c3',
  'pre-3': 'c3',
  'pre-6': 'c1',
  'pre-7': 'c1',
  'pre-15': 'c1',
  'pre-16': 'c1',
  'pre-14': 'c2',
  'post-10': 'c2',
  'post-11': 'c2',
  'pre-12': 'c4',
  'post-5': 'c4',
  'post-6': 'c4',
  'post-3': 'c5',
  'post-4': 'c5',
  'post-7': 'c5',
  'reg-20': 'c5',
  'reg-21': 'c5',
  'reg-22': 'c5',
  'reg-23': 'c5',
  'reg-24': 'c5',
};

/** Field-level overrides (a certificate filed on a records step, KYC on a capital step…). */
const FIELD_CATEGORY: Array<[RegExp, DocCategoryId]> = [
  // Word boundaries: "Reso-lut-ion" is not a LUT, "Ordinary" is not a DIN.
  [/\bpan\b|passport|aadhaar|kyc|photo|identity|\bdsc\b|\bdin\b/i, 'c1'],
  [/utility|electricity|rent|lease|\bnoc\b|office|premises|address proof/i, 'c2'],
  [/certificate|registration|\blut\b|udyam|\biec\b|\bgst/i, 'c4'],
  [/firc|bank|statement|remittance|capital|kyc letter/i, 'c5'],
];

export function categoryFor(stepId: string | undefined, label: string): DocCategoryId {
  if (stepId && STEP_CATEGORY[stepId]) return STEP_CATEGORY[stepId]!;
  for (const [re, c] of FIELD_CATEGORY) if (re.test(label)) return c;
  if (stepId?.startsWith('reg-')) return 'c4';
  return 'c3';
}

/** Rule 15: official portal to verify a firm-issued document. */
const FIELD_PORTAL: Record<string, { label: string; url: string }> = {
  certificateOfIncorporationFinalUrl: { label: 'MCA portal', url: 'https://www.mca.gov.in' },
  moaSubscriptionSheetSignedUrl: { label: 'MCA portal', url: 'https://www.mca.gov.in' },
  aoaSubscriptionSheetSignedUrl: { label: 'MCA portal', url: 'https://www.mca.gov.in' },
  panCardFinalUrl: { label: 'Income-tax e-filing', url: 'https://www.incometax.gov.in' },
  tanCardFinalUrl: { label: 'Income-tax e-filing', url: 'https://www.incometax.gov.in' },
  gstCertificateUrl: { label: 'GST portal', url: 'https://www.gst.gov.in' },
  iecCertificateUrl: { label: 'DGFT portal', url: 'https://www.dgft.gov.in' },
};

export function portalForField(fieldId: string): { label: string; url: string } | undefined {
  return FIELD_PORTAL[fieldId];
}

/** Stale-proof rule: dated proofs (bills, statements) older than 60 days. */
const STALE_LABEL = /utility|electricity|telephone|phone bill|gas bill|water bill|bank statement|address proof/i;
const STALE_MAX_DAYS = 60;

export function isStaleProof(label: string, dateIso: string | undefined, today = new Date()): boolean {
  if (!dateIso || !STALE_LABEL.test(label)) return false;
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return false;
  return today.getTime() - t > STALE_MAX_DAYS * 86_400_000;
}

/** 1-based step number across the client step order (matches the step model `n`). */
export function stepNumbers(): Record<string, { n: number; title: string; phaseId: string; phaseTitle: string; phaseNo: number }> {
  const out: Record<string, { n: number; title: string; phaseId: string; phaseTitle: string; phaseNo: number }> = {};
  let n = 0;
  getIncorporationPhases().forEach((phase, pi) => {
    for (const item of phase.items) {
      n += 1;
      out[item.id] = { n, title: item.title, phaseId: phase.id, phaseTitle: phase.title, phaseNo: pi + 1 };
    }
  });
  return out;
}

/** Zip-safe path segment. */
export function zipSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled';
}

export const OTHER_PHASE_ID = 'other';
export const OTHER_PHASE_TITLE = 'Other documents';
