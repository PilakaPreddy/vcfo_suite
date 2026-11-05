'use client';

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePortal } from '@/components/client-portal/PortalProvider';
import { UploadTray, useMultiUpload } from '@/components/client-portal/use-multi-upload';
import { daysUntil, exactDate, relativeDue } from '@/lib/relative-due';
import { cn } from '@/lib/utils';
import { HOME_QUERY_KEY } from './useHome';
import type { DocItem } from './derive';
import { docUrl } from './derive';

;

/* ------------------------------------------------------------ due words */

/** `h.today` ("2026-10-29", India time) as a local calendar day for `relativeDue`. */
function dayOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/**
 * E-11: the relative due words that start the sub line of an attention list ("In 3 days",
 * "Today", "2 days late"), with the exact date ("Mon 19 Oct 2026") as a tooltip. Red when late,
 * amber within a week. Tables keep plain dates.
 */
export function DueWords({ iso, today, className }: { iso: string; today: string; className?: string }) {
  const now = dayOf(today);
  const words = relativeDue(iso, now);
  const n = daysUntil(iso, now);
  if (!words || n === null) return null;
  return (
    <span title={exactDate(iso)} className={cn(n < 0 ? 'text-danger' : n <= 7 ? 'text-warning' : undefined, className)}>
      {words}
    </span>
  );
}

/* ---------------------------------------------------------------- uploads */

/**
 * Upload against an open request (DECISIONS: uploads only against open
 * requests): opens the OS picker (or camera), posts the files, toasts
 * "Uploaded · <item>" with Undo. G-09: the picker takes several files; they go
 * in one request and the tray shows each file's own progress and, for a
 * refused file, its reason. Undo removes the whole batch.
 */
export function useNeedUpload({ tray = true }: { tray?: boolean } = {}) {
  const { toast } = usePortal();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement | null>(null);
  const pending = useRef<{ id: string; title: string } | null>(null);
  const up = useMultiUpload();
  const [trayTitle, setTrayTitle] = useState('');

  const send = useCallback(
    async (files: File[]) => {
      const target = pending.current;
      if (!target || !files.length) return;
      setTrayTitle(target.title);
      const url = `/api/client/home/needs/${encodeURIComponent(target.id)}/upload`;
      const res = await up.send(url, files);
      const docId = typeof res.body.documentId === 'string' ? res.body.documentId : null;
      if (!res.ok || !docId) {
        toast(res.body.error ?? 'Upload failed. Try again.');
        return;
      }
      void qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] });
      const refused = res.body.rejected?.length ?? 0;
      const stored = files.length - refused;
      const label = files.length === 1 ? `Uploaded · ${target.title}` : refused ? `Uploaded ${stored} of ${files.length} files · ${target.title}` : `Uploaded ${stored} files · ${target.title}`;
      // keep the tray open when a file was refused, so its reason stays on screen
      if (!refused) setTimeout(up.clear, 2400);
      toast(label, {
        undo: () => {
          up.clear();
          void fetch(`${url}?documentId=${encodeURIComponent(docId)}`, { method: 'DELETE' }).then(() => qc.invalidateQueries({ queryKey: [HOME_QUERY_KEY] }));
        },
      });
    },
    [qc, toast, up],
  );

  const pick = useCallback((id: string, title: string, capture?: boolean) => {
    pending.current = { id, title };
    const el = input.current;
    if (!el) return;
    if (capture) el.setAttribute('capture', 'environment');
    else el.removeAttribute('capture');
    el.value = '';
    el.click();
  }, []);

  /** Send files picked elsewhere (the upload dialog) against one request. */
  const sendTo = useCallback(
    (id: string, title: string, files: File[]) => {
      pending.current = { id, title };
      void send(files);
    },
    [send],
  );

  const field = (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void send(files);
        }}
      />
      {tray ? <UploadTray title={trayTitle} rows={up.rows} busy={up.busy} onCancel={up.cancel} onClose={up.clear} /> : null}
    </>
  );
  // B-20: the per-file rows, so Home can show them in Recent documents instead of the tray.
  return { pick, sendTo, field, rows: up.rows, busy: up.busy, cancel: up.cancel, clear: up.clear, target: trayTitle };
}

/** ⬇ Download: resolve the signed URL, then save. */
export function useDownload() {
  const { toast } = usePortal();
  return useCallback(
    async (d: DocItem) => {
      try {
        const url = await docUrl(d);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(`Download started · ${d.name}`);
      } catch {
        toast('Could not download that file');
      }
    },
    [toast],
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
