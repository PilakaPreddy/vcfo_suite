'use client';

/**
 * Pieces shared by the Documents explorer (desktop/tablet), the phone board,
 * the drill-down, the upload flow and the Library pages. There is no bot
 * figure (R-04): empty states are dashed areas with the action (R-48).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { ClientDocumentsPayload, DocNode } from '@/lib/client-portal/documents';
import type { ViewerDoc } from './DocViewer';
import { engagementParam, fileUrl } from './model';
import { triggerDownload } from './file-types';

export const DOCS_KEY = ['client-portal', 'documents'] as const;

async function fetchClientDocuments(engagementId?: string): Promise<ClientDocumentsPayload> {
  const qs = engagementId ? `?engagement=${encodeURIComponent(engagementId)}` : '';
  const res = await fetch(`/api/client/documents${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'none' : `documents ${res.status}`);
  return ((await res.json()) as { documents: ClientDocumentsPayload }).documents;
}

/** A client's own documents; staff pass the engagement they are viewing. */
export function useClientDocuments(engagementId?: string) {
  return useQuery({ queryKey: [...DOCS_KEY, engagementId ?? 'own'], queryFn: () => fetchClientDocuments(engagementId), staleTime: 15_000, retry: (n, e) => (e as Error).message !== 'none' && n < 2 });
}

/** DECISIONS "Loading L1": skeleton shown after 150 ms, held at least 300 ms. */
export function useDelayedLoading(loading: boolean): boolean {
  const [show, setShow] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        since.current = Date.now();
        setShow(true);
      }, 150);
      return () => clearTimeout(t);
    }
    if (!show) return;
    const held = since.current ? Date.now() - since.current : 300;
    const t = setTimeout(() => setShow(false), Math.max(0, 300 - held));
    return () => clearTimeout(t);
  }, [loading, show]);
  return show;
}

/** Overlays render into the portal root so page CSS (scoped `.cp .cp-documents`) still applies. */
export function PagePortal({ children, page = 'documents' }: { children: ReactNode; page?: string }) {
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => setEl(document.querySelector('.cp') ?? document.body), []);
  if (!el) return null;
  return createPortal(<div className={`cp-${page}`}>{children}</div>, el);
}

/* ---------------- ZIP / copy toast (docs board .toast) ---------------- */

export interface ZipToastState {
  name: string;
  total: number;
  n: number;
  done: boolean;
  copy?: boolean;
  error?: string;
}

/**
 * Real ZIP download: streams `/api/client/documents/zip?folder=` and maps the
 * received bytes onto the board's "n of total" files counter (gold bar).
 */
export function useZipToast() {
  const [toast, setToast] = useState<ZipToastState | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    if (hide.current) clearTimeout(hide.current);
    setToast(null);
  }, []);

  const autoHide = useCallback(() => {
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const startZip = useCallback(
    async (folder: string, name: string, total: number) => {
      ctrl.current?.abort();
      if (hide.current) clearTimeout(hide.current);
      const ac = new AbortController();
      ctrl.current = ac;
      const zipName = `${name}.zip`;
      setToast({ name: zipName, total: Math.max(1, total), n: 0, done: false });
      try {
        const res = await fetch(`/api/client/documents/zip?folder=${encodeURIComponent(folder)}${engagementParam()}`, { signal: ac.signal });
        if (!res.ok) throw new Error(res.status === 404 ? 'No files to download yet' : 'Could not prepare the ZIP');
        const files = Number(res.headers.get('X-Zip-Files') ?? total) || total;
        const len = Number(res.headers.get('Content-Length') ?? 0);
        const chunks: Uint8Array[] = [];
        let got = 0;
        const reader = res.body?.getReader();
        if (reader) {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            if (len) setToast({ name: zipName, total: files, n: Math.min(files - 1, Math.floor((got / len) * files)), done: false });
          }
        }
        const blob = reader ? new Blob(chunks as BlobPart[], { type: 'application/zip' }) : await res.blob();
        const url = URL.createObjectURL(blob);
        triggerDownload(url, zipName);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setToast({ name: zipName, total: files, n: files, done: true });
        autoHide();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setToast({ name: zipName, total: 0, n: 0, done: true, error: (e as Error).message });
        autoHide();
      }
    },
    [autoHide],
  );

  const copied = useCallback(() => {
    ctrl.current?.abort();
    setToast({ name: 'Link copied', total: 0, n: 0, done: true, copy: true });
    autoHide();
  }, [autoHide]);

  useEffect(() => () => {
    ctrl.current?.abort();
    if (hide.current) clearTimeout(hide.current);
  }, []);

  return { toast, startZip, copied, dismiss };
}

export function ZipToast({ t, onClose }: { t: ZipToastState; onClose: () => void }) {
  const text = t.error ? t.error : t.copy ? 'Link copied' : t.done ? `Downloaded ${t.name}` : `Preparing ${t.name}…`;
  const count = t.error || t.copy ? '' : t.done ? `${t.total} files` : `${t.n} of ${t.total}`;
  /* R-48: a toast with a status tile (green done, red error, quiet while it works) */
  const tile = t.done ? (t.error ? 'oklch(var(--danger-mid))' : 'oklch(var(--positive-mid))') : 'oklch(100% 0 0 / .14)';
  return (
    <div className="toast" role="status" aria-live="polite">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 4, background: tile, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.done ? (t.error ? 'M12 7v6 M12 16.5h.01' : 'M5 12.5l4.5 4.5L19 7.5') : 'M6 3.5h8l4 4v13H6Z M10 3.5v2 M10 7.5v2 M10 11.5v2'} />
          </svg>
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{text}</span>
        <span className="mono" style={{ fontSize: 12, opacity: 0.75 }}>
          {count}
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          style={{ width: 24, height: 24, border: 0, borderRadius: 4, background: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {!t.done ? (
        <div className="ztbar">
          <span style={{ width: `${t.total ? (t.n / t.total) * 100 : 0}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- links, viewer docs ---------------- */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function docLink(param: 'doc' | 'folder', id: string): string {
  return `${window.location.origin}/app/client/documents?${param}=${encodeURIComponent(id)}`;
}

export function toViewerDoc(n: DocNode, stepLabel?: string): ViewerDoc {
  const ref = n.ref ?? '';
  return {
    id: n.id,
    name: n.fileName && n.fileName !== '—' ? n.fileName : n.label,
    url: async () => fileUrl(ref),
    downloadUrl: async () => fileUrl(ref, true),
    contentType: n.contentType,
    sizeBytes: n.sizeBytes,
    meta: stepLabel,
    // v7x_doc_viewer header: type, name, ⓘ, n of N, Download, close — no status chip
    // (the status badge lives in the explorer pane, navy for Final).
    uploadedAt: n.date,
    uploadedBy: n.from,
  };
}

export function downloadNode(n: DocNode) {
  if (!n.ref) return;
  triggerDownload(fileUrl(n.ref, true), n.fileName);
}

/** Width < 700 → the phone boards (prototype router, proto.js:94). */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 699px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}
