'use client';

'use client';


import { useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { errorMessage, toastError, toastSuccess } from '@/lib/toast-errors';

import {

  AlertTriangle,

  Download,

} from 'lucide-react';


import { PageTransition } from '@/components/shell/PageTransition';

import { SEO } from '@/components/SEO';



import { Chip } from '@/components/ui/spectrum-chip';
import { DashSection } from '@/components/dash/DashSection';
import { AuditLines, DocFiles, DocTodo, nocDocType, todoStates, type AuditLine, type DocFile } from '@/components/board-doc';
import { internOverviewPhases } from '@/lib/intern/intern-overview-progress';
import { cn } from '@/lib/utils';


import {

  AlertDialog,

  AlertDialogAction,

  AlertDialogCancel,

  AlertDialogContent,

  AlertDialogDescription,

  AlertDialogFooter,

  AlertDialogHeader,

  AlertDialogTitle,

} from '@/components/ui/alert-dialog';















import { getItem } from '@/data/checklist';
import type { BoardResolutionMissingFieldRef } from '@/lib/api/board-resolution-errors';
import { docPackStepPath } from '@/lib/doc-pack/paths';
import { sectionSlug } from '@/lib/doc-pack/section-slug';
import {
  BoardResolutionEditorDocPanel,
  type BoardResolutionEditorProps,
} from '@/views/intern/BoardResolutionEditorDocPanel';
import { useNocState } from '@/views/intern/board-resolution-noc/useNocState';
import { nocRecords } from '@/views/intern/board-resolution-noc/useNocState';
import {
  NocReceiveCard,
  NocTemplateCard,
  NocTrackStrip,
  NocWhyCard,
} from '@/views/intern/board-resolution-noc/NocStaffCards';

/** "NIC code — Client Details, Business Description" */
function missingFieldRefText(ref: BoardResolutionMissingFieldRef): string {
  const where = [getItem(ref.stepId)?.title, ref.section].filter(Boolean).join(', ');
  return where ? `${ref.label} — ${where}` : ref.label;
}

/** "29 Oct" (R-29). */
function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(/\bSept\b/, 'Sep');
}

/** One row of the Key facts card (prototype `BoardResolutionPage` C3); a missing value is "Not given yet". */
function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={cn('min-w-0 break-words', value ? 'font-medium text-ink' : 'text-ink-faint')}>{value || 'Not given yet'}</dd>
    </>
  );
}

/** A merge field that still holds its template placeholder counts as not given. */
function given(raw: string | undefined): string {
  const v = raw?.trim() ?? '';
  return v && !/^\[.*\]$/.test(v) ? v : '';
}

