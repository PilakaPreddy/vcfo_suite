'use client';

/**
 * BOARD RESOLUTION (NOC) — `/app/client/board-resolution` (rule R-52, prototype
 * docs/BOARD-RESOLUTION-NOC.md section 3). The NOC is the parent's Pre-2 board resolution, one
 * document in three variants. The page has the head ("Passed by: Board of {parent}", the variant
 * as subtitle, Previous and Next step), the ST5 track (Notarised and Apostilled for a foreign
 * parent only), Key facts, What you do with one main button, the preview with the Draft tab
 * (tinted filled values) and the Signed copy tab (the uploaded file only, never a drawn
 * signature), Files (no internal file name, P5) and the full decision tree.
 *
 * Real data: the board-resolution repository (`GET /api/engagements/:id/board-resolution`,
 * download / download-signed / upload-signed routes), the NOC state route
 * (`GET /api/engagements/:id/board-resolution/noc`, docs/ui-port/BR-NOC-API.md) and
 * `GET /api/client/incorporation` for names. The shared parts come from `@/components/board-doc`.
 */
import { CircleHelp, Download, Info, ListChecks, Maximize2, Minus, Plus, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp } from '@/context/AppContext';
import { checklist } from '@/data/checklist';
import { extractItemResponses } from '@/lib/checklist/checklist-responses';
import { buildBoardResolutionMergeFields, formatIndianFigures, type BoardResolutionDoc } from '@/lib/board-resolution/board-resolution';
import { uploadSignedBoardResolution, validateSignedBoardResolutionFile } from '@/lib/board-resolution/board-resolution-storage';
import { fetchBoardResolutionInDb } from '@/lib/projects/engagements-db';
import type { NocState } from '@/lib/noc/state';
import { useRealtimeBoardResolution } from '@/hooks/use-realtime-board-resolution';
import { BoardResolutionDocPreview } from '@/components/board-resolution/BoardResolutionDocPreview';
import { FitToWidth } from '@/components/board-resolution/FitToWidth';
import {
  DocFiles,
  DocPaper,
  DocTodo,
  DocTrack,
  EvidenceTable,
  SignedCopyView,
  VariantTree,
  docDay,
  nocDocModel,
  nocDocType,
  nocMergeValues,
  todoStates,
  treePath,
  NOC_STAGE_KEYS,
  type DocFile,
  type DocPreviewTab,
  type MergeValue,
} from '@/components/board-doc';
import { usePortal, usePortalCrumbs } from '../../PortalProvider';
import { useDocViewer, type ViewerDoc } from '../documents/DocViewer';
import { triggerDownload } from '../documents/file-types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { SkeletonRows } from '@/components/ui/empty-state';
import { toastSaved } from '@/components/ui/toast-saved';
import { IncFrame, istDay } from './ui';
import { INC_EXTRAS_KEY, firstName, signedUrlFor, stepHrefOf, useIncData } from './data';
import { Cols, Dot, DropZone, Empty, Island, PageHead, SCard, type PageHeadLink } from './spectrum';
import { NOC_CLIENT_FILENAME, known, nocMainAction, nocPhase, nocRecords, nocTrackVariant, nocVariantLabel } from './board/noc';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UPLOAD_ACCEPT = `.pdf,.docx,application/pdf,${DOCX_TYPE}`;

/** The NOC state for this engagement (BR-NOC-API.md). Null when the route has nothing. */
async function fetchNoc(engagementId: string): Promise<NocState | null> {
  const res = await fetch(`/api/engagements/${engagementId}/board-resolution/noc`, { credentials: 'include' });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { ok?: boolean; noc?: NocState } | null;
  return body?.noc ?? null;
}

/** "10,00,000" from the raw answer, or '' when it is not given. */
function inr(raw: unknown): string {
  const t = String(raw ?? '').trim();
  return t && /\d/.test(t) ? formatIndianFigures(t) : '';
}

/** C3: one row of the Key facts card. A missing value is "Not given yet" in faint ink. */
function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={cn('m-0 min-w-0 break-words font-medium', value ? 'text-ink' : 'font-normal text-ink-faint')}>{value || 'Not given yet'}</dd>
    </>
  );
}

