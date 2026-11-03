'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileBadge } from '@/components/ui/file-badge';
import { SkeletonRows } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

/**
 * The read dialog of a filing's proof (prototype `ProofDialog`): the client as the
 * eyebrow, Filed on and Reference, one row per proof file with its type badge and a
 * download button, and "Download all". It reads the existing, scoped
 * `GET /api/client/compliances/:id/proofs` list and downloads through
 * `GET /api/client/compliances/:id/proofs/:proofId`, which redirects to a short-lived
 * signed URL. Writers get an Edit button that opens the proof and details editor.
 */

export interface ProofFile {
  id: string;
  fileName: string;
  kind: string;
  uploadedAt: string;
}

function proofHref(instanceId: string, proofId: string): string {
  return `/api/client/compliances/${encodeURIComponent(instanceId)}/proofs/${encodeURIComponent(proofId)}`;
}

/** Fetch the proof list of one filing (the editor shares the query key). */
function useFilingProofs(instanceId: string, enabled = true) {
  return useQuery({
    queryKey: ['filing-proofs', instanceId],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/client/compliances/${encodeURIComponent(instanceId)}/proofs`);
      if (!res.ok) throw new Error('Could not load the proofs');
      return ((await res.json()) as { proofs?: ProofFile[] }).proofs ?? [];
    },
  });
}

/** Start one browser download per file. The route redirects each one to its signed URL. */
function downloadProofs(instanceId: string, files: readonly ProofFile[]): void {
  files.forEach((f, i) => {
    window.setTimeout(() => {
      const a = document.createElement('a');
      a.href = proofHref(instanceId, f.id);
      a.download = f.fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 300);
  });
}

/** Download every proof of a filing, loading the list first. */
export async function downloadAllProofs(instanceId: string): Promise<number> {
  const res = await fetch(`/api/client/compliances/${encodeURIComponent(instanceId)}/proofs`);
  if (!res.ok) throw new Error('Could not load the proofs');
  const files = ((await res.json()) as { proofs?: ProofFile[] }).proofs ?? [];
  downloadProofs(instanceId, files);
  return files.length;
}

export function FilingProofDialog({
  open,
  onOpenChange,
  instanceId,
  title,
  eyebrow,
  facts,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  /** "GSTR-3B · Sep 2026". */
  title: string;
  /** The client's name. */
  eyebrow?: string;
  /** Filed on and Reference, already formatted. */
  facts: Array<{ k: string; v: string; mono?: boolean }>;
  /** Writers only: open the proof and details editor. */
  onEdit?: () => void;
}) {
  const proofs = useFilingProofs(instanceId, open);
  const files = proofs.data ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader className="border-b border-line-soft px-5 pb-3 pt-5">
          {eyebrow ? <DialogDescription className="text-[12.5px] text-ink-muted">{eyebrow}</DialogDescription> : null}
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-line-soft px-5 py-4 text-[13.5px]">
          {facts.map((f) => (
            <div key={f.k} className="contents">
              <dt className="text-ink-muted">{f.k}</dt>
              <dd className={cn('min-w-0 truncate text-ink', f.mono && 'font-mono text-[13px]')}>{f.v}</dd>
            </div>
          ))}
        </dl>
        {proofs.isPending ? (
          <div className="px-5 py-3">
            <SkeletonRows rows={2} />
          </div>
        ) : files.length === 0 ? (
          <p className="px-5 py-3 text-[13px] text-ink-faint">No proof uploaded</p>
        ) : (
          <ul>
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 border-t border-line-soft px-5 py-2.5 first:border-t-0">
                <FileBadge name={f.fileName} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{f.fileName}</span>
                <Button size="iconSm" variant="quiet" asChild>
                  <a href={proofHref(instanceId, f.id)} download={f.fileName} aria-label={`Download ${f.fileName}`}>
                    <Download aria-hidden />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2 border-t border-line-soft px-5 py-3">
          {onEdit ? (
            <Button variant="secondary" onClick={onEdit}>
              <Pencil aria-hidden />
              Edit
            </Button>
          ) : null}
          <Button disabled={files.length === 0} onClick={() => downloadProofs(instanceId, files)}>
            <Download aria-hidden />
            Download all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