export function BoardResolutionEditorView(p: BoardResolutionEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    eng,
    isLead,
    staffShell,
    handleApprove,
    handleSendBack,
    handleUploadSigned,
    finalizeOpen,
    setFinalizeOpen,
    busy,
    internBoardResolutionPath,
    isFinalized,
    loading,
    hasPre1Data,
    pre1StepHref,
    generateErrorDisplay,
    generateError,
    doc,
    signedDownloadHref,
    previewStorageCorrupt,
    handleFinalize,
    withManager,
    sentBackNote,
    handleGenerate,
    mergeFields,
    downloadHref,
  } = p;
  const signed = Boolean(doc?.signedStoragePath?.trim());
  // R-52 (T1 to T6): the board resolution (NOC) state, reloaded when the document changes.
  const nocState = useNocState(eng.id, `${doc?.status ?? ''}:${doc?.updatedAt ?? ''}:${doc?.signedUploadedAt ?? ''}`);
  const noc = nocState.noc;
  const parentName = noc?.parentName || eng.parentEntityName?.trim() || '';
  const nocError = (message: string) => toastError('Could not save', message);
  const [makingAgain, setMakingAgain] = useState(false);
  const makeAgain = async () => {
    setMakingAgain(true);
    try {
      await handleGenerate();
      await nocState.reload();
    } finally {
      setMakingAgain(false);
    }
  };
  const signedInputRef = useRef<HTMLInputElement>(null);
  const [backOpen, setBackOpen] = useState(false);
  const [backNote, setBackNote] = useState('');
  const [sentOverride, setSentOverride] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sentToClientAt = sentOverride ?? doc?.sentToClientAt ?? null;

  /** "Send to client" (S-573): opens a mail to the client and records the send. */
  const sendToClient = async () => {
    const to = eng.clientEmail?.trim();
    if (to) {
      const subject = encodeURIComponent(`Board resolution for signing · ${eng.companyName}`);
      window.location.href = `mailto:${to}?subject=${subject}`;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/engagements/${encodeURIComponent(eng.id)}/board-resolution/sent`, { method: 'POST' });
      const out = (await res.json().catch(() => ({}))) as { boardResolution?: { sentToClientAt?: string | null }; error?: string };
      if (!res.ok) throw new Error(out.error || 'Could not record the send');
      setSentOverride(out.boardResolution?.sentToClientAt ?? new Date().toISOString());
      toastSuccess('Sent to client', eng.companyName);
    } catch (err) {
      toastError('Could not send', errorMessage(err));
    } finally {
      setSending(false);
    }
  };
  const stageWord = signed ? 'Signed' : isFinalized && sentToClientAt ? 'Sent' : isFinalized ? 'Finalized' : withManager ? 'With manager' : 'Draft';
  const stageTone = signed || isFinalized ? 'ok' : withManager ? 'teal' : 'warn';
  const records = noc ? nocRecords(noc) : {};
  const docType = noc ? nocDocType(noc.variant, { notary: noc.foreignParent && !noc.notaryStepsOff }) : null;
  const phaseOne = internOverviewPhases()[0]?.items ?? [];
  const prevStep = phaseOne[0];
  const nextStep = phaseOne[3];
  const signer = [given(mergeFields?.SIGNATORY_NAME), given(mergeFields?.SIGNATORY_DESIGNATION)].filter(Boolean).join(', ');
  const files: DocFile[] = [
    ...(isFinalized
      ? [
          {
            id: 'br-draft',
            title: 'Board resolution (NOC) · Word',
            type: 'DOCX' as const,
            name: noc?.staff?.templateFileName,
            status: 'Released',
            by: records.released?.by,
            at: records.released?.at,
          },
        ]
      : []),
    ...(signed
      ? [
          {
            id: 'br-signed',
            title: 'Signed copy',
            type: 'PDF' as const,
            status: noc?.accepted ? 'Accepted' : 'Uploaded',
            by: records.signed?.by,
            at: doc?.signedUploadedAt ?? records.signed?.at,
          },
        ]
      : []),
  ];
  // The audit lines come from the one record: each finished track step, the override and a send back.
  const audit: AuditLine[] = [
    ...(noc?.track ?? [])
      .filter((t) => t.done && t.at)
      .map((t) => ({ id: t.key, at: t.at!, who: t.byName ?? 'SBC', text: t.label })),
    ...(noc?.staff?.override
      ? [{ id: 'override', at: noc.staff.override.at, who: noc.staff.override.byName ?? 'SBC', text: `Changed the template. Reason: ${noc.staff.override.reason}` }]
      : []),
    ...(noc?.sentBack ? [{ id: 'sent-back', at: noc.sentBack.at, who: noc.sentBack.byName ?? 'SBC', text: `Sent the signed copy back. Reason: ${noc.sentBack.reason}` }] : []),
  ];
  return (

    <PageTransition>

      <SEO

        title={`Board Resolution — ${eng.companyName}`}

        description="Draft and finalize the certified board resolution for the India subsidiary."

        path={pathname || internBoardResolutionPath(eng)}

      />

      {/* Plain head (prototype `BoardResolutionPage` C1): the 28px title and the stage chip, the
          template, the client and the parent, then Previous and Next step. No back link (R-09). */}
      <header className="mb-5 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Board resolution (NOC)</h1>
            <Chip tone={stageTone} fixed>
              {stageWord}
            </Chip>
          </div>
          {noc ? <p className="text-[13.5px] font-medium text-ink-2">{noc.variantLabel}</p> : null}
          <p className="text-[13.5px] text-ink-muted">
            {eng.companyName}
            {parentName ? (
              <>
                {' · Passed by: '}
                <b className="font-medium text-ink">Board of {parentName} (the parent)</b>
              </>
            ) : null}
            {' · Phase 1 · Steps 2–3'}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {prevStep ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={docPackStepPath(eng, staffShell, prevStep.id)}>
                <ChevronLeft size={14} strokeWidth={1.6} aria-hidden />
                Previous step
              </Link>
            </Button>
          ) : null}
          {nextStep ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={docPackStepPath(eng, staffShell, nextStep.id)}>
                Next step
                <ChevronRight size={14} strokeWidth={1.6} aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {noc ? <NocTrackStrip noc={noc} nowLabel={signed && !noc.accepted ? 'With SBC' : undefined} /> : null}

      <div className={cn('grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]', noc && 'mt-5')}>
      <div className="grid min-w-0 gap-5">
        <DashSection title="Key facts" meta="From the engagement" flush>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-[14px] md:px-5">
            <Fact label="New company" value={given(mergeFields?.PROPOSED_NAME_1) || eng.companyName} />
            <Fact label="Capital" value={given(mergeFields?.AUTHORISED_CAPITAL)} />
            <Fact label="Shares" value={parentName ? `${parentName} (parent)` : null} />
            <Fact label="Signs the forms" value={signer} />
            <Fact label="Files the forms" value="SBC" />
            <Fact label="Template" value={noc?.variantLabel} />
          </dl>
        </DashSection>

        {docType ? (
          <DashSection
            title="What the client does"
            right={
              <Chip tone={stageTone} fixed>
                {stageWord}
              </Chip>
            }
            flush
          >
            <DocTodo
              items={todoStates(docType, records)}
              action={
                isFinalized && !signed ? (
                  <>
                    <span className="mr-auto self-center text-[13px] text-ink-muted">
                      {sentToClientAt ? `Sent to client ${dayMonth(sentToClientAt)}` : 'Next: send to client'}
                    </span>
                    <Button size="sm" variant={sentToClientAt ? 'outline' : 'default'} disabled={sending} onClick={() => void sendToClient()}>
                      {sentToClientAt ? 'Send again' : 'Send to client'}
                    </Button>
                  </>
                ) : undefined
              }
            />
          </DashSection>
        ) : null}

        <DashSection title="Files" meta={`${files.length} ${files.length === 1 ? 'file' : 'files'}`} flush>
          <DocFiles
            files={files}
            showInternalName
            onDownload={(f) => {
              const href = f.id === 'br-signed' ? signedDownloadHref : downloadHref;
              if (href) window.open(href, '_blank', 'noopener');
            }}
            footer={
              isFinalized && !noc?.accepted ? (
                <div className="px-4 py-3 md:px-5">
                  {/* S-574: staff upload the signed copy the client returned by mail or by hand. */}
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => signedInputRef.current?.click()}>
                    {busy === 'upload-signed' ? 'Uploading…' : signed ? 'Replace signed copy' : 'Upload signed copy'}
                  </Button>
                  <input
                    ref={signedInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    aria-label="Signed board resolution file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void handleUploadSigned(file);
                    }}
                  />
                </div>
              ) : undefined
            }
          />
        </DashSection>
      </div>
      <div className="grid min-w-0 gap-5">
      <div className="min-w-0">

        {withManager && !isFinalized ? (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border-1.5 border-brand-line bg-brand-soft px-3 py-2 text-[13.5px] text-ink">
            <span className="min-w-0 flex-1">
              {isLead
                ? 'The board resolution is with your manager. You can edit it again if they send it back.'
                : 'The project lead sent this for approval.'}
            </span>
            {!isLead ? (
              <>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setBackOpen(true)}>
                  Send back
                </Button>
                <Button size="sm" disabled={busy !== null} onClick={() => void handleApprove()}>
                  {busy === 'finalize' ? 'Approving…' : 'Approve and send to client'}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {sentBackNote && !withManager && !isFinalized ? (
          <p role="status" className="mb-4 rounded-md border-1.5 border-warning-mid bg-warning-soft px-3 py-2 text-[13.5px] text-ink">
            <span className="font-medium">{isLead ? 'Your manager sent this back:' : 'Sent back to the lead:'}</span> {sentBackNote}
          </p>
        ) : null}

        {!hasPre1Data && !loading && (

          <p className="mb-4 rounded-md border-1.5 border-warning-mid bg-warning-soft px-3 py-2 text-[13.5px] text-warning">

            Submit Client Details first. The board resolution uses this data.{' '}

            <button

              type="button"

              onClick={() => router.push(pre1StepHref)}

              className="font-medium text-ink underline underline-offset-2 hover:text-brand-text"

            >

              Open Client Details

            </button>

          </p>

        )}

        {generateErrorDisplay && !loading && (

          <div

            className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger"

            role="alert"

          >

            <p className="flex items-start gap-2 font-medium text-ink">

              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />

              {generateErrorDisplay.title}

            </p>

            <p className="mt-1 pl-6 text-ink-muted">{generateErrorDisplay.description}</p>

            {generateErrorDisplay.missingFieldRefs?.length && generateError?.code === 'missing_fields' ? (
              <ul className="mt-2 space-y-1 pl-6" aria-label="Missing information">
                {generateErrorDisplay.missingFieldRefs.map((ref) => (
                  <li key={`${ref.stepId}:${ref.fieldId}:${ref.label}`}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          docPackStepPath(eng, staffShell, ref.stepId, ref.section ? sectionSlug(ref.section) : undefined),
                        )
                      }
                      className="text-left text-[12.5px] font-medium text-brand hover:underline"
                    >
                      {missingFieldRefText(ref)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {generateError?.code === 'step1_incomplete' && (

              <button

                type="button"

                onClick={() => router.push(pre1StepHref)}

                className="mt-2 pl-6 text-[12px] font-medium text-brand hover:underline"

              >

                Open Client Details

              </button>

            )}

          </div>

        )}

        {isFinalized && doc?.signedStoragePath?.trim() && signedDownloadHref && (

          <div className="mb-4 rounded-md border border-positive/25 bg-positive/10 px-4 py-3">

            <p className="text-[13px] font-medium text-ink mb-1">

              Signed copy uploaded

            </p>

            <p className="text-[12px] text-ink-muted mb-3">

              {doc.signedUploadedAt

                ? `Received ${new Date(doc.signedUploadedAt).toLocaleString('en-IN', {

                    dateStyle: 'medium',

                    timeStyle: 'short',

                  })}`

                : 'A signed board resolution is on file.'}

            </p>

            <a

              href={signedDownloadHref}

              className="inline-flex items-center gap-2 text-[13px] font-medium text-brand hover:underline"

            >

              <Download className="w-3.5 h-3.5" />

              Download signed copy

            </a>

          </div>

        )}

        {isFinalized && previewStorageCorrupt && !loading && (

          <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">

            <p className="flex items-start gap-2 font-medium text-ink">

              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />

              Finalized, but the stored Word file needs repair

            </p>

            <p className="mt-1 pl-6 text-ink-muted">

              Inline editing stays locked after finalization. You can still use Apply latest template

              or Re-generate from Pre-1 below to fix the file in storage for the client download.

            </p>

          </div>

        )}

        <BoardResolutionEditorDocPanel {...p} />
      </div>
      {noc ? (
        <NocTemplateCard
          noc={noc}
          busy={nocState.busy}
          act={nocState.act}
          onMakeAgain={makeAgain}
          makingAgain={makingAgain}
          loadVersions={nocState.loadVersions}
          onError={nocError}
        />
      ) : null}
      {noc && signed ? (
        <NocReceiveCard
          noc={noc}
          busy={nocState.busy}
          act={nocState.act}
          hasSignedCopy={signed}
          onAccepted={() => toastSuccess('Signed copy accepted', 'Filed in Documents › Vault')}
          onError={nocError}
        />
      ) : null}
      {noc?.staff ? (
        <DashSection title="Audit" meta={String(audit.length)} flush>
          <AuditLines lines={audit} />
        </DashSection>
      ) : null}
      </div>
      </div>
      {noc ? <NocWhyCard noc={noc} className="mt-5" /> : null}
      <Dialog open={backOpen} onOpenChange={setBackOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send the board resolution back</DialogTitle>
          </DialogHeader>
          <Textarea
            value={backNote}
            onChange={(event) => setBackNote(event.target.value)}
            rows={4}
            maxLength={2000}
            aria-label="What should the project lead change"
            placeholder="Tell the project lead what to change."
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBackOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!backNote.trim() || busy !== null}
              onClick={async () => {
                if (await handleSendBack(backNote)) {
                  setBackOpen(false);
                  setBackNote('');
                }
              }}
            >
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>

        <AlertDialogContent>

          <AlertDialogHeader>

            <AlertDialogTitle>Send for manager approval?</AlertDialogTitle>

            <AlertDialogDescription>
              The document locks until your manager approves it or sends it back.
            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>

            <AlertDialogCancel disabled={busy === 'finalize'}>Cancel</AlertDialogCancel>

            <AlertDialogAction
              disabled={busy === 'finalize'}
              onClick={(e) => {
                e.preventDefault();
                void handleFinalize();
              }}
            >

              {busy === 'finalize' ? 'Sending…' : 'Send for manager approval'}

            </AlertDialogAction>

          </AlertDialogFooter>

        </AlertDialogContent>

      </AlertDialog>

    </PageTransition>


  );
}
