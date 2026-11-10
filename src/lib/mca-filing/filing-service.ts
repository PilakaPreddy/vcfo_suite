import 'server-only';

import { createHash } from 'node:crypto';
import type { AuthContext } from '@/auth/guards';
import {
  freezePacket,
  getFilingRecords,
  getFilingUploadContext,
  packetStatus,
  portalPdfForSigners,
  recordSignatureRequests,
  remarkCausesSince,
  saveSignedPdf,
  savePortalPdf,
  setSignerFacts,
  signerFactsOf,
  type SignerFactsPatch,
} from '@/db/repositories/assist-filings';
import { listAssistAttachments } from '@/db/repositories/assist-attachments';
import { getDocPackInputs } from '@/db/repositories/doc-pack';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { buildAssistProfile } from '@/lib/assist-profile/build';
import { buildDocPackContext } from '@/lib/doc-pack/evaluate';
import { emailParagraph, escapeHtml, renderEmailDocument } from '@/lib/email/email-layout';
import { sendEmail } from '@/lib/email/send-email';
import { readProposedDirectors } from '@/lib/incorporation/proposed-directors';
import { FILING_FORMS, FILING_FORM_LABEL, FilingRefusal, istDate, type FilingForm } from '@/lib/mca-filing/filing-state';
import { packetHash } from '@/lib/mca-filing/packet-hash';
import { filingReadiness, packetContent, repeatCauses, signerReadiness, type FilingReadiness, type PacketPart } from '@/lib/mca-filing/readiness';
import { comparePdfText, flattenExpected } from '@/lib/mca-filing/pdf-compare';
import { readPdfSignatures } from '@/lib/mca-filing/pdf-signatures';
import { extractPdfText } from '@/lib/mca-filing/pdf-text';
import { checkSignedPdf, knownSigners, type KnownSigner } from '@/lib/mca-filing/signers';
import type { FilingBundle, PortalPdfCheck, SignatureRequestEntry } from '@/lib/mca-filing/types';

/**
 * MCA FILING SERVICE — the steps a route runs in order: read the PDF, run the pure checks, store
 * through the repository, record the audit event. It never talks to the MCA portal and never signs.
 * Audit summaries carry no remark or note text, because clients can read their engagement's events.
 */

const SIGN_LINK_SECONDS = 72 * 3600;

export const MAX_FILING_PDF_BYTES = 15 * 1024 * 1024;

/** The profile and signers of one engagement. Null when out of scope. */
async function filingProfile(ctx: AuthContext, engagementParam: string) {
  const access = await getDocPackInputs(ctx, engagementParam);
  if (access.ok === false) return null;
  const { inputs } = access;
  const result = buildAssistProfile(buildDocPackContext({ state: inputs.checklistState, brRow: inputs.brRow, engagement: inputs.engagement }));
  const signers = knownSigners(result.profile, readProposedDirectors(inputs.checklistState));
  return { result, signers };
}

/** Remark causes count over the last 12 months. */
const CAUSE_WINDOW_DAYS = 365;

/** The data a packet freezes: profile, attachment list, signers and missing keys. */
async function currentPacket(ctx: AuthContext, engagementParam: string, profile: NonNullable<Awaited<ReturnType<typeof filingProfile>>>) {
  const listed = await listAssistAttachments(ctx, engagementParam);
  const attachments = listed.ok ? listed.value.items : null;
  const content = packetContent(profile.result.profile, attachments ?? [], profile.signers, profile.result.missing);
  return { attachments, content, hash: packetHash(content) };
}

export async function filingBundle(ctx: AuthContext, engagementParam: string): Promise<FilingBundle | null> {
  const records = await getFilingRecords(ctx, engagementParam);
  if (!records) return null;
  const profile = await filingProfile(ctx, engagementParam);
  const today = istDate(new Date());
  const signers = profile?.signers ?? [];
  const facts = await signerFactsOf(records.dbId);
  const signerChecks = signers.map((s) => signerReadiness(s, facts.get(s.id), today));
  const packet = profile ? await currentPacket(ctx, engagementParam, profile) : null;
  const raw = packet ? await packetStatus(records.dbId, packet.content, packet.hash) : { latest: null, changed: [] as PacketPart[] };
  // Storage that could not be read is not a change to the attachment list.
  const status = packet?.attachments === null ? { ...raw, changed: raw.changed.filter((p) => p !== 'attachments') } : raw;
  const since = new Date(Date.now() - CAUSE_WINDOW_DAYS * 86_400_000).toISOString();
  const causes = repeatCauses(await remarkCausesSince(ctx, since));
  const missing = profile?.result.missing ?? [];
  const readiness = Object.fromEntries(
    FILING_FORMS.map((form) => [
      form,
      filingReadiness({
        form,
        missing,
        attachments: packet?.attachments ?? null,
        signers: signerChecks,
        packet: { frozenVersion: status.latest?.version ?? null, changed: status.changed, portalPdf: records.documents.some((d) => d.form === form && d.kind === 'portal_pdf') },
        causes,
      }),
    ]),
  ) as Record<FilingForm, FilingReadiness>;
  return {
    engagementId: records.engagementId,
    companyName: records.companyName,
    filings: records.filings,
    documents: records.documents,
    missing,
    signers,
    signerChecks,
    packet: { latest: status.latest, changed: status.changed, currentHash: packet?.hash ?? '' },
    causes,
    readiness,
  };
}

