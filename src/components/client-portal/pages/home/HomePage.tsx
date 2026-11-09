'use client';

/**
 * Client portal Home (`/app/client/overview`), VCFO Spectrum (prototype
 * src/screens/client/HomeScreen.tsx). The journey map (`journey/JourneyMap`) comes first, then
 * the shared compact home card (`DashHero`, R-17), then
 * two columns: the wide one with the ST5 steps card and the Gantt timeline, the 360px one with
 * what the client owes and who holds the work. After the COI the compliance cards join and
 * Registrations runs full width. Below 1024px the columns dissolve and `order` sets the phone
 * card order, so phones show the same cards at 390px; the home card's tiles wrap there.
 *
 * "Message <lead>" (MessagesCard, G-09) sits under What SBC is doing.
 *
 * A step row opens the step page (prototype). The compliance buttons open the shared Spectrum
 * drill (`complianceDrill`). Pop-ups: the upload dialog, the timeline editor, the PAN/TAN reveal
 * (credentials' IdsRevealDialog) and the document viewer (documents' DocViewer). The old v7
 * StepPopup and CompliancePopup stay in Popups.tsx but Home no longer opens them.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { DocViewer, type ViewerDoc } from '@/components/client-portal/pages/documents/DocViewer';
import { IdsRevealDialog } from '@/components/client-portal/pages/credentials/IdsRevealDialog';
import { phaseHref, stepHref } from '@/components/client-portal/routes';
import type { PortalStep } from '@/lib/client-portal/step-model';
import '../../css/home-base.css';
import '../../css/home-tle.css';
import '../../css/home-m.css';
import { Island, St5Card } from '../incorporation/spectrum';
import { useHome } from './useHome';
import { useDownload, useNeedUpload } from './ui';
import { ActivityCard, AlertsCard, DocsCard, HoldsCard, HomeCard, NeedsCard, SbcCard } from './CardsA';
import { AreaCard, CompCard, IdsCard, NextCard, PostIncCard, RegCard, TimelineCard } from './CardsB';
import { TimelineEditor } from './TimelineEditor';
import { MeetingsCard } from './MeetingsCard';
import { MessagesCard } from './MessagesCard';
import { JourneyMap } from './journey/JourneyMap';
import { UploadDialog } from './UploadDialog';
import { complianceDrill, dLong, docUrl, type DocItem, type NeedRow } from './derive';

/** L1 skeleton: shown after 150 ms, held at least 300 ms. */
function useSkeleton(loading: boolean): boolean {
  const [show, setShow] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        setShow(true);
        setSince(Date.now());
      }, 150);
      return () => clearTimeout(t);
    }
    if (show && since) {
      const left = Math.max(0, 300 - (Date.now() - since));
      const t = setTimeout(() => setShow(false), left);
      return () => clearTimeout(t);
    }
  }, [loading, show, since]);
  return show;
}

function toViewer(d: DocItem, company: string): ViewerDoc {
  return {
    id: d.id,
    name: d.name,
    url: () => docUrl(d),
    contentType: d.contentType ?? null,
    sizeBytes: d.sizeBytes ?? null,
    uploadedAt: d.date,
    uploadedBy: d.from === 'client' ? company : 'SBC',
    meta: `From ${d.from === 'client' ? company : 'SBC'}${d.date ? ` · ${dLong(d.date)}` : ''}`,
  };
}

// C-002: the prototype shell's main (max 1440px; 16px sides, 32px from 768px; room for the phone tab bar).
const FRAME = 'mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-5 px-4 pb-28 pt-5 md:px-8 md:pb-20 md:pt-7';
const COLS = 'grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] max-lg:contents';
const COL = 'grid min-w-0 grid-cols-1 gap-5 max-lg:contents';

/** R-48: loading shows grey shapes. */
function Skeleton() {
  return (
    <div className="cp-home" aria-busy="true">
      <Island className={FRAME}>
        <span className="block h-[84px] animate-pulse rounded-md bg-surface-sunken" aria-hidden />
        <div className={COLS.replace(' max-lg:contents', '')}>
          <SkeletonRows rows={6} />
          <SkeletonRows rows={5} />
        </div>
      </Island>
    </div>
  );
}

