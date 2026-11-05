import type { Dispatch, SetStateAction } from 'react';
import type { VaultDocument, VaultEntityGroup } from '@/lib/documents/vault-documents';
import type { VaultMenuItem } from '@/views/vault/vault-explorer-parts';
import type { VaultTreeView } from '@/views/vault/vault-tree';
import { canDeleteDoc, childFolderIds, folderDocs, type VaultFileFacts } from '@/views/vault/vault-files';
import { toastUndo } from '@/components/ui/undo-toast';
import { toastError } from '@/lib/toast-errors';

export function copyLink(href: string) {
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

/** The "…" menus on the Vault's file and folder rows, built from the page's state. */
export function createVaultMenus(ctx: {
  user: Parameters<typeof canDeleteDoc>[2];
  view: VaultTreeView;
  vaultPath: string;
  allFolderIds: string[];
  indexFor: (doc: VaultDocument) => VaultFileFacts | null;
  fileLink: (docId: string) => string;
  openViewer: (docId: string) => void;
  downloadDoc: (doc: VaultDocument) => void;
  zipDocs: (name: string, docs: VaultDocument[]) => void;
  setClosed: Dispatch<SetStateAction<Set<string>>>;
  setDeleting: (doc: VaultDocument | null) => void;
}) {
  const { user, view, vaultPath, allFolderIds, indexFor, fileLink, openViewer, downloadDoc, zipDocs, setClosed, setDeleting } = ctx;

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

  function folderMenu(entity: VaultEntityGroup, id: string, label: string, count: number): VaultMenuItem[] {
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

  return { fileMenu, folderMenu };
}