/** Record what staff confirmed about one signer's MCA set-up. Null when out of scope. */
export async function recordSignerFacts(ctx: AuthContext, engagementParam: string, signerId: string, patch: SignerFactsPatch) {
  const profile = await filingProfile(ctx, engagementParam);
  if (!profile) return null;
  if (!profile.signers.some((s) => s.id === signerId)) throw new FilingRefusal('unknown_signer', 'Suite does not list this signer for the company.', 404);
  const saved = await setSignerFacts(ctx, engagementParam, signerId, patch);
  if (!saved) return null;
  await recordAuditEvent(ctx, {
    engagementId: saved.dbId,
    action: 'assist_filing.signer_confirmed',
    summary: 'Recorded a signer\'s MCA set-up',
    // Field names only, as with remarks.
    metadata: { fields: Object.keys(patch) },
  });
  return saved;
}

/** Freeze the current data as the next filing packet. Null when out of scope. */
export async function freezeFilingPacket(ctx: AuthContext, engagementParam: string, note: string | null) {
  const profile = await filingProfile(ctx, engagementParam);
  if (!profile) return null;
  const current = await currentPacket(ctx, engagementParam, profile);
  if (current.attachments === null) throw new FilingRefusal('attachments_unreadable', 'The attachment list could not be read, so the packet would be incomplete.', 503);
  const saved = await freezePacket(ctx, engagementParam, current.content, current.hash, note);
  if (!saved) return null;
  if (saved.created) {
    await recordAuditEvent(ctx, {
      engagementId: saved.dbId,
      action: 'assist_filing.packet_frozen',
      summary: `Froze filing packet ${saved.packet.version}`,
      metadata: { version: saved.packet.version },
    });
  }
  return saved;
}

const safeName = (name: string) => name.replace(/[^\p{L}\p{N}._ ()-]+/gu, '_').slice(0, 160) || 'filing.pdf';

/** A PDF starts with its header within the first kilobyte. */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 1024).includes('%PDF-');
}

export async function uploadPortalPdf(ctx: AuthContext, engagementParam: string, form: FilingForm, fileName: string, bytes: Buffer) {
  const profile = await filingProfile(ctx, engagementParam);
  if (!profile) return null;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const text = await extractPdfText(bytes);
  const compare = comparePdfText(text.text, text.unreadable, flattenExpected(profile.result.profile, form));
  const check: PortalPdfCheck = { ...compare, pages: text.pages, readerError: text.error };
  const saved = await savePortalPdf(ctx, engagementParam, form, { fileName: safeName(fileName), bytes, sha256, textHash: text.textHash, check });
  if (!saved) return null;
  if (saved.created) {
    await recordAuditEvent(ctx, {
      engagementId: saved.dbId,
      action: 'assist_filing.portal_pdf_added',
      summary: `Added the ${FILING_FORM_LABEL[form]} portal PDF`,
      metadata: { form, documentId: saved.document.id, sha256, missing: compare.missing.length, unreadable: compare.unreadable, textChanged: saved.textChanged },
    });
  }
  return saved;
}

