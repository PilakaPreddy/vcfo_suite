import type { AssistProfileMissing } from '@/lib/assist-profile/types';
import type { PdfCompareResult } from '@/lib/mca-filing/pdf-compare';
import type { FilingDeadline, FilingForm, FilingRemark, FilingState, NextAction } from '@/lib/mca-filing/filing-state';
import type { KnownSigner, SignedPdfCheck, SignerMatch } from '@/lib/mca-filing/signers';
import type { CauseCount, FilingReadiness, PacketPart, SignerReadiness } from '@/lib/mca-filing/readiness';

/** What the routes send. Storage keys stay on the server. */

export interface SignatureRequestEntry {
  signerId: string;
  name: string;
  email: string | null;
  at: string;
  byName: string;
  documentId: string;
  /** sent, or why not: no_email, not_configured, failed. */
  outcome: 'sent' | 'no_email' | 'not_configured' | 'failed';
}

export interface FilingDto {
  form: FilingForm;
  state: FilingState;
  srn: string | null;
  srnAt: string | null;
  nameApprovedAt: string | null;
  signedUploadedAt: string | null;
  paidAt: string | null;
  lastRemark: string | null;
  remarks: FilingRemark[];
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  signatureRequests: SignatureRequestEntry[];
  next: NextAction;
  deadlines: FilingDeadline[];
  moves: FilingState[];
}

export interface PortalPdfCheck extends PdfCompareResult {
  pages: number;
  readerError: string | null;
}

export interface FilingDocumentDto {
  id: string;
  form: FilingForm;
  kind: 'portal_pdf' | 'signed_pdf';
  fileName: string;
  size: number | null;
  sha256: string;
  textHash: string | null;
  signers: SignerMatch[];
  check: PortalPdfCheck | SignedPdfCheck | Record<string, never>;
  stale: boolean;
  uploadedBy: string | null;
  createdAt: string;
}

export interface FilingBundle {
  engagementId: string;
  companyName: string;
  filings: FilingDto[];
  documents: FilingDocumentDto[];
  /** Assist profile fields Suite cannot supply yet. */
  missing: AssistProfileMissing[];
  signers: KnownSigner[];
  /** The checks on each signer, in the order of `signers`. */
  signerChecks: SignerReadiness[];
  /** The latest frozen packet and the parts of the current data that differ from it. */
  packet: { latest: PacketSummaryDto | null; changed: PacketPart[]; currentHash: string };
  /** MCA remark causes seen at least twice across the firm in the last 12 months, as checks. */
  causes: CauseCount[];
  /** One verdict per form, from everything above. */
  readiness: Record<FilingForm, FilingReadiness>;
}

export interface PacketSummaryDto {
  version: number;
  hash: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AssistAttachmentItem {
  key: string;
  group: string;
  label: string;
  /** The attachment's status from the checklist: not-started, waiting or done. */
  status: 'not-started' | 'waiting' | 'done';
  /** True only when the object is really in storage. */
  available: boolean;
  fileName: string | null;
  size: number | null;
  contentType: string | null;
  note: string | null;
}