export function HomePage() {
  const h = useHome();
  const skeleton = useSkeleton(h.loading);
  const download = useDownload();
  // B-20: the upload's per-file rows show in Recent documents, so the floating tray is off here.
  const { sendTo, field, rows: uploadRows, busy: uploading, cancel: cancelUpload } = useNeedUpload({ tray: false });
  // C-059: the upload dialog, open on one request (a Needs row) or on the first (the home card).
  const [uploadFor, setUploadFor] = useState<{ id?: string } | null>(null);
  const [editor, setEditor] = useState(false);
  const [reveal, setReveal] = useState<'pan' | 'tan' | null>(null);
  const [viewer, setViewer] = useState<{ docs: ViewerDoc[]; i: number } | null>(null);

  // route `home-chat` (#chat): open the Ask VCFO chat 500 ms after load
  const { openChat } = h.portal;
  useEffect(() => {
    if (!/chat/.test(window.location.hash)) return;
    const t = setTimeout(() => openChat(), 500);
    return () => clearTimeout(t);
  }, [openChat]);

  const openDocs = useCallback((docs: DocItem[], i: number) => setViewer({ docs: docs.map((d) => toViewer(d, h.company)), i }), [h.company]);
  const upload = useCallback(
    (n?: NeedRow) => {
      if (!n) setUploadFor({});
      else if (n.requestId) setUploadFor({ id: n.requestId });
      else if (n.href) h.portal.go(n.href);
    },
    [h.portal],
  );
  const uploadRequests = h.needs.filter((n) => (n.kind === 'upload' || n.kind === 'correct') && n.requestId);

  if (h.loading && !skeleton && !h.overview) return <div className="cp-home" style={{ minHeight: '60vh' }} />;
  if (h.loading || skeleton) return <Skeleton />;
  if (h.error || h.missing) {
    return (
      <div className="cp-home">
        <Island className={FRAME}>
          {h.error ? (
            <EmptyState
              title="Your dashboard did not load"
              action={
                <Button size="sm" variant="secondary" onClick={h.refetch}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState title="No active engagement yet" />
          )}
        </Island>
      </div>
    );
  }

  const phases = h.timeline;
  const coiDoc = h.overview?.documents.deliverables.find((d) => d.id === 'pre-12:certificateOfIncorporationFinalUrl');
  const coiOpen = coiDoc
    ? () => openDocs([{ id: coiDoc.id, name: coiDoc.name, type: 'PDF', date: coiDoc.issuedAt?.slice(0, 10), from: 'firm', kind: 'milestone', ref: coiDoc.storagePath }], 0)
    : undefined;
  const regProof = (r: { certPath?: string; certName?: string; step: PortalStep }) =>
    r.certPath && openDocs([{ id: `${r.step.id}:cert`, name: r.certName ?? r.step.title, type: 'PDF', from: 'firm', kind: 'milestone', ref: r.certPath }], 0);
  const docsIdx = (i: number) => openDocs(h.docs, i);
  const st5 = (cls: string) => (
    <St5Card
      model={h.model}
      company={h.company}
      lead={h.lead}
      link={{ label: 'All steps', onClick: () => h.portal.go('incorporation') }}
      onPhase={(no) => h.portal.go(phaseHref(no))}
      onStep={(s) => h.portal.go(stepHref(s.id))}
      className={cls}
    />
  );

  return (
    <div className="cp-home">
      <Island className={FRAME}>
        <JourneyMap h={h} onNeed={upload} />
        <HomeCard h={h} onUpload={upload} />
        {h.after ? (
          <>
            <div className={COLS}>
              <div className={COL}>
                {st5('max-lg:order-3')}
                <TimelineCard h={h} phases={phases} onEdit={() => setEditor(true)} className="max-lg:order-[9]" />
                <AreaCard h={h} className="max-lg:order-[8]" />
                <PostIncCard h={h} className="max-lg:order-6" />
                <DocsCard h={h} onOpen={docsIdx} onDownload={(d) => void download(d)} uploads={uploadRows} uploading={uploading} onCancelUpload={cancelUpload} className="max-lg:order-[11]" />
                <ActivityCard h={h} className="max-lg:order-[13]" />
              </div>
              <div className={COL}>
                <NeedsCard h={h} onUpload={upload} className="max-lg:order-1" />
                <NextCard h={h} className="max-lg:order-2" />
                <CompCard h={h} onOpen={(tab) => h.portal.drill(complianceDrill(h.filings, h.today, h.home?.filings.fyLabel ?? '', tab))} className="max-lg:order-4" />
                <MeetingsCard engagementId={h.engagementId} today={h.today} className="max-lg:order-4" />
                <IdsCard h={h} onReveal={setReveal} onCoi={coiOpen} className="max-lg:order-5" />
                <AlertsCard h={h} className="max-lg:order-[10]" />
                <SbcCard h={h} className="max-lg:order-[12]" />
                <MessagesCard engagementId={h.engagementId} lead={h.lead} today={h.today} className="max-lg:order-[14]" />
              </div>
            </div>
            <RegCard h={h} onProof={regProof} className="max-lg:order-7" />
          </>
        ) : (
          <div className={COLS}>
            <div className={COL}>
              {st5('max-lg:order-2')}
              <TimelineCard h={h} phases={phases} onEdit={() => setEditor(true)} className="max-lg:order-5" />
              <DocsCard h={h} onOpen={docsIdx} onDownload={(d) => void download(d)} uploads={uploadRows} uploading={uploading} onCancelUpload={cancelUpload} className="max-lg:order-6" />
              <ActivityCard h={h} className="max-lg:order-8" />
            </div>
            <div className={COL}>
              <NeedsCard h={h} onUpload={upload} className="max-lg:order-1" />
              <HoldsCard h={h} className="max-lg:order-3" />
              <AlertsCard h={h} className="max-lg:order-4" />
              <SbcCard h={h} className="max-lg:order-7" />
              <MessagesCard engagementId={h.engagementId} lead={h.lead} today={h.today} className="max-lg:order-9" />
            </div>
          </div>
        )}
      </Island>
      {field}
      {uploadFor ? (
        <UploadDialog
          requests={uploadRequests}
          initialId={uploadFor.id}
          today={h.today}
          onClose={() => setUploadFor(null)}
          onUpload={(r, files) => r.requestId && sendTo(r.requestId, r.title, files)}
        />
      ) : null}
      {editor && phases && h.engagementId ? (
        <TimelineEditor phases={phases} today={h.today} engagementId={h.engagementId} company={h.company} manager={h.manager} onClose={() => setEditor(false)} />
      ) : null}
      {reveal ? <IdsRevealDialog field={reveal} onClose={() => setReveal(null)} /> : null}
      {viewer ? <DocViewer docs={viewer.docs} index={viewer.i} onClose={() => setViewer(null)} onIndexChange={(i) => setViewer((v) => (v ? { ...v, i } : v))} /> : null}
    </div>
  );
}
