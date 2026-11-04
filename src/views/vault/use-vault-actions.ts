'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage, toastError, toastInfo } from '@/lib/toast-errors';
import { toastSaved } from '@/components/ui/toast-saved';
import { toastUndo } from '@/components/ui/undo-toast';
import type { VaultRef } from '@/views/vault/vault-files';
import { DOCS_KEY } from '@/components/client-portal/pages/documents/shared-ui';

/*
 * Vault actions (G-26): ZIP download, review, and delete with Undo (P-596). The ZIP is checked
 * first with a dry run, so a bad selection shows a toast; then a plain form post hands the archive to the browser, which
 * streams it to disk instead of holding it in memory.
 */

export type ZipItem = VaultRef & { folder?: string };

function submitZipForm(payload: { name: string; items: ZipItem[] }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/api/documents/zip';
  form.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = JSON.stringify(payload);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

/** The firm-wide index rows (the filter) and the per-client documents read (the tree). */
function refreshDocuments(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['documents', 'vault'] }),
    queryClient.invalidateQueries({ queryKey: DOCS_KEY }),
  ]);
}

export function useVaultActions() {
  const queryClient = useQueryClient();
  const [zipping, setZipping] = useState(false);

  const downloadZip = useCallback(async (name: string, items: ZipItem[]) => {
    if (items.length === 0) {
      toastError('Nothing to download');
      return;
    }
    setZipping(true);
    try {
      const res = await fetch('/api/documents/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, items, dryRun: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; files?: number; missing?: number };
      if (!res.ok || json.ok === false) {
        throw new Error(
          json.error === 'not_found'
            ? 'One of these files is not open to you.'
            : json.error === 'files_missing'
              ? 'These files are missing from storage.'
              : json.error,
        );
      }
      submitZipForm({ name, items });
      const count = json.files ?? items.length;
      toastInfo(
        `Preparing ${name}.zip`,
        `${count} ${count === 1 ? 'file' : 'files'}${json.missing ? ` · ${json.missing} missing from storage` : ''}`,
      );
    } catch (err) {
      toastError("ZIP didn't download", errorMessage(err));
    } finally {
      setZipping(false);
    }
  }, []);

  const review = useCallback(
    async (ref: { documentId: string } | { path: string }, status: 'pending' | 'approved' | 'changes', note?: string) => {
      try {
        const res = await fetch('/api/documents/review', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ref, status, note: note?.trim() || undefined }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) throw new Error(json.error);
        await refreshDocuments(queryClient);
        // A1 toast with the status tile (R-13).
        toastSaved(status === 'approved' ? 'Approved' : status === 'changes' ? 'Sent back' : 'Marked in review');
        return true;
      } catch (err) {
        toastError("Review wasn't saved", errorMessage(err));
        return false;
      }
    },
    [queryClient],
  );

  const refreshIndex = useCallback(
    () => refreshDocuments(queryClient),
    [queryClient],
  );

  /** Bring a deleted file back (the Undo of a delete). */
  const restore = useCallback(
    async (documentId: string, fileName: string) => {
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/restore`, { method: 'POST' });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) throw new Error(json.error);
        await refreshDocuments(queryClient);
        toastSaved(`Restored ${fileName}`);
      } catch (err) {
        toastError(`${fileName} wasn't restored`, errorMessage(err));
      }
    },
    [queryClient],
  );

  /** Delete a vault file (a soft delete), then the A2 toast with Undo. False when it failed (with a toast). */
  const remove = useCallback(
    async (documentId: string, fileName: string): Promise<boolean> => {
      let res: Response;
      try {
        res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      } catch (err) {
        toastError(`${fileName} wasn't deleted`, errorMessage(err));
        return false;
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        const why =
          json.error === 'in_use'
            ? 'A checklist step still holds this file. Replace it from the step.'
            : json.error === 'forbidden'
              ? 'You can delete only files you uploaded.'
              : json.error === 'not_found'
                ? 'This file is not open to you.'
                : json.error;
        toastError(`${fileName} wasn't deleted`, why);
        return false;
      }
      await refreshDocuments(queryClient);
      toastUndo(`Deleted ${fileName}`, () => void restore(documentId, fileName));
      return true;
    },
    [queryClient, restore],
  );

  return { downloadZip, zipping, review, refreshIndex, remove, restore };
}