export default function BoardPage() {
  const d = useIncData();
  const { go, toast, openChat } = usePortal();
  usePortalCrumbs(['Incorporation', 'Board resolution (NOC)']);
  const qc = useQueryClient();
  const viewer = useDocViewer();
  const { engagements, getStateForEngagement } = useApp();
  const engagement = useMemo(() => engagements.find((e) => e.id === d.engagementId), [engagements, d.engagementId]);
  const [doc, setDoc] = useState<BoardResolutionDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<DocPreviewTab | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);

  const nocKey = useMemo(() => ['board-resolution-noc', d.engagementId ?? ''] as const, [d.engagementId]);
  const nocQ = useQuery({
    queryKey: nocKey,
    queryFn: () => fetchNoc(d.engagementId!),
    enabled: Boolean(d.engagementId),
    staleTime: 30_000,
    retry: false,
  });
  const noc = nocQ.data ?? null;

  const load = useCallback(async () => {
    if (!d.engagementId) return;
    try {
      setDoc(await fetchBoardResolutionInDb(d.engagementId));
    } catch {
      /* shown as "not available yet" */
    } finally {
      setLoaded(true);
    }
  }, [d.engagementId]);
  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeBoardResolution({
    appEngagementId: d.engagementId,
    onRemoteChange: () => {
      void load();
      void qc.invalidateQueries({ queryKey: nocKey });
    },
  });

  const engState = engagement ? getStateForEngagement(engagement) : undefined;
  const pre1 = useMemo(() => {
    const item = checklist.find((c) => c.id === 'pre-1');
    return item ? extractItemResponses(item, engState?.['pre-1']) : {};
  }, [engState]);
  const nominee = useMemo(() => {
    const item = checklist.find((c) => c.id === 'pre-16');
    return item ? known(String(extractItemResponses(item, engState?.['pre-16']).shareholderNominee ?? '')) : '';
  }, [engState]);
  const mergeFields = useMemo(() => (engagement ? buildBoardResolutionMergeFields({ engagement, pre1 }) : undefined), [engagement, pre1]);
  const mergeValues = useMemo(() => nocMergeValues(mergeFields), [mergeFields]);

  const answers = useMemo(
    () =>
      noc?.answers ?? {
        ownershipType: engagement?.ownershipType ?? null,
        companyType: engagement?.companyType ?? null,
        parentIndianRelationship: engagement?.parentIndianRelationship ?? null,
      },
    [noc, engagement],
  );
  const variant = nocTrackVariant(noc, answers);
  const variantLabel = nocVariantLabel(noc, answers);
  const docType = nocDocType(variant, { notary: !noc?.notaryStepsOff });
  // Pre-1's answer wins over the project's, as in the draft; never the new company's own name.
  const parent = known(String(pre1.parentEntityName ?? '')) || known(noc?.parentName) || known(engagement?.parentEntityName);

  const s1 = d.model.byId['pre-1'];
  const s2 = d.model.byId['pre-2'];
  const s3 = d.model.byId['pre-3'];
  const ex = d.extras?.boardResolution ?? null;
  const visible = doc?.status === 'finalized' && Boolean(doc.storagePath?.trim());
  const downloadHref = d.engagementId
    ? `/api/engagements/${d.engagementId}/board-resolution/download${doc?.updatedAt ? `?v=${encodeURIComponent(doc.updatedAt)}` : ''}`
    : '';
  const signedHref =
    d.engagementId && doc?.signedStoragePath
      ? `/api/engagements/${d.engagementId}/board-resolution/download-signed?v=${encodeURIComponent(doc.signedUploadedAt ?? doc.signedStoragePath)}`
      : '';
  // Steps 2–3 done but no finalized board-resolution file on record (older
  // engagements): the page still shows the tracker and the signed copy from
  // step 3, never "not ready yet" (IN-03).
  const s3Path = useMemo(() => {
    if (!s3) return '';
    return String(extractItemResponses(s3.item, s3.slice).signedBoardResolutionUrl ?? '').trim();
  }, [s3]);
  const showBody = visible || s2?.kind === 'done';
  const drafted = istDay(doc?.draftedAt);
  const released = istDay(doc?.finalizedAt) ?? (s2?.kind === 'done' ? s2.doneOn : undefined);
  const signed = istDay(doc?.signedUploadedAt) ?? istDay(s3?.slice?.clientSubmittedAt) ?? (s3Path && s3?.kind === 'done' ? s3.doneOn : undefined);
  const received = istDay(ex?.receivedAt) ?? (s3?.kind === 'done' ? s3.doneOn : undefined);
  const signedName = (doc?.signedStoragePath || s3Path).split('/').pop()?.replace(/^\d+-/, '') || 'signed copy';
  const signedType = /\.docx?$/i.test(signedName) ? DOCX_TYPE : /\.pdf$/i.test(signedName) ? 'application/pdf' : '';
  const signedUrl = signedHref ? async () => signedHref : s3Path ? () => signedUrlFor(s3Path) : null;

  const records = nocRecords(noc, {
    drafted,
    released,
    releasedBy: ex?.finalizedByName ? firstName(ex.finalizedByName) : undefined,
    signed,
    signedBy: ex?.signedUploadedByName ? firstName(ex.signedUploadedByName) : d.short,
    accepted: received,
    acceptedBy: ex?.receivedByName ? firstName(ex.receivedByName) : undefined,
    onFile: visible,
  });
  const phase = nocPhase(records);
  const main = nocMainAction(phase);
  const accepted = phase === 'accepted';
  const todo = todoStates(docType, records);
  const openStage = docType.stages.find((s) => !records[s.key]?.at);
  const waitingOnClient = openStage?.key === NOC_STAGE_KEYS.signed;
  const sentBack = !accepted && noc?.sentBack ? noc.sentBack : null;

  // C8: the evidence rows, and the steps a foreign parent adds (D1) unless SBC turned them off.
  const whyPath = treePath(answers);
  const whyRows = whyPath.ev.rows;
  const addedSteps = whyPath.ev.outcome === 'foreign' && !noc?.notaryStepsOff ? ['Notarise', 'Apostille'] : [];

  const download = () => {
    if (!downloadHref) return;
    triggerDownload(downloadHref, NOC_CLIENT_FILENAME);
    toast('Download started · Board resolution (NOC)');
  };

  const replace = async (file: File) => {
    if (!d.engagementId) return;
    const bad = validateSignedBoardResolutionFile(file);
    if (bad) {
      toast(bad);
      return;
    }
    setBusy(true);
    try {
      const body = await uploadSignedBoardResolution(d.engagementId, file);
      setDoc((p) => (p ? { ...p, signedUploadedAt: body.signedUploadedAt ?? p.signedUploadedAt, signedStoragePath: body.signedStoragePath ?? p.signedStoragePath } : p));
      void qc.invalidateQueries({ queryKey: INC_EXTRAS_KEY });
      void qc.invalidateQueries({ queryKey: nocKey });
      // M-28 (A1): an upload with no Undo shows the white toast with the green tick.
      toastSaved('Signed copy uploaded', { kind: 'uploaded', sub: `${firstName(d.leadName) || 'Your team'} will check it.` });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const draftDoc: ViewerDoc | null = downloadHref
    ? { id: 'br-draft', name: NOC_CLIENT_FILENAME, url: async () => downloadHref, meta: 'Board resolution (NOC) · draft', contentType: DOCX_TYPE }
    : null;
  const signedDoc: ViewerDoc | null = signedUrl
    ? { id: 'br-signed', name: 'Signed copy', url: signedUrl, meta: 'Board resolution (NOC) · signed copy', contentType: signedType }
    : null;
  const openSigned = () => signedDoc && viewer.open([signedDoc], 0);
  const openFull = () => {
    if (!visible || !draftDoc) {
      openSigned();
      return;
    }
    viewer.open(signedDoc ? [draftDoc, signedDoc] : [draftDoc], 0);
  };

  /* C5: a click on a filled value opens step 1 while the client can still change it there. */
  const canEdit = (v: MergeValue) => v.source.startsWith('Pre-1') && s1?.kind === 'you' && s1.canOpen;
  const onField = (v: MergeValue) => {
    if (!s1) return;
    toast(`${v.source.replace(/^Pre-1 · /, '')} · step ${s1.n}`);
    go(stepHrefOf(s1));
  };

  const answer = {
    title: 'Board resolution (NOC)',
    text: `${parent || 'The parent company'}’s board authorises the India company. SBC drafts it, a director signs it, and ${d.short} uploads the signed copy.`,
    why: 'The name application in step 4 cannot be filed without it.',
    source: 'Companies Act 2013 · SPICe+ Part A',
    href: '/app/client/board-resolution',
  };

  // C1: "Previous step" and "Next step" only; the page itself covers steps 2 and 3 (P6).
  const steps = d.model.steps;
  const at2 = s2 ? steps.indexOf(s2) : -1;
  const at3 = s3 ? steps.indexOf(s3) : -1;
  const prevStep = at2 > 0 ? steps[at2 - 1] : undefined;
  const nextStep = at3 >= 0 ? steps[at3 + 1] : undefined;
  const stepLinks: PageHeadLink[] = [
    ...(prevStep ? [{ href: stepHrefOf(prevStep), label: 'Previous step', dir: 'prev' as const }] : []),
    ...(nextStep ? [{ href: stepHrefOf(nextStep), label: 'Next step', dir: 'next' as const }] : []),
  ];
  const headChip = accepted ? (
    <Chip tone="ok" fixed>
      Done
    </Chip>
  ) : phase === 'sent' || !visible ? (
    <Chip tone="prog" fixed>
      In progress
    </Chip>
  ) : (
    <Chip tone="teal" fixed>
      Waiting
    </Chip>
  );
  const zoomBtn = 'h-[30px] w-[30px] min-w-0';
  const shownTab: DocPreviewTab = tab ?? (visible ? 'draft' : 'signed');

  const capital = (() => {
    const auth = inr(pre1.authorisedShareCapital);
    const paid = inr(pre1.paidUpShareCapital);
    const nominal = inr(pre1.nominalValuePerEquityShare);
    const parts = [auth && `₹${auth} authorised`, paid && `₹${paid} paid up`, nominal && `₹${nominal} a share`].filter(Boolean);
    return parts.join(' · ');
  })();
  const shares =
    variant === 'indian-name-only'
      ? parent
        ? `${parent} lends its name only`
        : ''
      : parent
        ? [`${parent} (parent)`, nominee ? `${nominee}, 1 share (nominee)` : ''].filter(Boolean).join(' · ')
        : '';
  const signer = [known(mergeFields?.SIGNATORY_NAME), known(mergeFields?.SIGNATORY_DESIGNATION)].filter(Boolean).join(', ');

  const files: DocFile[] = [
    ...(visible ? [{ id: 'br-draft', title: 'Draft · Word', type: 'DOCX' as const, status: 'Released', by: records.released?.by ?? 'SBC', at: records.released?.at }] : []),
    ...(signedUrl
      ? [
          {
            id: 'br-signed',
            title: 'Signed copy',
            type: signedType === DOCX_TYPE ? ('DOCX' as const) : ('PDF' as const),
            status: accepted ? 'Accepted' : 'Sent',
            by: records.signed?.by ?? d.short,
            at: records.signed?.at,
          },
        ]
      : []),
  ];

  const draftBody = !visible ? (
    <Empty
      action={
        signedUrl ? (
          <Button variant="secondary" onClick={openSigned}>
            Open the signed copy
          </Button>
        ) : undefined
      }
    >
      {signedUrl ? 'The Word draft is not on file. The signed copy from step 3 is.' : 'The board resolution file is not on file yet'}
    </Empty>
  ) : doc?.content?.trim() && mergeFields ? (
    <div className="pvw">
      <div className="origin-top" style={{ transform: `scale(${zoom})` }}>
        <DocPaper model={nocDocModel({ content: doc.content, fields: mergeFields })} values={mergeValues} onField={onField} canEdit={canEdit} />
      </div>
    </div>
  ) : (
    <div className="pvw">
      <div className="paper live" data-paper="" style={{ transform: `scale(${zoom})` }}>
        <div className="cp-tw">
          {d.engagementId ? (
            <FitToWidth>
              <BoardResolutionDocPreview engagementId={d.engagementId} downloadUrl={downloadHref} refreshKey={`${doc?.storagePath ?? ''}:${doc?.updatedAt ?? ''}`} mergeFields={mergeFields} />
            </FitToWidth>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <IncFrame pending={d.pending || !loaded} title="Board resolution (NOC) · Incorporation · VCFO Suite">
      <div className="wrap">
        <Island className="grid grid-cols-1 gap-5">
          <PageHead
            label="Board resolution (NOC)"
            title="Board resolution (NOC)"
            chips={headChip}
            meta={
              <>
                <span className="basis-full font-medium text-ink-2" data-testid="noc-variant">
                  {variantLabel}
                </span>
                <span data-testid="noc-passed-by">Passed by: Board of {parent || 'the parent company'} (the parent)</span>
                {/* The dot travels with "Phase 1", so a wrapped line never starts with a stray separator. */}
                <span className="whitespace-nowrap max-sm:basis-full">
                  <Dot className="mr-2 max-sm:hidden" />
                  Phase 1 · Steps 2–3
                </span>
              </>
            }
            links={stepLinks}
            actions={
              <Button variant="quiet" size="sm" aria-label="What’s this? Board resolution (NOC)" onClick={() => openChat('What’s this: Board resolution (NOC)?', answer)}>
                <CircleHelp size={15} strokeWidth={1.6} aria-hidden />
                What’s this?
              </Button>
            }
          />

          {!loaded || d.pending ? (
            <>
              <SkeletonRows rows={1} />
              <Cols>
                <SkeletonRows rows={8} />
                <SkeletonRows rows={3} />
              </Cols>
            </>
          ) : !showBody ? (
            <Empty
              action={
                s2 ? (
                  <Button variant="secondary" onClick={() => go(stepHrefOf(s2))}>
                    Open step {s2.n}
                  </Button>
                ) : undefined
              }
            >
              The board resolution is not ready yet
            </Empty>
          ) : (
            <>
              {/* C2: ST5 track. Notarised and Apostilled only for a foreign parent (D1, D4). */}
              <DocTrack
                stages={docType.stages}
                records={records}
                nowLabel={waitingOnClient ? `Waiting on ${d.short}` : 'With SBC'}
                nowTone={waitingOnClient ? 'teal' : 'prog'}
                label="Progress of the board resolution"
              />

              {/* The facts on the left and the document on the right, as in the prototype. */}
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
                <div className="grid min-w-0 gap-5">
                  {/* C3: values only, from the project and the Pre-1 answers. */}
                  <SCard title="Key facts" meta="From the engagement" headIcon={{ icon: Info, tone: 'blue' }} flush>
                    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-[14px] md:px-5">
                      <Fact label="New company" value={known(mergeFields?.PROPOSED_NAME_1) || d.companyName} />
                      <Fact label="Capital" value={capital} />
                      <Fact label="Shares" value={shares} />
                      <Fact label="Signs the forms" value={signer} />
                      <Fact label="Files the forms" value="SBC" />
                      <Fact label="Template" value={variant ? variantLabel : ''} />
                    </dl>
                  </SCard>

                  {/* C4: the numbered list with one main button. */}
                  <SCard title="What you do" right={headChip} headIcon={{ icon: ListChecks, tone: 'teal' }} flush>
                    <DocTodo
                      items={todo}
                      action={
                        main?.kind === 'download' ? (
                          <Button onClick={download}>
                            <Download size={16} strokeWidth={1.6} aria-hidden />
                            {main.label}
                          </Button>
                        ) : main?.kind === 'upload' ? (
                          <Button onClick={() => uploadRef.current?.click()} disabled={busy}>
                            <Upload size={16} strokeWidth={1.6} aria-hidden />
                            {main.label}
                          </Button>
                        ) : undefined
                      }
                    />
                    {sentBack ? (
                      <div className="border-t border-line-soft px-4 py-3 text-[13px] text-ink-2 md:px-5" data-testid="noc-sent-back">
                        <b className="font-medium text-ink">Sent back{docDay(sentBack.at) ? ` · ${docDay(sentBack.at)}` : ''}</b>
                        <span className="mt-0.5 block text-ink-muted">{sentBack.reason}</span>
                      </div>
                    ) : null}
                    <input
                      ref={uploadRef}
                      type="file"
                      accept={UPLOAD_ACCEPT}
                      className="hidden"
                      tabIndex={-1}
                      aria-label="Choose the signed copy"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) void replace(f);
                      }}
                    />
                  </SCard>

                  {/* C7: the client never sees the internal file name (P5). */}
                  <SCard title="Files" meta={`${files.length} file${files.length === 1 ? '' : 's'}`} flush>
                    <DocFiles
                      files={files}
                      onOpen={(f) => (f.id === 'br-draft' ? openFull() : openSigned())}
                      onDownload={async (f) => {
                        if (f.id === 'br-draft') {
                          download();
                          return;
                        }
                        if (!signedUrl) return;
                        try {
                          triggerDownload(await signedUrl(), signedName);
                          toast('Download started · Signed copy');
                        } catch (e) {
                          toast(e instanceof Error ? e.message : 'Could not download the file');
                        }
                      }}
                      footer={
                        accepted ? undefined : (
                          <DropZone
                            label={signedUrl ? 'Replace signed copy' : 'Upload signed copy'}
                            hint="PDF · DOCX"
                            tone="accent"
                            busy={busy}
                            browseText="Drop a PDF or"
                            accept={UPLOAD_ACCEPT}
                            onFile={(f) => void replace(f)}
                          />
                        )
                      }
                    />
                  </SCard>
                </div>
                <div className="grid min-w-0 gap-5">
                  {/* Underline tabs, as in the prototype's DocPreview: views of one record (R-11). */}
                  <section aria-label="Preview" className="min-w-0 overflow-hidden rounded-md border-1.5 border-line bg-surface-raised">
                    <div className="flex items-end justify-between gap-3 px-4 md:px-5">
                      <SpectrumTabs
                        variant="underline"
                        items={[
                          { key: 'draft', label: 'Draft' },
                          { key: 'signed', label: 'Signed copy' },
                        ]}
                        value={shownTab}
                        onChange={(k) => setTab(k as DocPreviewTab)}
                        label="Preview"
                        className="border-b-0"
                      />
                      <div className="flex items-center gap-1.5 pb-1.5 text-[12.5px] text-ink-muted">
                        {noc?.version ? <span>Version {noc.version}</span> : null}
                        {shownTab === 'draft' && visible ? (
                          <>
                            <Button size="icon" variant="quiet" className={zoomBtn} aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}>
                              <Minus size={16} strokeWidth={1.6} aria-hidden />
                            </Button>
                            <Button size="icon" variant="quiet" className={zoomBtn} aria-label="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}>
                              <Plus size={16} strokeWidth={1.6} aria-hidden />
                            </Button>
                          </>
                        ) : null}
                        <Button size="icon" variant="quiet" className={zoomBtn} aria-label="Open full screen" onClick={shownTab === 'signed' ? openSigned : openFull}>
                          <Maximize2 size={16} strokeWidth={1.6} aria-hidden />
                        </Button>
                      </div>
                    </div>
                    <div role="tabpanel" aria-label="Draft" hidden={shownTab !== 'draft'} className="min-w-0 border-t-1.5 border-line bg-surface-sunken p-3 md:p-5">
                      {draftBody}
                    </div>
                    <div role="tabpanel" aria-label="Signed copy" hidden={shownTab !== 'signed'} className="min-w-0 border-t-1.5 border-line bg-surface-sunken p-3 md:p-5">
                      <SignedCopyView
                        file={signedUrl ? { name: signedName, url: signedUrl, contentType: signedType, uploadedAt: records.signed?.at, uploadedBy: records.signed?.by } : null}
                        onOpenFull={signedUrl ? openSigned : undefined}
                      />
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}

          {/* C8: the full tree for everyone (D5), under the two columns. */}
          {!d.pending && loaded ? (
            <SCard
              title="Why VCFO chose this template"
              meta={<span className="text-[13px] text-ink-muted">{whyRows.length === 1 ? '1 project answer' : `${whyRows.length} project answers`}</span>}
              flush
              right={
                <Button variant="secondary" size="sm" onClick={() => setReplayKey((k) => k + 1)} aria-label="Replay the chosen path">
                  Replay
                </Button>
              }
            >
              <VariantTree answers={answers} replayKey={replayKey} />
              <div className="px-4 pb-4 pt-2 md:px-5">
                <EvidenceTable
                  rows={whyRows}
                  result={
                    <span data-testid="noc-adds">
                      {addedSteps.length ? (
                        <>
                          This choice adds {addedSteps.length} steps: <b className="font-medium">{addedSteps.join(' · ')}</b>
                        </>
                      ) : (
                        'This choice adds no steps'
                      )}
                    </span>
                  }
                />
              </div>
            </SCard>
          ) : null}
        </Island>
      </div>
      {viewer.node}
    </IncFrame>
  );
}
