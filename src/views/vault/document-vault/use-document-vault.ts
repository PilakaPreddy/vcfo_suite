'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import {
  collectIndexedVaultDocuments,
  collectVaultDocuments,
  groupVaultDocuments,
  mergeVaultDocuments,
  scopeVaultDocumentsToEngagements,
  vaultDocumentsFromPayload,
  vaultSearchHits,
  type VaultDocument,
} from '@/lib/documents/vault-documents';
import { internVisibleDocuments } from '@/lib/documents/document-access';
import { useIndexedDocuments } from '@/hooks/use-vault-documents';
import { adminProjectPath, internEngagementPath } from '@/lib/projects/project-step-path';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import { toastError } from '@/lib/toast-errors';
import { buildVaultTree, type VaultTreeView } from '@/views/vault/vault-tree';
import {
  entityDocs as allEntityDocs,
  factsFor,
  fileUrl,
  indexMaps,
  isReplacedDoc,
  refFor,
  viewerIdFrom,
  viewerPath,
  zipItems,
  type VaultIndexRow,
} from '@/views/vault/vault-files';
import { useVaultActions } from '@/views/vault/use-vault-actions';
import { useClientDocuments } from '@/components/client-portal/pages/documents/shared-ui';
import { useVaultRequests } from '@/views/vault/VaultRequestsSection';
import { createVaultMenus } from './vault-menus';
import { createViewerItems } from './viewer-items';

/** Client view (the client's own Documents page) or Manage (the staff tree, review and requests). */
export type VaultMode = 'client' | 'manage';
const MODE_KEY = 'vcfo.vault-mode';

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * The staff Vault's state, effects and derived lists (K-39). `DocumentVaultPage` keeps the JSX
 * and reads everything it renders from here.
 */
export function useDocumentVault() {
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

  const { fileMenu, folderMenu } = createVaultMenus({
    user,
    view,
    vaultPath,
    allFolderIds,
    indexFor,
    fileLink,
    openViewer,
    downloadDoc,
    zipDocs,
    setClosed,
    setDeleting,
  });

  function selectFile(doc: VaultDocument) {
    setSelectedDocId(doc.id);
    // A phone has no room for the preview beside the tree; a tap opens the viewer.
    if (isPhone()) openViewer(doc.id);
  }

  const clientWord = isIntern ? 'client' : 'entity';
  const clientWords = isIntern ? 'clients' : 'entities';

  const checkedDocs = selectedEntity ? allEntityDocs(selectedEntity).filter((d) => checkedIds.has(d.id)) : [];
  const selectedIndex = selectedDoc ? indexFor(selectedDoc) : null;
  const selectedRef = selectedDoc ? refFor(selectedDoc, selectedIndex?.id) : null;
  const reviewRef =
    selectedRef && ('documentId' in selectedRef || 'path' in selectedRef) ? selectedRef : null;

  const viewerItems = createViewerItems({ viewId, viewedDoc, isSearching, searchHits, fullTree, indexFor });

  return {
    router,
    user,
    engagements,
    engagementsLoading,
    isIntern,
    vaultPath,
    portfolioHref,
    portfolioLabel,
    q,
    setQ,
    isSearching,
    view,
    setView,
    closed,
    selectedDocId,
    setSelectedDocId,
    checkedIds,
    setCheckedIds,
    uploadOpen,
    setUploadOpen,
    showStatus,
    setShowStatus,
    showReplaced,
    setShowReplaced,
    deleting,
    setDeleting,
    actions,
    setMode,
    viewId,
    checklistRefreshing,
    indexFor,
    selectedEntityId,
    setActiveEntityId,
    docsQuery,
    searchDocs,
    replacedCount,
    notReplaced,
    selectedEntity,
    searchHits,
    searchClientCount,
    treeRows,
    clientView,
    requestedCount,
    selectedDoc,
    projectHref,
    setChecked,
    zipDocs,
    toggleFolder,
    fileLink,
    openViewer,
    closeViewer,
    fileMenu,
    folderMenu,
    selectFile,
    clientWord,
    clientWords,
    checkedDocs,
    selectedIndex,
    selectedRef,
    reviewRef,
    viewerItems,
  };
}

export type DocumentVault = ReturnType<typeof useDocumentVault>;
