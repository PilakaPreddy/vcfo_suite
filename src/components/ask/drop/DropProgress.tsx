'use client';

import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import type { UploadProgress } from '@/hooks/ask/ask-api';
import type { DropFile, DropRunView } from '@/lib/ask/drop/types';
import { formatUploadFileSize } from '@/lib/upload-limits';

/** A file's state in plain words; the words are shown as given (`raw`), with their own tone. */
const FILE_STATE: Record<DropFile['status'], [string, ChipTone]> = {
  queued: ['Queued', 'idle'],
  read: ['Read', 'prog'],
  placed: ['Placed', 'ok'],
  skipped: ['Skipped', 'warn'],
  failed: ['Failed', 'bad'],
};

/** A thin bar; `value` is 0 to 1. */
function Bar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * The progress line for a drop the background job is working on: what it is doing now, how many
 * files are through, and each file's state on demand. The person can close the panel; the line
 * comes back when the chat is opened again.
 */
export function DropProgress({ run }: { run: DropRunView }) {
  const { done, total, label } = run.progress;
  return (
    <div data-testid="ask-drop-progress" className="space-y-1.5 rounded-md bg-surface-sunken px-3 py-2 text-[12.5px] text-ink">
      <p className="flex items-center gap-2 font-medium">
        <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-[2px] bg-brand" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label || 'Working through your files'}</span>
        {total > 0 ? (
          <span className="flex-none font-mono text-[11.5px] text-ink-muted">
            {done} of {total}
          </span>
        ) : null}
      </p>
      <Bar value={total > 0 ? done / total : 0} label="Files worked through" />
      {run.files.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-[12px] text-brand-text">Show the files</summary>
          <ul className="mt-1.5 space-y-1">
            {run.files.map((file) => (
              <li key={file.attachmentId} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={file.reason ? `${file.path}: ${file.reason}` : file.path}>
                  {file.path}
                </span>
                {file.destination ? <span className="hidden max-w-[40%] truncate text-[11.5px] text-ink-muted sm:inline">{file.destination}</span> : null}
                <Chip fixed raw tone={FILE_STATE[file.status][1]}>
                  {FILE_STATE[file.status][0]}
                </Chip>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-[11.5px] text-ink-muted">You can close this panel. The cards appear here when the files are sorted.</p>
    </div>
  );
}

/** Each file's upload while the composer sends a drop. */
export function UploadList({ uploads }: { uploads: UploadProgress[] }) {
  if (uploads.length === 0) return null;
  const sent = uploads.filter((u) => u.status === 'done').length;
  const loaded = uploads.reduce((sum, u) => sum + (u.status === 'failed' ? u.total : u.loaded), 0);
  const total = uploads.reduce((sum, u) => sum + u.total, 0);
  return (
    <div data-testid="ask-upload-progress" className="space-y-1.5 px-1 text-[12px] text-ink">
      <p className="flex justify-between gap-2">
        <span>
          Uploading {sent} of {uploads.length} file{uploads.length === 1 ? '' : 's'}
        </span>
        <span className="font-mono text-[11.5px] text-ink-muted">
          {formatUploadFileSize(loaded)} of {formatUploadFileSize(total)}
        </span>
      </p>
      <Bar value={total > 0 ? loaded / total : 0} label="Upload progress" />
      <ul className="max-h-32 space-y-1 overflow-y-auto">
        {uploads.map((u) => (
          <li key={u.path} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2">
            <span className={u.status === 'failed' ? 'truncate text-danger' : 'truncate'} title={u.error ? `${u.path}: ${u.error}` : u.path}>
              {u.path}
            </span>
            {u.status === 'failed' ? <span className="text-right text-danger">Failed</span> : <Bar value={u.total > 0 ? u.loaded / u.total : u.status === 'done' ? 1 : 0} label={`Upload of ${u.path}`} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
