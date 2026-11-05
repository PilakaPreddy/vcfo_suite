import type { ReactNode } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { VaultFileRow, VaultFolderRow } from '@/views/vault/vault-explorer-parts';
import { folderDocs, isReplacedDoc, reviewProgress } from '@/views/vault/vault-files';
import type { DocumentVault } from './use-document-vault';

/**
 * The tree's rows: a skeleton while loading, the filter's hits across clients, the empty state, or
 * the picked client's folders and files.
 */
export function renderTreeBody(v: DocumentVault): ReactNode {
  const {
    isSearching,
    checklistRefreshing,
    docsQuery,
    selectedEntityId,
    searchHits,
    q,
    setQ,
    selectedDoc,
    selectFile,
    indexFor,
    showStatus,
    fileMenu,
    selectedEntity,
    setUploadOpen,
    treeRows,
    closed,
    toggleFolder,
    view,
    folderMenu,
    checkedIds,
    setChecked,
  } = v;

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
  return treeBody;
}