export async function uploadSignedPdf(ctx: AuthContext, engagementParam: string, form: FilingForm, fileName: string, bytes: Buffer) {
  const context = await getFilingUploadContext(ctx, engagementParam, form);
  const profile = context ? await filingProfile(ctx, engagementParam) : null;
  if (!context || !profile) return null;
  const refuse = async (e: FilingRefusal) => {
    await recordAuditEvent(ctx, {
      engagementId: context.dbId,
      action: 'assist_filing.signed_pdf_refused',
      summary: `Refused a signed ${FILING_FORM_LABEL[form]} PDF`,
      metadata: { form, code: e.code },
      result: 'denied',
    });
    return e;
  };
  try {
    if (form !== 'spice-part-b') throw new FilingRefusal('signed_pdf_part_b_only', 'Only SPICe+ Part B takes a signed PDF here.', 422);
    if (!context.portal) throw new FilingRefusal('no_portal_pdf', 'Add the unsigned PDF from the portal before a signed copy.');
    if (!context.reviewedAt) throw new FilingRefusal('not_reviewed', 'The professional has not approved the PDF yet.');
    const text = await extractPdfText(bytes);
    const { check, matches } = checkSignedPdf({
      signatures: readPdfSignatures(bytes),
      textHash: text.textHash,
      portalTextHash: context.portal.textHash,
      signers: profile.signers,
      professionalName: context.reviewedByName,
    });
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const saved = await saveSignedPdf(ctx, engagementParam, form, {
      fileName: safeName(fileName),
      bytes,
      sha256,
      textHash: text.textHash,
      signers: matches,
      check,
      allSigned: check.missingSigners.length === 0,
    });
    if (saved?.created) {
      await recordAuditEvent(ctx, {
        engagementId: saved.dbId,
        action: 'assist_filing.signed_pdf_added',
        summary: `Added a signed ${FILING_FORM_LABEL[form]} PDF with ${matches.length} signature${matches.length === 1 ? '' : 's'}`,
        metadata: { form, documentId: saved.document.id, sha256, signatures: matches.length, missingSigners: check.missingSigners.length },
      });
    }
    return saved;
  } catch (e) {
    if (e instanceof FilingRefusal) throw await refuse(e);
    throw e;
  }
}

function signatureEmail(input: { signerName: string; companyName: string; formLabel: string; link: string; hasAttachment: boolean; fromName: string }) {
  const title = `Please sign the ${input.formLabel} form for ${input.companyName}`;
  const lines = [
    `Dear ${input.signerName},`,
    `The ${input.formLabel} form for ${input.companyName} is ready for your digital signature. Please read it, sign it with your own DSC and send the signed PDF back to ${input.fromName}.`,
    input.hasAttachment ? 'The PDF is attached. The link below opens the same file for a limited time.' : 'The link below opens the PDF for a limited time.',
    'Nobody at the firm will ask for your DSC PIN or any one-time password. Please do not share them.',
  ];
  return {
    subject: title,
    html: renderEmailDocument({ eyebrow: 'MCA filing', title, bodyHtml: lines.map((l) => emailParagraph(escapeHtml(l))).join(''), cta: { label: 'Open the PDF', href: input.link } }),
    text: `${lines.join('\n\n')}\n\n${input.link}`,
  };
}

/**
 * Staff pressed the button: one separate email to each chosen signer with the latest portal PDF.
 * A signer list comes only from this engagement's own profile, the link opens one object, and
 * nobody is copied, so no message shows another client's data or another signer's address.
 */
export async function sendSignatureRequests(ctx: AuthContext, engagementParam: string, form: FilingForm, signerIds?: string[]) {
  const pdf = await portalPdfForSigners(ctx, engagementParam, form, SIGN_LINK_SECONDS);
  const profile = pdf ? await filingProfile(ctx, engagementParam) : null;
  if (!pdf || !profile) return null;
  const wanted: KnownSigner[] = signerIds?.length ? profile.signers.filter((s) => signerIds.includes(s.id)) : profile.signers;
  if (wanted.length === 0) throw new FilingRefusal('no_signers', 'Suite holds no signer for this filing yet.', 422);

  const entries: SignatureRequestEntry[] = [];
  for (const signer of wanted) {
    const base = { signerId: signer.id, name: signer.name, email: signer.email, at: new Date().toISOString(), byName: ctx.name, documentId: pdf.documentId };
    if (!signer.email) {
      entries.push({ ...base, outcome: 'no_email' });
      continue;
    }
    const mail = signatureEmail({ signerName: signer.name, companyName: pdf.companyName, formLabel: FILING_FORM_LABEL[form], link: pdf.url, hasAttachment: Boolean(pdf.bytes), fromName: ctx.name });
    const res = await sendEmail({
      to: signer.email,
      ...mail,
      replyTo: ctx.email || undefined,
      purpose: 'assist_filing.signature_request',
      ...(pdf.bytes ? { attachments: [{ filename: pdf.fileName, content: pdf.bytes, contentType: 'application/pdf' }] } : {}),
    });
    entries.push({ ...base, outcome: res.ok ? 'sent' : res.skipped ? 'not_configured' : 'failed' });
  }
  const saved = await recordSignatureRequests(ctx, engagementParam, form, entries);
  if (!saved) return null;
  await recordAuditEvent(ctx, {
    engagementId: saved.dbId,
    action: 'assist_filing.signature_requested',
    summary: `Asked ${entries.filter((e) => e.outcome === 'sent').length} of ${entries.length} signers to sign the ${FILING_FORM_LABEL[form]} PDF`,
    metadata: { form, documentId: pdf.documentId, outcomes: entries.map((e) => ({ signerId: e.signerId, outcome: e.outcome })) },
  });
  return { filing: saved.filing, requests: entries };
}
