"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  collectIndexedVaultDocuments,
  collectVaultDocuments,
  groupVaultDocuments,
  mergeVaultDocuments,
  scopeVaultDocumentsToEngagements,
  vaultDocumentsFromPayload,
  vaultSearchHits,
} from '@/lib/documents/vault-documents';
import { internVisibleDocuments } from '@/lib/documents/document-access';
import { useIndexedDocuments } from '@/hooks/use-vault-documents';
import { adminProjectPath, internEngagementPath } from '@/lib/projects/project-step-path';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { ArrowUpRight, Download, EyeOff, Search, Upload } from 'lucide-react';
import { DangerConfirm } from '@/components/ui/danger-confirm';
import { toastUndo } from '@/components/ui/undo-toast';
import { toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';
import { formatUploadFileSize } from '@/lib/upload-limits';
import { vaultLocationLabel } from '@/lib/documents/vault-documents';
import {
  DocumentOpenLink,
  VaultFileRow,
  VaultFolderRow,
  VaultPreviewPane,
  type VaultMenuItem,
} from '@/views/vault/vault-explorer-parts';
import { DocViewerOverlay, type DocViewerItem } from '@/views/doc-viewer/DocViewerOverlay';
import { formatUploadDate } from '@/views/vault/vault-tree';
import { buildVaultTree, type VaultTreeView } from '@/views/vault/vault-tree';
import {
  entityDocs as allEntityDocs,
  canDeleteDoc,
  childFolderIds,
  factsFor,
  fileUrl,
  folderDocs,
  fromLabel,
  indexMaps,
  isReplacedDoc,
  refFor,
  reviewProgress,
  viewerIdFrom,
  viewerPath,
  zipItems,
  type VaultIndexRow,
} from '@/views/vault/vault-files';
import { useVaultActions } from '@/views/vault/use-vault-actions';
import { VaultUploadDialog } from '@/views/vault/VaultUploadDialog';
import { StaffClientDocuments } from '@/components/client-portal/pages/documents/StaffClientDocuments';
import { useClientDocuments } from '@/components/client-portal/pages/documents/shared-ui';
import { useVaultRequests, VaultRequestsSection } from '@/views/vault/VaultRequestsSection';
import type { VaultDocument } from '@/lib/documents/vault-documents';

/*
 * Staff Vault (K-39): the client Documents explorer look with the client dropdown first. One
 * card holds the toolbar (client, filter, Status toggle, By step / By category), the tree on the
 * left and the preview pane on the right. No page title (R-09): the explorer card is first. Both
 * tabs read the picked client's files from one server read (`/api/client/documents?engagement=`),
 * so Manage and Client view list the same files. Only the filter, which searches every client the
 * person can see, still builds its list in the browser from checklist uploads and `/api/documents`.
 *
 * The page renders from the vault route's layout, so `<vault>/view/<id>` opens the document
 * viewer over the same explorer without loading it again (prototype DocViewerScreen).
 */

/** R-10 toggle filter: on is the soft blurple fill, off is a plain edge (R-56). */
const FILTER = 'inline-flex h-[30px] flex-none items-center gap-2 rounded-md border-1.5 px-2.5 text-[13px] font-medium';
const FILTER_ON = 'border-brand-line bg-brand-soft text-brand-text';
const FILTER_OFF = 'border-line-strong text-ink-2 hover:bg-surface-sunken';

/** Client view (the client's own Documents page) or Manage (the staff tree, review and requests). */
type VaultMode = 'client' | 'manage';
const MODE_KEY = 'vcfo.vault-mode';

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

function copyLink(href: string) {
  const url = `${window.location.origin}${href}`;
  try {
    void navigator.clipboard?.writeText(url).then(
      () => toastUndo('Link copied'),
      () => toastError("Link wasn't copied"),
    );
  } catch {
    toastError("Link wasn't copied");
  }
}

export default function DocumentVaultPage() {
  return (
    <Suspense fallback={<VaultPageSkeleton path="/app/intern/vault" />}>
      <DocumentVaultPageContent />
    </Suspense>
  );
}

/** R-48: loading shows grey shapes in the explorer's place. */
function VaultPageSkeleton({ path }: { path: string }) {
  return (
    <PageTransition>
      <SEO title="Document Vault — VCFO Suite" description="Central evidence repository for GCC setup projects." path={path} />
      <section className="surface overflow-hidden" aria-busy="true" aria-label="Loading documents">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
          <span className="block h-9 w-[200px] animate-pulse rounded-md bg-surface-sunken" />
          <span className="block h-9 w-[220px] animate-pulse rounded-md bg-surface-sunken" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[440px_minmax(0,1fr)]">
          <SkeletonRows rows={7} className="p-3 md:border-r md:border-line-soft" />
          <div className="hidden min-h-[320px] animate-pulse bg-surface-sunken md:block" aria-hidden />
        </div>
      </section>
    </PageTransition>
  );
}

function DocumentVaultPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffBase = useStaffBasePath();
  const { user, engagements, getStateForEngagement, engagementsLoading, refreshEngagementChecklist } = useApp();
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null);
  const urlQ = searchParams.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  const [view, setView] = useState<VaultTreeView>('step');
  /** Folders the person has collapsed. Every folder starts open. */
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  /** Files ticked for a ZIP of the selection (G-26). */
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  /** The "Status" toggle (R-10): status glyphs on the file rows. */
  const [showStatus, setShowStatus] = useState(true);
  /** The "Replaced" toggle (R-10, P-575): files a newer upload replaced, struck through. Off hides them. */
  const [showReplaced, setShowReplaced] = useState(false);
  /** The file waiting on the delete confirm (P-596). */
  const [deleting, setDeleting] = useState<VaultDocument | null>(null);
  const actions = useVaultActions();
  const [mode, setModeState] = useState<VaultMode>('client');
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'manage') setModeState('manage');
    } catch {
      /* private mode */
    }
  }, []);
  const setMode = (next: VaultMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* private mode */
    }
  };
  // `<vault>/view/<id>` opens the viewer over the explorer.
  const viewId = viewerIdFrom(pathname);
  const urlClient = searchParams.get('client');
  const urlFolder = searchParams.get('folder');

  useEffect(() => {
    setQ(urlQ);
  }, [urlQ]);
  const [checklistRefreshing, setChecklistRefreshing] = useState(false);

  const isIntern = user?.role === 'intern' || pathname.startsWith('/app/intern/');
  const isSuper = user?.role === 'super_admin' || pathname.startsWith('/app/super/');
  const vaultPath = isIntern ? '/app/intern/vault' : isSuper ? '/app/super/vault' : `${staffBase}/vault`;
  const portfolioHref = isIntern ? '/app/intern/clients' : `${staffBase}/projects`;
  const portfolioLabel = isIntern ? 'View clients' : 'View projects';

  const engagementIds = useMemo(() => engagements.map((e) => e.id), [engagements]);
  const indexedQuery = useIndexedDocuments(Boolean(user) && !engagementsLoading);
  const isSearching = q.trim().length > 0;

  // The filter reads every client's checklist uploads, so it loads them when the person filters.
  useEffect(() => {
    if (!isSearching || engagementsLoading || engagementIds.length === 0) return;
    let cancelled = false;
    setChecklistRefreshing(true);
    void Promise.all(engagementIds.map((id) => refreshEngagementChecklist(id))).finally(() => {
      if (!cancelled) setChecklistRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isSearching, engagementIds, engagementsLoading, refreshEngagementChecklist]);

  // A filter hit's index row carries its review state and content type, matched by id or object
  // key; a file from the server read carries its own.
  const index = useMemo(() => indexMaps((indexedQuery.data ?? []) as VaultIndexRow[]), [indexedQuery.data]);
  const indexFor = (doc: VaultDocument) => factsFor(doc, index.byKey, index.byId);

  // The picked client: the one a link or the dropdown named, else the first the person can see.
  const selectedEntityId =
    (activeEntityId && engagements.some((e) => e.id === activeEntityId) ? activeEntityId : null) ??
    engagements[0]?.id ??
    null;
  const selectedEngagement = engagements.find((e) => e.id === selectedEntityId) ?? null;
  const docsQuery = useClientDocuments(selectedEntityId ?? undefined, Boolean(selectedEntityId));
  const serverDocs = useMemo(
    () => (docsQuery.data && selectedEntityId ? vaultDocumentsFromPayload(docsQuery.data, selectedEntityId) : []),
    [docsQuery.data, selectedEntityId],
  );

  const searchDocs = useMemo(() => {
    if (!isSearching) return [];
    const milestoneDocs = collectVaultDocuments(engagements, getStateForEngagement);
    const indexedDocs = collectIndexedVaultDocuments(indexedQuery.data ?? [], engagements);
    const merged = scopeVaultDocumentsToEngagements(
      mergeVaultDocuments(milestoneDocs, indexedDocs),
      engagements,
    );
    if (user?.role === 'intern') {
      return internVisibleDocuments(user.internId, merged, engagements);
    }
    return merged;
  }, [isSearching, engagements, getStateForEngagement, indexedQuery.data, user?.internId, user?.role]);

  /** Replaced files (P-575) stay out of the tree, the counts and the ZIPs until the toggle is on. */
  const shownDocs = isSearching ? searchDocs : serverDocs;
  const replacedCount = useMemo(
    () => shownDocs.filter((d) => isReplacedDoc(d, factsFor(d, index.byKey, index.byId))).length,
    [shownDocs, index],
  );
  const notReplaced = useCallback(
    (docs: VaultDocument[]) =>
      showReplaced ? docs : docs.filter((d) => !isReplacedDoc(d, factsFor(d, index.byKey, index.byId))),
    [index, showReplaced],
  );

  const selectedEntity = useMemo(
    () =>
      selectedEngagement
        ? groupVaultDocuments(notReplaced(serverDocs), [selectedEngagement], { includeEmpty: true })[0] ?? null
        : null,
    [notReplaced, serverDocs, selectedEngagement],
  );

  const searchHits = useMemo(() => vaultSearchHits(notReplaced(searchDocs), q), [notReplaced, searchDocs, q]);
  const searchClientCount = new Set(searchHits.map((h) => h.doc.engagementId)).size;

  // The viewer and a copied folder link name their client; the picked client wins after that. A
  // link by document id alone finds its client from the index rows.
  const sameFile = (d: VaultDocument) => d.id === viewId || d.documentId === viewId || d.node?.indexRow?.id === viewId;
  const viewedDoc = viewId ? searchDocs.find(sameFile) ?? serverDocs.find(sameFile) ?? null : null;
  const linkedIndexRow = viewId && !viewedDoc && !urlClient ? indexedQuery.data?.find((r) => r.id === viewId) : undefined;
  const linkedEntityId = viewedDoc?.engagementId ?? urlClient ?? linkedIndexRow?.engagementId;
  useEffect(() => {
    if (linkedEntityId) setActiveEntityId(linkedEntityId);
  }, [linkedEntityId]);
  useEffect(() => {
    if (viewedDoc) setSelectedDocId(viewedDoc.id);
  }, [viewedDoc]);

  const treeRows = useMemo(
    () => (selectedEntity ? buildVaultTree(selectedEntity, view, closed) : []),
    [selectedEntity, view, closed],
  );
  /** The whole tree with every folder open: folder ids for Expand all, and the viewer's file order. */
  const fullTree = useMemo(
    () => (selectedEntity ? buildVaultTree(selectedEntity, view, new Set()) : []),
    [selectedEntity, view],
  );
  const allFolderIds = useMemo(() => fullTree.flatMap((r) => (r.kind === 'folder' ? [r.id] : [])), [fullTree]);

  // A copied folder link (`?client=…&folder=…`) opens that folder and closes the others.
  useEffect(() => {
    if (!urlFolder || allFolderIds.length === 0 || !allFolderIds.includes(urlFolder)) return;
    const keep = new Set(allFolderIds.filter((id) => urlFolder === id || urlFolder.startsWith(`${id}:`)));
    setClosed(new Set(allFolderIds.filter((id) => !keep.has(id))));
  }, [urlFolder, allFolderIds]);

  // The filter searches every client, so typing in Manage leaves the client view.
  const clientView = mode === 'client' && Boolean(selectedEntity) && !isSearching;

  const { data: requests } = useVaultRequests(selectedEntity?.engagementId ?? null);
  const requestedCount = (requests ?? []).filter((r) => r.status === 'pending').length;

  // While filtering, the tree shows every matching file across the clients the person can see,
  // as the old search did, so a link from the command palette (?q=) still finds the file.
  const visibleDocs = isSearching
    ? searchHits.map((h) => h.doc)
    : treeRows.flatMap((r) => (r.kind === 'file' ? [r.doc] : []));
  const entityDocs = useMemo(
    () => (selectedEntity ? selectedEntity.milestones.flatMap((m) => m.sections.flatMap((s) => s.docs)) : []),
    [selectedEntity],
  );
  const pool = isSearching ? searchHits.map((h) => h.doc) : entityDocs;
  const selectedDoc =
    pool.find((d) => d.id === selectedDocId) ?? visibleDocs[0] ?? pool[0] ?? null;

  const projectHref = (engagementId: string, slug?: string) => {
    const target = { id: engagementId, slug };
    return isIntern ? internEngagementPath(target) : adminProjectPath(target, staffBase);
  };

  function setChecked(id: string, on: boolean) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function zipDocs(name: string, docs: VaultDocument[]) {
    void actions.downloadZip(name, zipItems(docs, (d) => indexFor(d)?.id));
  }

  function toggleFolder(id: string) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Viewer links carry the filter or the client, so a reload or a copied link finds the same file.
  const linkQuery = isSearching
    ? `?q=${encodeURIComponent(q.trim())}`
    : selectedEntityId
      ? `?client=${encodeURIComponent(selectedEntityId)}`
      : '';
  const fileLink = (docId: string) => `${viewerPath(vaultPath, docId)}${linkQuery}`;
  const openViewer = (docId: string) => router.push(fileLink(docId));
  const closeViewer = () => router.push(`${vaultPath}${linkQuery}`);

  function downloadDoc(doc: VaultDocument) {
    const ref = refFor(doc, indexFor(doc)?.id);
    if (!ref) {
      toastError("This file can't be downloaded here", 'Open it from the preview.');
      return;
    }
    window.location.assign(fileUrl(ref, 'download'));
  }

  function fileMenu(doc: VaultDocument): VaultMenuItem[] {
    return [
      { label: 'Download', onSelect: () => downloadDoc(doc) },
      { label: 'Open in viewer', onSelect: () => openViewer(doc.id) },
      { label: 'Copy link', hint: 'C', separatorBefore: true, onSelect: () => copyLink(fileLink(doc.id)) },
      // D1/M1: danger sits last, after a rule. Only indexed files no step holds (P-596).
      ...(canDeleteDoc(doc, indexFor(doc), user)
        ? [{ label: 'Delete', danger: true, separatorBefore: true, onSelect: () => setDeleting(doc) }]
        : []),
    ];
  }

  function folderMenu(entity: NonNullable<typeof selectedEntity>, id: string, label: string, count: number): VaultMenuItem[] {
    const kids = childFolderIds(allFolderIds, id);
    return [
      ...(count > 0
        ? [{ label: 'Download folder as ZIP', onSelect: () => zipDocs(`${entity.companyName} ${label}`, folderDocs(entity, view, id)) }]
        : []),
      {
        label: 'Expand all',
        onSelect: () => setClosed((prev) => new Set([...prev].filter((x) => x !== id && !kids.includes(x)))),
      },
      ...(kids.length > 0
        ? [{ label: 'Collapse all', onSelect: () => setClosed((prev) => new Set([...prev, ...kids])) }]
        : []),
      {
        label: 'Copy link to folder',
        hint: 'C',
        separatorBefore: true,
        onSelect: () =>
          copyLink(`${vaultPath}?client=${encodeURIComponent(entity.engagementId)}&folder=${encodeURIComponent(id)}`),
      },
    ];
  }

  function selectFile(doc: VaultDocument) {
    setSelectedDocId(doc.id);
    // A phone has no room for the preview beside the tree; a tap opens the viewer.
    if (isPhone()) openViewer(doc.id);
  }

  if (engagementsLoading) {
    return <VaultPageSkeleton path={vaultPath} />;
  }

  const clientWord = isIntern ? 'client' : 'entity';
  const clientWords = isIntern ? 'clients' : 'entities';

  let treeBody: ReactNode;
  if (isSearching ? checklistRefreshing : docsQuery.isPending && Boolean(selectedEntityId)) {
    treeBody = <SkeletonRows rows={7} className="p-3" />;
  } else if (isSearching) {
    treeBody =
      searchHits.length === 0 ? (
        <div className="p-3">
          <EmptyState
            title={`No document matches “${q.trim()}”`}
            action={
              <Button type="button" size="sm" variant="secondary" onClick={() => setQ('')}>
                Clear filter
              </Button>
            }
          />
        </div>
      ) : (
        searchHits.map((hit) => (
          <VaultFileRow
            key={hit.doc.id}
            doc={hit.doc}
            depth={0}
            selected={selectedDoc?.id === hit.doc.id}
            sub={`${hit.companyName} · ${hit.location}`}
            onSelect={() => selectFile(hit.doc)}
            reviewStatus={indexFor(hit.doc)?.reviewStatus}
            reviewedAt={indexFor(hit.doc)?.reviewedAt}
            showStatus={showStatus}
            replaced={isReplacedDoc(hit.doc, indexFor(hit.doc))}
            menu={fileMenu(hit.doc)}
          />
        ))
      );
  } else if (!selectedEntity || selectedEntity.docCount === 0) {
    treeBody = (
      <div className="p-3">
        <EmptyState
          title="No documents yet"
          action={
            selectedEntity ? (
              <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload aria-hidden /> Upload a document
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  } else {
    treeBody = treeRows.map((row) =>
      row.kind === 'folder' ? (
        <VaultFolderRow
          key={row.id}
          label={row.label}
          depth={row.depth}
          count={row.count}
          open={!closed.has(row.id)}
          onToggle={() => toggleFolder(row.id)}
          progress={
            // Step rows (and category rows) carry the review bar; a phase row keeps its count.
            view === 'step' && row.depth === 0
              ? null
              : reviewProgress(folderDocs(selectedEntity, view, row.id).map((d) => indexFor(d)?.reviewStatus))
          }
          menu={folderMenu(selectedEntity, row.id, row.label, row.count)}
        />
      ) : (
        <VaultFileRow
          key={row.id}
          doc={row.doc}
          depth={row.depth}
          tag={row.tag}
          sub={row.sub}
          selected={selectedDoc?.id === row.doc.id}
          onSelect={() => selectFile(row.doc)}
          checked={checkedIds.has(row.doc.id)}
          onCheck={(on) => setChecked(row.doc.id, on)}
          reviewStatus={indexFor(row.doc)?.reviewStatus}
          reviewedAt={indexFor(row.doc)?.reviewedAt}
          showStatus={showStatus}
          replaced={isReplacedDoc(row.doc, indexFor(row.doc))}
          menu={fileMenu(row.doc)}
        />
      ),
    );
  }

  const checkedDocs = selectedEntity ? allEntityDocs(selectedEntity).filter((d) => checkedIds.has(d.id)) : [];
  const selectedIndex = selectedDoc ? indexFor(selectedDoc) : null;
  const selectedRef = selectedDoc ? refFor(selectedDoc, selectedIndex?.id) : null;
  const reviewRef =
    selectedRef && ('documentId' in selectedRef || 'path' in selectedRef) ? selectedRef : null;

  // The viewer walks the picked client's files in tree order (every folder open), or the
  // filter's hits while filtering; a file from a link that is in neither still opens.
  const viewerDocs: VaultDocument[] = isSearching
    ? searchHits.map((h) => h.doc)
    : fullTree.flatMap((r) => (r.kind === 'file' ? [r.doc] : []));
  if (viewedDoc && !viewerDocs.some((d) => d.id === viewedDoc.id)) viewerDocs.unshift(viewedDoc);
  const viewerItems: DocViewerItem[] = viewId
    ? viewerDocs.map((doc) => {
        const row = indexFor(doc);
        const size = row?.sizeBytes ? formatUploadFileSize(row.sizeBytes) : null;
        return {
          id: doc.id,
          fileName: doc.fileName,
          meta: [vaultLocationLabel(doc) || doc.milestoneTitle || doc.companyName, formatUploadDate(doc.uploadedAt), size]
            .filter(Boolean)
            .join(' · '),
          fileRef: refFor(doc, row?.id),
          contentType: row?.contentType,
          fallback: <DocumentOpenLink doc={doc} className="max-w-full truncate" />,
        };
      })
    : [];

  return (
    <PageTransition>
      <SEO
        title="Document Vault — VCFO Suite"
        description="Submitted documents organized by company, checklist step, and section."
        path={vaultPath}
      />

      {engagements.length === 0 && !isSearching ? (
        <EmptyState
          title={isIntern ? 'No clients assigned yet' : 'No submitted documents yet'}
          action={
            <Button type="button" size="sm" onClick={() => router.push(portfolioHref)}>
              {portfolioLabel}
            </Button>
          }
        />
      ) : (
        <section aria-label="Documents" className="surface min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
            <Select
              value={selectedEntityId ?? undefined}
              onValueChange={(id) => {
                setActiveEntityId(id);
                setSelectedDocId(null);
                setCheckedIds(new Set());
              }}
            >
              <SelectTrigger
                aria-label={isIntern ? 'Client' : 'Entity'}
                className="h-9 w-full min-w-0 sm:w-[240px]"
              >
                <span className="truncate">{selectedEntity?.companyName ?? (isIntern ? 'Client' : 'Entity')}</span>
              </SelectTrigger>
              <SelectContent>
                {engagements.map((engagement) => (
                  <SelectItem key={engagement.id} value={engagement.id}>
                    {engagement.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedEntity ? (
              <SpectrumTabs
                label="Vault view"
                items={[
                  { key: 'client', label: 'Client view' },
                  { key: 'manage', label: 'Manage' },
                ]}
                value={clientView ? 'client' : 'manage'}
                onChange={(v) => setMode(v as VaultMode)}
              />
            ) : null}

            {clientView ? null : (
              <>
                <label className="flex h-9 min-w-[140px] flex-1 items-center gap-2 rounded-md border-1.5 border-line-strong bg-surface-raised px-2.5 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-line sm:w-[240px] sm:flex-none">
                  <Search className="h-[15px] w-[15px] flex-none text-ink-muted" strokeWidth={1.6} aria-hidden />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter documents"
                    aria-label="Filter documents"
                    className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
                  />
                  <span className="flex-none text-[12.5px] tabular-nums text-ink-muted">
                    {isSearching ? `${searchHits.length}/${notReplaced(searchDocs).length}` : selectedEntity?.docCount ?? 0}
                  </span>
                </label>

                <button
                  type="button"
                  aria-pressed={showStatus}
                  onClick={() => setShowStatus((v) => !v)}
                  className={cn(FILTER, showStatus ? FILTER_ON : FILTER_OFF)}
                >
                  <span className="flex gap-0.5" aria-hidden>
                    <i className="h-1.5 w-1.5 rounded-[2px] bg-positive-mid" />
                    <i className="h-1.5 w-1.5 rounded-[2px] bg-brand" />
                    <i className="h-1.5 w-1.5 rounded-[2px] bg-warning-mid" />
                  </span>
                  Status
                </button>

                <button
                  type="button"
                  aria-pressed={showReplaced}
                  onClick={() => setShowReplaced((v) => !v)}
                  className={cn(FILTER, showReplaced ? FILTER_ON : FILTER_OFF)}
                  title={replacedCount > 0 ? `${replacedCount} replaced` : 'No replaced files'}
                >
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden /> Replaced
                </button>

                {isSearching ? null : (
                  <SpectrumTabs
                    label="Group documents"
                    items={[
                      { key: 'step', label: 'By step' },
                      { key: 'cat', label: 'By category' },
                    ]}
                    value={view}
                    onChange={(v) => setView(v as VaultTreeView)}
                  />
                )}

                {selectedEntity && !isSearching ? (
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={actions.zipping || selectedEntity.docCount === 0}
                      onClick={() =>
                        checkedDocs.length > 0
                          ? zipDocs(`${selectedEntity.companyName} selection`, checkedDocs)
                          : zipDocs(`${selectedEntity.companyName} documents`, allEntityDocs(selectedEntity))
                      }
                      aria-label={checkedDocs.length > 0 ? `Download ${checkedDocs.length} selected (ZIP)` : 'Download all (ZIP)'}
                      title={checkedDocs.length > 0 ? `Download ${checkedDocs.length} selected (ZIP)` : 'Download all (ZIP)'}
                    >
                      <Download aria-hidden />
                      {checkedDocs.length > 0 ? (
                        `${checkedDocs.length} selected`
                      ) : (
                        <span className="sm:hidden 2xl:inline">Download all (ZIP)</span>
                      )}
                    </Button>
                    {checkedDocs.length > 0 ? (
                      <Button type="button" size="sm" variant="quiet" onClick={() => setCheckedIds(new Set())}>
                        Clear
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" onClick={() => setUploadOpen(true)}>
                      <Upload aria-hidden /> {requestedCount > 0 ? `Upload · ${requestedCount} requested` : 'Upload'}
                    </Button>
                  </span>
                ) : null}
              </>
            )}

            {selectedEntity && !isSearching ? (
              <Button asChild size="sm" variant="secondary">
                <Link
                  href={projectHref(
                    selectedEntity.engagementId,
                    selectedEntity.slug ??
                      engagements.find((e) => e.id === selectedEntity.engagementId)?.slug,
                  )}
                >
                  {isIntern ? 'Open client' : 'Open project'}
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            ) : null}
          </div>

          {clientView && selectedEntity ? (
            <StaffClientDocuments
              key={selectedEntity.engagementId}
              engagementId={selectedEntity.engagementId}
              projectHref={projectHref(
                selectedEntity.engagementId,
                selectedEntity.slug ?? engagements.find((e) => e.id === selectedEntity.engagementId)?.slug,
              )}
            />
          ) : (
            <>
              {/* The filter searches every client, so the line names how many files and clients match. */}
              {isSearching && searchClientCount > 0 ? (
                <p className="border-b border-line-soft px-4 py-2 text-[12.5px] text-ink-muted">
                  {searchHits.length} {searchHits.length === 1 ? 'file' : 'files'} in{' '}
                  {searchClientCount} {searchClientCount === 1 ? clientWord : clientWords}
                </p>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[440px_minmax(0,1fr)]">
                <div
                  role="tree"
                  aria-label="Folders and files"
                  // Keys bubble up from the focused row; the tree itself is not a tab stop.
                  tabIndex={-1}
                  className="min-w-0 py-2 md:border-r md:border-line-soft"
                  onKeyDown={(e) => {
                    // C copies the picked file's viewer link (the menu's key hint).
                    if (e.key.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
                    if ((e.target as HTMLElement).closest('input, textarea, [role="menu"]')) return;
                    if (!selectedDoc) return;
                    e.preventDefault();
                    copyLink(fileLink(selectedDoc.id));
                  }}
                >
                  {treeBody}
                </div>
                <aside className="min-w-0 border-t border-line-soft md:border-t-0" aria-label="Preview">
                  {selectedDoc ? (
                    <VaultPreviewPane
                      doc={selectedDoc}
                      fileRef={selectedRef}
                      contentType={selectedIndex?.contentType}
                      review={
                        selectedIndex
                          ? {
                              status: selectedIndex.reviewStatus ?? 'none',
                              note: selectedIndex.reviewNote ?? null,
                              reviewedAt: selectedIndex.reviewedAt ?? null,
                            }
                          : null
                      }
                      onReview={reviewRef ? (status, note) => actions.review(reviewRef, status, note) : undefined}
                      viewerHref={fileLink(selectedDoc.id)}
                      from={selectedDoc.node?.from ?? fromLabel(selectedIndex, selectedDoc.companyName)}
                      replaced={isReplacedDoc(selectedDoc, selectedIndex)}
                    />
                  ) : (
                    <div className="grid h-full min-h-[240px] place-items-center bg-surface-sunken p-5 text-[13px] text-ink-faint">
                      —
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
        </section>
      )}

      {selectedEntity && !isSearching ? (
        <>
          {clientView ? null : (
            <VaultRequestsSection
              key={selectedEntity.engagementId}
              engagementId={selectedEntity.engagementId}
              companyName={selectedEntity.companyName}
              onZip={(name, items) => void actions.downloadZip(name, items)}
              zipping={actions.zipping}
            />
          )}
          <VaultUploadDialog
            open={uploadOpen}
            onOpenChange={setUploadOpen}
            engagementId={selectedEntity.engagementId}
            companyName={selectedEntity.companyName}
            onUploaded={() => void actions.refreshIndex()}
          />
        </>
      ) : null}

      <DangerConfirm
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={deleting ? `Delete ${deleting.fileName}?` : 'Delete document?'}
        body={deleting ? `${deleting.fileName} leaves the documents of ${deleting.companyName}.` : undefined}
        word="DELETE"
        confirm="Delete document"
        onConfirm={async () => {
          const doc = deleting;
          const row = doc ? indexFor(doc) : null;
          if (!doc || !row?.id) return;
          const ok = await actions.remove(row.id, doc.fileName);
          if (ok && selectedDocId === doc.id) setSelectedDocId(null);
        }}
      />

      {viewId && viewerItems.length > 0 ? (
        <DocViewerOverlay items={viewerItems} currentId={viewId} onGo={openViewer} onClose={closeViewer} />
      ) : null}
    </PageTransition>
  );
}
