import type { VaultDocument, VaultSearchHit } from '@/lib/documents/vault-documents';
import { vaultLocationLabel } from '@/lib/documents/vault-documents';
import { formatUploadFileSize } from '@/lib/upload-limits';
import type { DocViewerItem } from '@/views/doc-viewer/DocViewerOverlay';
import { DocumentOpenLink } from '@/views/vault/vault-explorer-parts';
import { formatUploadDate, type VaultTreeRow } from '@/views/vault/vault-tree';
import { refFor, type VaultFileFacts } from '@/views/vault/vault-files';

/**
 * The document viewer's files. It walks the picked client's files in tree order (every folder
 * open), or the filter's hits while filtering; a file from a link that is in neither still opens.
 */
export function createViewerItems(ctx: {
  viewId: string | null;
  viewedDoc: VaultDocument | null;
  isSearching: boolean;
  searchHits: VaultSearchHit[];
  fullTree: VaultTreeRow[];
  indexFor: (doc: VaultDocument) => VaultFileFacts | null;
}): DocViewerItem[] {
  const { viewId, viewedDoc, isSearching, searchHits, fullTree, indexFor } = ctx;
  const viewerDocs: VaultDocument[] = isSearching
    ? searchHits.map((h) => h.doc)
    : fullTree.flatMap((r) => (r.kind === 'file' ? [r.doc] : []));
  if (viewedDoc && !viewerDocs.some((d) => d.id === viewedDoc.id)) viewerDocs.unshift(viewedDoc);
  return viewId
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
}
