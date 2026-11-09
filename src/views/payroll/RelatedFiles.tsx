'use client';

import { useRef, useState } from 'react';
import { FileText, Folder, FolderOpen, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PayrollFile } from '@/views/payroll/use-payroll-cycle';

/**
 * The "Related files" card both payroll tabs show: one folder tile per category with its file
 * count, and an Upload files action. Clicking a tile opens its file list under the grid; the
 * upload goes into the open folder, or the first one when none is open.
 */
export function RelatedFiles({
  folders,
  files,
  onAdd,
  onRemove,
  readOnly,
}: {
  folders: readonly string[];
  files: Record<string, PayrollFile[]>;
  onAdd: (folder: string, files: PayrollFile[]) => void;
  onRemove: (folder: string, index: number) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(folders[0]!);
  const input = useRef<HTMLInputElement>(null);

  const pick = (folder: string) => {
    setTarget(folder);
    input.current?.click();
  };

  return (
    <section className="rounded-lg border-1.5 border-line bg-surface-raised p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[19px] font-semibold text-ink">Related files</h3>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => pick(open ?? folders[0]!)}
            className="inline-flex items-center gap-2 text-[15px] font-medium text-brand-text hover:underline"
          >
            <Upload className="size-4" aria-hidden />
            Upload files
          </button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          aria-label={`Upload files to ${target}`}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).map((f) => ({
              name: f.name,
              size: f.size,
              addedAt: new Date().toISOString(),
            }));
            if (picked.length) {
              onAdd(target, picked);
              setOpen(target);
            }
            e.target.value = '';
          }}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {folders.map((folder) => {
          const count = files[folder]?.length ?? 0;
          const on = open === folder;
          const Icon = on ? FolderOpen : Folder;
          return (
            <button
              key={folder}
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : folder)}
              className={cn(
                'flex h-16 items-center gap-3 rounded-md border-1.5 px-5 text-left transition-colors',
                on ? 'border-brand bg-brand-soft' : 'border-line bg-surface-raised hover:bg-hover',
              )}
            >
              <Icon className="size-5 flex-none text-ink-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[16px] text-ink">{folder}</span>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-surface-sunken px-1.5 font-mono text-[12px] text-ink">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div className="mt-4 rounded-md border-1.5 border-line-soft p-3">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-medium text-ink">{open}</span>
            {readOnly ? null : (
              <button type="button" onClick={() => pick(open)} className="font-medium text-brand-text hover:underline">
                Add to this folder
              </button>
            )}
          </div>
          {(files[open] ?? []).length === 0 ? (
            <p className="py-2 text-[13px] text-ink-faint">No files in this folder yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {(files[open] ?? []).map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 py-2 text-[13px]">
                  <FileText className="size-4 flex-none text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() => onRemove(open, i)}
                      aria-label={`Remove ${f.name}`}
                      className="rounded p-1 text-ink-muted hover:bg-hover hover:text-danger"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
