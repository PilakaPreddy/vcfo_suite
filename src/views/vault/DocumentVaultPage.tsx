"use client";

import { Suspense } from 'react';
import Link from 'next/link';
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
import { Download, EyeOff, Search, Upload } from 'lucide-react';
import { DangerConfirm } from '@/components/ui/danger-confirm';
import { cn } from '@/lib/utils';
import { VaultPreviewPane } from '@/views/vault/vault-explorer-parts';
import { DocViewerOverlay } from '@/views/doc-viewer/DocViewerOverlay';
import type { VaultTreeView } from '@/views/vault/vault-tree';
import { entityDocs as allEntityDocs, fromLabel, isReplacedDoc } from '@/views/vault/vault-files';
import { VaultUploadDialog } from '@/views/vault/VaultUploadDialog';
import { StaffClientDocuments } from '@/components/client-portal/pages/documents/StaffClientDocuments';
import { VaultRequestsSection } from '@/views/vault/VaultRequestsSection';
import { useDocumentVault, type VaultMode } from '@/views/vault/document-vault/use-document-vault';
import { copyLink } from '@/views/vault/document-vault/vault-menus';
import { renderTreeBody } from '@/views/vault/document-vault/tree-body';

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
  // State, effects and derived lists live in `useDocumentVault`; the tree rows, menus and viewer
  // items are built by the factories beside it in `./document-vault/`.
  const vault = useDocumentVault();
  const {
    router,
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
    selectedDocId,
    setSelectedDocId,
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
    indexFor,
    selectedEntityId,
    setActiveEntityId,
    searchDocs,
    replacedCount,
    notReplaced,
    selectedEntity,
    searchHits,
    searchClientCount,
    clientView,
    requestedCount,
    selectedDoc,
    projectHref,
    zipDocs,
    fileLink,
    openViewer,
    closeViewer,
    clientWord,
    clientWords,
    checkedDocs,
    selectedIndex,
    selectedRef,
    reviewRef,
    viewerItems,
  } = vault;

  if (engagementsLoading) {
    return <VaultPageSkeleton path={vaultPath} />;
  }

  const treeBody = renderTreeBody(vault);

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
                    {isSearching ? `${searchHits.length}/${notReplaced(searchDocs).length}` : `${selectedEntity?.docCount ?? 0}/${selectedEntity?.docCount ?? 0}`}
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
