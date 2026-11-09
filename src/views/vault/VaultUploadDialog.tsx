'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { checklist } from '@/data/checklist';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileBadge } from '@/components/ui/file-badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { uploadMilestoneDocument, validateMilestoneUploadFile } from '@/lib/documents/milestone-document-storage';
import { formatUploadFileSize, maxUploadSizeLabel } from '@/lib/upload-limits';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { toastSaved } from '@/components/ui/toast-saved';

/*
 * Upload into the vault (G-26). Reuses the checklist upload route
 * (`POST /api/engagements/:id/milestone-documents`), which stores the file and writes its
 * documents-table row for staff. Vault files use the field id `vault`; picking a step files the
 * upload under that step in the tree, otherwise it sits under "Other files".
 */

const VAULT_FIELD_ID = 'vault';
const NO_STEP = '__none';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  companyName: string;
  onUploaded: () => void;
};

export function VaultUploadDialog({ open, onOpenChange, engagementId, companyName, onUploaded }: Props) {
  const [stepId, setStepId] = useState(NO_STEP);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFiles([]);
      setStepId(NO_STEP);
    }
  }, [open]);

  function pick(list: File[]) {
    const ok: File[] = [];
    for (const f of list) {
      const err = validateMilestoneUploadFile(f);
      if (err) toastError(`${f.name} wasn't added`, err);
      else ok.push(f);
    }
    setFiles((prev) => [...prev, ...ok.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  }

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    let done = 0;
    try {
      for (const f of files) {
        await uploadMilestoneDocument(engagementId, VAULT_FIELD_ID, f, {
          stepId: stepId === NO_STEP ? undefined : stepId,
        });
        done += 1;
      }
      // A1 white toast with the status tile. No Undo: the vault has no route that removes a file.
      toastSaved(done === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${done} files`, { kind: 'uploaded', sub: companyName });
      onUploaded();
      onOpenChange(false);
    } catch (err) {
      toastError(done > 0 ? `Uploaded ${done} of ${files.length}` : "Upload didn't finish", errorMessage(err));
      if (done > 0) onUploaded();
      setFiles((prev) => prev.slice(done));
    } finally {
      setBusy(false);
    }
  }

  const stepTitle = stepId === NO_STEP ? 'No step' : (checklist.find((i) => i.id === stepId)?.title ?? 'Step');

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium">Upload · {companyName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Select value={stepId} onValueChange={setStepId}>
            <SelectTrigger aria-label="Step" className="h-9 w-full">
              <span className="truncate">{stepTitle}</span>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={NO_STEP}>No step</SelectItem>
              {checklist.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick([...e.dataTransfer.files]);
            }}
            className="flex flex-col items-center gap-2 rounded-md border-fine bg-surface-raised px-5 py-6 text-center hover:[--edge-color:oklch(var(--brand-line))]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-md bg-brand-soft text-brand-text" aria-hidden>
              <Upload className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </span>
            <b className="text-[15px] font-medium text-ink">Drop files here</b>
            <span className="text-[13px] text-ink-muted">PDF · Word · JPG · PNG · WebP · up to {maxUploadSizeLabel()}</span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              pick([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />

          {files.length > 0 ? (
            <ul className="grid gap-1.5">
              {files.map((f) => (
                <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
                  <FileBadge name={f.name} className="h-[18px] w-[30px] text-[9px]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{f.name}</span>
                  <span className="text-[12px] tabular-nums text-ink-muted">{formatUploadFileSize(f.size)}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 min-w-0"
                    disabled={busy}
                    onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void upload()} disabled={busy || files.length === 0}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {files.length > 1 ? `Upload ${files.length} files` : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
