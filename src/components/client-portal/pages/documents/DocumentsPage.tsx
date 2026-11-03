'use client';

/**
 * Client Documents page (/app/client/documents) — prototype route `documents`:
 * desktop / tablet board docs_a_refined, phone board docs_a_mobile (< 700 px),
 * plus loading / empty / error states, the progress drill-down, the upload
 * flow, the phone preview sheet and the shared document viewer.
 *
 * Data: GET /api/client/documents (every source merged and access-checked on
 * the server) + the shared step model for phase / step names and numbers.
 */
import { BoardMeetingDocs } from './BoardMeetingDocs';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePortal, usePortalOptional, PORTAL_SHELL_KEY } from '@/components/client-portal/PortalProvider';
import LegacyClientDocuments from '@/views/client/Documents';
import { usePortalIncorporation } from '@/components/client-portal/hooks';
import type { DocNode } from '@/lib/client-portal/documents';
import { useDocViewer } from './DocViewer';
import { DocsExplorer } from './Explorer';
import { DocsMobile } from './Mobile';
import { DocsDrill, type DrillTarget } from './Drill';
import { UploadDialog } from './UploadDialog';
import { MobilePreview } from './MobilePreview';
import { DocsEmpty, DocsError, DocsLoading } from './States';
import { DOCS_KEY, toViewerDoc, useClientDocuments, useDelayedLoading, usePhone, useZipToast } from './shared-ui';
import type { View } from './model';
import '../../css/documents-explorer.css';
import '../../css/documents-boards.css';

/** Staff (super admin) opening /app/client/* outside the portal shell keep the previous view. */
export function DocumentsPage() {
  const portal = usePortalOptional();
  if (!portal) return <LegacyClientDocuments />;
  return <DocumentsInner />;
}

function DocumentsInner() {
  const { prefs, savePrefs, toast, go, shell } = usePortal();
  const { model, loading: engLoading } = usePortalIncorporation();
  const q = useClientDocuments();
  const qc = useQueryClient();
  const phone = usePhone();
  const zip = useZipToast();
  const viewer = useDocViewer();
  const [view, setViewState] = useState<View>(prefs?.docGrouping === 'category' ? 1 : 0);
  useEffect(() => {
    if (prefs) setViewState(prefs.docGrouping === 'category' ? 1 : 0);
  }, [prefs?.docGrouping]); // eslint-disable-line react-hooks/exhaustive-deps
  const setView = useCallback(
    (v: View) => {
      setViewState(v);
      savePrefs({ docGrouping: v === 1 ? 'category' : 'step' });
    },
    [savePrefs],
  );

  const [upload, setUpload] = useState<{ requestId?: string; file?: File } | null>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [mprev, setMprev] = useState<DocNode | null>(null);
  const [glowId, setGlowId] = useState<string | null>(null);
  const [selectId, setSelectId] = useState<string | null>(null);

  const data = q.data;
  const company = data?.companyShort ?? shell?.companyShort ?? 'Your company';
  const lead = shell?.team.find((t) => t.role === 'Project Lead')?.name.split(/\s+/)[0];

  const stepLabel = useCallback(
    (n: DocNode) => {
      const s = n.stepId ? model.byId[n.stepId] : undefined;
      return s ? `Step ${s.n} · ${s.title}` : undefined;
    },
    [model],
  );

  const preview = useCallback(
    (n: DocNode, list: DocNode[]) => {
      if (phone) {
        setMprev(n);
        return;
      }
      const docs = list.some((x) => x.id === n.id) ? list : [n, ...list];
      const files = docs.filter((x) => x.ref);
      viewer.open(
        files.map((x) => toViewerDoc(x, stepLabel(x))),
        Math.max(0, files.findIndex((x) => x.id === n.id)),
      );
    },
    [phone, viewer, stepLabel],
  );

  const openUpload = useCallback(
    (requestId?: string, file?: File) => {
      if (!data?.openRequests.length) {
        toast('There is no open request to upload against');
        return;
      }
      setUpload({ requestId, file });
    },
    [data?.openRequests.length, toast],
  );

  const onUploaded = useCallback(
    ({ fileId, requestId, count }: { fileId: string; requestId: string; label: string; count?: number }) => {
      setUpload(null);
      setDrill(null);
      const rowId = `rf-${fileId}`;
      setGlowId(rowId);
      setSelectId(rowId);
      setTimeout(() => setGlowId((g) => (g === rowId ? null : g)), 2600);
      void qc.invalidateQueries({ queryKey: DOCS_KEY });
      void qc.invalidateQueries({ queryKey: PORTAL_SHELL_KEY });
      toast(count && count > 1 ? `${count} files sent to ${lead ?? 'SBC'} for review` : `Sent to ${lead ?? 'SBC'} for review`, {
        undo: () => {
          void fetch(`/api/client/documents/requests/${encodeURIComponent(requestId)}/upload?file=${encodeURIComponent(fileId)}`, { method: 'DELETE' }).finally(() => {
            setSelectId(`req-${requestId}`);
            void qc.invalidateQueries({ queryKey: DOCS_KEY });
            void qc.invalidateQueries({ queryKey: PORTAL_SHELL_KEY });
          });
        },
      });
    },
    [qc, toast, lead],
  );

  const showSkeleton = useDelayedLoading(q.isLoading || engLoading);
  const noEngagement = q.isError && (q.error as Error).message === 'none';

  let body: React.ReactNode;
  if (q.isLoading || engLoading || (showSkeleton && !data)) {
    body = showSkeleton ? <DocsLoading phone={phone} /> : null;
  } else if (q.isError && !noEngagement) {
    body = <DocsError onRetry={() => void q.refetch()} />;
  } else if (!data || data.nodes.length === 0) {
    body = (
      <DocsEmpty
        canUpload={!!data?.openRequests.length}
        onUpload={() => openUpload()}
        onOpenInc={() => go('incorporation')}
      />
    );
  } else if (phone) {
    body = <DocsMobile data={data} model={model} view={view} setView={setView} zip={zip} onOpenFile={preview} onUpload={openUpload} />;
  } else {
    body = (
      <DocsExplorer
        data={data}
        model={model}
        view={view}
        setView={setView}
        zip={zip}
        glowId={glowId}
        selectId={selectId}
        onPreview={preview}
        onUpload={openUpload}
        onDrill={setDrill}
      />
    );
  }

  return (
    <div className="cp-documents">
      {phone && data && data.nodes.length > 0 ? (
        body
      ) : (
        <div className="vdoc">
          <div className="vdoc-col">
            <main className="vdoc-main">
              {body}
              <BoardMeetingDocs engagementId={shell?.engagementId} />
            </main>
          </div>
        </div>
      )}
      {drill ? (
        <DocsDrill
          target={drill}
          onClose={() => setDrill(null)}
          onPreview={(n, list) => {
            setDrill(null);
            preview(n, list);
          }}
          onUpload={(n) => {
            setDrill(null);
            openUpload(n.requestId);
          }}
        />
      ) : null}
      {upload && data ? (
        <UploadDialog requests={data.openRequests} initialRequestId={upload.requestId} initialFile={upload.file ?? null} accept={data.accept} onClose={() => setUpload(null)} onUploaded={onUploaded} />
      ) : null}
      {mprev ? <MobilePreview node={mprev} company={company} onClose={() => setMprev(null)} /> : null}
      {viewer.node}
    </div>
  );
}
