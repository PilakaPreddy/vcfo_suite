'use client';

/**
 * Upload dialog (prototype src/components/cards/UploadDialog.tsx, docs_upload): pick the open
 * request the files answer ("For"), read SBC's note on a sent-back file, drop or browse files,
 * see each file and the refused ones, then Upload. One main button (R-12).
 *
 * The files go up in one multipart request to `/api/client/home/needs/:id/upload` through
 * `useNeedUpload` (G-09). Its per-file progress rows show in Recent documents and the Undo toast
 * follows. The checks here are the route's own: PDF, JPG or PNG, up to 10 MB, up to 10 files.
 */
import { useRef, useState } from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { FileBadge } from '@/components/ui/file-badge';
import { PortalModal } from '../incorporation/modal';
import { dShort, type NeedRow } from './derive';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
const TYPE_OK = /^(application\/pdf|image\/(jpeg|png))$/;
const EXT_OK = /\.(pdf|jpe?g|png)$/i;

interface Picked {
  key: string;
  file: File;
  error?: string;
}

function sizeLabel(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function refusal(f: File): string | undefined {
  if (f.size === 0) return 'this file is empty';
  if (!(f.type ? TYPE_OK.test(f.type) : EXT_OK.test(f.name))) return 'upload a PDF, JPG or PNG';
  if (f.size > MAX_BYTES) return 'larger than 10 MB';
  return undefined;
}

function initialsOf(name?: string): string {
  if (!name) return 'SBC';
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || 'SBC'
  );
}

function dueChip(r: NeedRow, today: string) {
  if (r.kind === 'correct') return <Chip tone="bad">Re-upload</Chip>;
  if (!r.due) return null;
  return r.due < today ? <Chip tone="bad">{`Overdue · ${dShort(r.due)}`}</Chip> : <Chip tone="warn">{`Due ${dShort(r.due)}`}</Chip>;
}

export function UploadDialog({
  requests,
  initialId,
  today,
  onClose,
  onUpload,
}: {
  /** Open upload or correction requests (each has a `requestId`). */
  requests: NeedRow[];
  initialId?: string;
  today: string;
  onClose: () => void;
  onUpload: (request: NeedRow, files: File[]) => void;
}) {
  const [forId, setForId] = useState<string | undefined>(initialId ?? requests[0]?.requestId);
  const [files, setFiles] = useState<Picked[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const now = Date.now();
    setFiles((fs) => {
      const next = Array.from(list).map((file, i) => ({ key: `${now}-${i}-${file.name}`, file, error: refusal(file) }));
      const all = [...fs, ...next];
      const good = all.filter((f) => !f.error);
      // The route takes at most ten files at a time; the rest are refused here with a reason.
      return all.map((f) => (!f.error && good.indexOf(f) >= MAX_FILES ? { ...f, error: `up to ${MAX_FILES} files at a time` } : f));
    });
  };

  const req = requests.find((r) => r.requestId === forId);
  const good = files.filter((f) => !f.error);
  const ready = good.length > 0 && Boolean(req);

  return (
    <PortalModal
      onClose={onClose}
      title="Upload a document"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              if (!req) return;
              onUpload(
                req,
                good.map((f) => f.file),
              );
              onClose();
            }}
          >
            <Upload size={15} strokeWidth={1.6} aria-hidden /> Upload
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {requests.length > 0 ? (
          <fieldset className="m-0 grid gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[12.5px] font-medium text-ink-muted">For</legend>
            <div role="radiogroup" aria-label="For" className="overflow-hidden rounded-md border border-line">
              {requests.map((r) => {
                const on = r.requestId === forId;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setForId(r.requestId)}
                    className={cn(
                      'flex w-full items-center gap-3 border-t border-line-soft px-3 py-2.5 text-left text-[13.5px] text-ink first:border-t-0 hover:bg-surface-sunken',
                      on && 'bg-brand-soft hover:bg-brand-soft',
                    )}
                  >
                    <span className={cn('grid h-4 w-4 flex-none place-items-center rounded-full border-1.5', on ? 'border-brand' : 'border-line-strong')} aria-hidden>
                      {on ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    {dueChip(r, today)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        {req?.kind === 'correct' && req.note ? (
          <div className="flex items-start gap-2.5 rounded-md bg-surface-sunken px-3 py-2.5 text-[13px]">
            <span className="grid h-6 min-w-6 flex-none place-items-center rounded-md bg-brand-soft px-1 font-mono text-[11px] font-medium text-brand-text" title={req.askedBy}>
              {initialsOf(req.askedBy)}
            </span>
            <span className="min-w-0 text-ink-2">“{req.note}”</span>
          </div>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          aria-label="Choose files to upload"
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
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
          className={cn(
            'grid cursor-pointer place-items-center gap-1 rounded-md border-fine px-4 py-7 text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-line',
            over ? 'bg-brand-soft [--edge-color:oklch(var(--brand))]' : 'bg-surface-sunken hover:[--edge-color:oklch(var(--brand-line))]',
          )}
        >
          <Upload size={18} strokeWidth={1.6} className={over ? 'text-brand-text' : 'text-ink-muted'} aria-hidden />
          <span className="text-[13.5px] font-medium text-ink">
            {over ? (
              'Release to upload'
            ) : (
              <>
                Drop files here or <span className="text-brand-text">browse</span>
              </>
            )}
          </span>
          <span className="font-mono text-[11.5px] text-ink-faint">PDF · JPG · PNG · up to 10 MB</span>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {files.length > 0 ? (
          <ul className="m-0 list-none overflow-hidden rounded-md border border-line p-0" aria-label="Files">
            {files.map((f) => (
              <li key={f.key} className={cn('flex items-center gap-3 border-t border-line-soft px-3 py-2.5 text-[13px] first:border-t-0', f.error && 'bg-danger-soft')}>
                {f.error ? <AlertTriangle size={16} strokeWidth={1.6} className="flex-none text-danger" aria-hidden /> : <FileBadge name={f.file.name} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12.5px] font-medium text-ink">{f.file.name}</span>
                  <span className={cn('block text-[12px]', f.error ? 'text-danger' : 'text-ink-muted')}>{f.error ?? `${sizeLabel(f.file.size)} · ready`}</span>
                </span>
                {f.error ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setFiles((fs) => fs.filter((x) => x.key !== f.key));
                      input.current?.click();
                    }}
                  >
                    Try again
                  </Button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Remove ${f.file.name}`}
                    onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}
                    className="grid h-7 w-7 flex-none place-items-center rounded-sm text-ink-muted hover:bg-surface-sunken hover:text-ink"
                  >
                    <X size={14} strokeWidth={1.6} aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </PortalModal>
  );
}
