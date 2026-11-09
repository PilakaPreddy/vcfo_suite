'use client';

/**
 * Upload flow (prototype s/docs/docs_upload.dc.html): "Upload a document"
 * dialog listing ONLY the open requests (DECISIONS: upload only against open
 * requests) · drop zone with the dragging state · real progress bar with
 * cancel · refused-file error with Try again · SBC's re-upload note.
 * The files go to POST /api/client/documents/requests/[id]/upload. G-09: several files can
 * answer one request in a single upload; each file gets its own row with its own progress and,
 * when the server refuses it, its own reason. Undo on the page removes the whole batch.
 * VCFO Spectrum (prototype src/components/cards/UploadDialog.tsx): a 52 px head,
 * the requests as one radio list with due chips, a plain-edged drop zone, file rows
 * with R-26 badges, Cancel and a blurple Upload in the footer.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { UploadRowsList, useMultiUpload } from '@/components/client-portal/use-multi-upload';
import type { OpenRequest } from '@/lib/client-portal/documents';
import { validateMilestoneUploadFile } from '@/lib/documents/milestone-document-storage';
import { Chip } from '@/components/ui/spectrum-chip';
import { FileBadge } from '@/components/ui/file-badge';
import { PagePortal } from './shared-ui';
import { missingLabel } from './model';
import { dayMonth } from './file-types';

const UP_ICON = 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M5 19.5h14';

function initials(name?: string): string {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return 'SBC';
  return (p.length === 1 ? p[0]!.slice(0, 2) : p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

export function UploadDialog({
  requests,
  initialRequestId,
  initialFile,
  accept,
  onClose,
  onUploaded,
}: {
  requests: OpenRequest[];
  initialRequestId?: string;
  initialFile?: File | null;
  accept: { exts: string[]; maxLabel: string };
  onClose: () => void;
  onUploaded: (r: { fileId: string; requestId: string; label: string; count?: number }) => void;
}) {
  const [sel, setSel] = useState<string>(initialRequestId && requests.some((r) => r.id === initialRequestId) ? initialRequestId : requests[0]?.id ?? '');
  // Phone: a missing row's sheet opens the upload for that one request (docs_a_mobile_menu).
  const [phone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:700px)').matches);
  const shown = phone && initialRequestId && requests.some((r) => r.id === initialRequestId) ? requests.filter((r) => r.id === initialRequestId) : requests;
  const [files, setFiles] = useState<File[]>(initialFile ? [initialFile] : []);
  const file = files[0] ?? null;
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a batch where some files were refused: the rows stay up until Done
  const [partial, setPartial] = useState<{ fileId: string; count: number } | null>(null);
  const up = useMultiUpload();
  const { cancel: cancelUpload } = up;
  const input = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const req = requests.find((r) => r.id === sel);
  const exts = accept.exts.filter((e) => e !== 'jpeg' && e !== 'doc');
  const caption = `${exts.map((e) => e.toUpperCase()).join(' · ')} · up to ${accept.maxLabel}`;

  const close = useCallback(() => {
    cancelUpload();
    // part of a batch went in: closing still reports it, so the page refreshes and offers Undo
    if (partial && req) onUploaded({ fileId: partial.fileId, requestId: req.id, label: req.label, count: partial.count });
    else onClose();
    (opener.current as HTMLElement | null)?.focus?.({ preventScroll: true });
  }, [onClose, cancelUpload, partial, req, onUploaded]);

  useEffect(() => {
    opener.current = document.activeElement;
    const t = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', key, true);
    };
  }, [close]);

  const start = useCallback(
    (list: File[] = files) => {
      if (!list.length || !req) return;
      setError(null);
      setPartial(null);
      // the browser check first: refuse a wrong file before anything is sent
      const bad = list.map((f) => [f, validateMilestoneUploadFile(f)] as const).filter(([, why]) => why);
      if (bad.length === list.length) {
        const [f, why] = bad[0]!;
        setError(/type|Use PDF/i.test(why!) ? `${f.name} · this file type can't be opened` : `${f.name} · ${why}`);
        return;
      }
      void up.send(`/api/client/documents/requests/${encodeURIComponent(req.id)}/upload`, list).then((res) => {
        const fileId = typeof res.body.fileId === 'string' ? res.body.fileId : null;
        if (res.ok && fileId) {
          const refused = res.body.rejected?.length ?? 0;
          const count = list.length - refused;
          if (refused) setPartial({ fileId, count });
          else onUploaded({ fileId, requestId: req.id, label: req.label, count });
          return;
        }
        if (res.status === 0 && res.body.error === 'Upload cancelled') return;
        const msg = res.body.error;
        if (list.length === 1) {
          const f = list[0]!;
          setError(msg ? (msg.includes(f.name) ? msg : `${f.name} · ${msg}`) : `${f.name} · upload failed`);
        }
      });
    },
    [files, req, onUploaded, up],
  );

  // a file handed in (pane drop zone, phone camera) starts at once
  useEffect(() => {
    if (initialFile && req) start([initialFile]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (list: FileList | File[] | null | undefined) => {
    const next = Array.from(list ?? []).slice(0, 10);
    if (!next.length) return;
    setFiles(next);
    setError(null);
    setPartial(null);
    up.clear();
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files);
  };

  const uploading = up.busy;
  const showRows = up.rows.length > 0 && (uploading || partial != null || up.rows.length > 1);

  return (
    <PagePortal>
      <div className="vup">
        <div
          className="vup-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !uploading) close();
          }}
        >
          <div className="vup-dlg" role="dialog" aria-modal="true" aria-labelledby="vup-title">
            <div className="vup-hd">
              <h2 id="vup-title">Upload a document</h2>
              <button ref={closeRef} type="button" className="sx-ib sm" aria-label="Close" onClick={close}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="vup-bd">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span id="up-for" className="vup-lbl">
                  For
                </span>
                <div className="vup-for" role="radiogroup" aria-labelledby="up-for">
                  {shown.map((r) => {
                    const on = r.id === sel;
                    return (
                      <button key={r.id} type="button" role="radio" aria-checked={on} disabled={uploading} onClick={() => setSel(r.id)}>
                        <span className="vup-radio" aria-hidden="true" />
                        <span className="vup-rl">{r.label}</span>
                        <span className="cp-tw">
                          {r.reupload ? (
                            <Chip tone="bad">Re-upload</Chip>
                          ) : (
                            <Chip tone={r.overdue ? 'bad' : 'warn'}>{r.overdue && r.due ? `Overdue · ${dayMonth(r.due)}` : missingLabel(r)}</Chip>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {req?.note ? (
                <div className="vup-note">
                  <span className="vup-ini" role="img" aria-label={req.noteBy ?? 'SBC'} data-tip={req.noteBy ?? 'SBC'}>
                    {initials(req.noteBy)}
                  </span>
                  <span>“{req.note}”</span>
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="vup-file err">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
                    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01" />
                  </svg>
                  <span className="vup-fn">{error}</span>
                  <button
                    type="button"
                    className="sx-btn sm"
                    onClick={() => {
                      setError(null);
                      setFiles([]);
                      up.clear();
                      input.current?.click();
                    }}
                  >
                    Try again
                  </button>
                </div>
              ) : showRows ? (
                <div className="cp-tw grid gap-2">
                  <UploadRowsList rows={up.rows} />
                  {uploading ? (
                    <button type="button" className="justify-self-end text-[12.5px] font-medium text-brand-text hover:underline" onClick={up.cancel}>
                      Cancel upload
                    </button>
                  ) : null}
                </div>
              ) : (
                <div
                  className={`vup-big${over ? ' over' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label="Choose a file to upload"
                  onClick={() => input.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      input.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={onDrop}
                >
                  <svg className="vup-up" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={UP_ICON} />
                  </svg>
                  {over ? (
                    <span className="vup-dt">Release to upload</span>
                  ) : file ? (
                    <span className="vup-dt" style={{ overflowWrap: 'anywhere' }}>
                      <span className="cp-tw" style={{ marginRight: 8, verticalAlign: 'middle' }}>
                        <FileBadge name={file.name} />
                      </span>
                      {files.length > 1 ? `${files.length} files · ${files.map((f) => f.name).join(', ')}` : file.name}
                    </span>
                  ) : (
                    <span className="vup-dt">
                      {req?.reupload ? 'Drop the new file here or ' : 'Drop files here or '}
                      {/* link-styled word only: the whole drop zone around it is the button that opens the picker */}
                      <span className="vup-browse">browse</span>
                    </span>
                  )}
                  <span className="vup-cap">{caption}</span>
                </div>
              )}
              <input
                ref={input}
                type="file"
                multiple
                hidden
                style={{ display: 'none' }}
                accept={accept.exts.map((e) => `.${e}`).join(',')}
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="vup-foot">
              <button type="button" className="sx-btn" onClick={close}>
                Cancel
              </button>
              {partial && req ? (
                <button type="button" className="sx-btn p" onClick={() => onUploaded({ fileId: partial.fileId, requestId: req.id, label: req.label, count: partial.count })}>
                  Done
                </button>
              ) : (
                <button type="button" className="sx-btn p" disabled={!file || !req || uploading || !!error} onClick={() => start()}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={UP_ICON} />
                  </svg>
                  {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </PagePortal>
  );
}
