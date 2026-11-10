'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Plus } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FileBadge } from '@/components/ui/file-badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '@/components/ui/spectrum-chip';
import { errorMessage, toastEmailDispatch, toastError, toastSuccess } from '@/lib/toast-errors';
import type { EmailDispatchResult } from '@/lib/email/email-dispatch';
import { formatUploadDate } from '@/views/vault/vault-tree';
import { fileUrl, previewKind, type VaultRef } from '@/views/vault/vault-files';
import type { ZipItem } from '@/views/vault/use-vault-actions';

/*
 * Requested files (G-26): the engagement's document requests with the files sent against them,
 * read from `GET /api/documents/requests`. "Request a file" posts to the existing
 * `POST /api/requests`, which also emails the client.
 */

interface RequestFile {
  kind: 'document' | 'request-file';
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
}

export interface VaultRequest {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  dueOn: string | null;
  createdAt: string;
  files: RequestFile[];
}

function statusChip(status: string, files: number): string {
  if (status === 'cancelled' || status === 'rejected') return 'Closed';
  if (status === 'approved') return 'Done';
  if (status === 'fulfilled' || files > 0) return 'In review';
  return 'Waiting';
}

function refOf(file: RequestFile): VaultRef {
  return file.kind === 'document' ? { documentId: file.id } : { requestFileId: file.id };
}

export function RequestDialog({
  open,
  onOpenChange,
  engagementId,
  companyName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  companyName: string;
  onCreated: () => void;
}) {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!label.trim()) {
      toastError('Name the file', 'Say which file you need.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagementId,
          label: label.trim(),
          message: note.trim() || undefined,
          dueAt: due || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; email?: EmailDispatchResult };
      if (!res.ok) throw new Error(json.error);
      toastSuccess('File requested', `${label.trim()} · ${companyName}`);
      // The client hears about the request through the compose window the route drafts (UAT D-T06-01).
      toastEmailDispatch(json.email, { engagementId, href: '#' });
      setLabel('');
      setNote('');
      setDue('');
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toastError("Request wasn't sent", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium">Request a file · {companyName}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} placeholder="File, for example Utility bill for the office" aria-label="File needed" />
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note to the client" aria-label="Note to the client" />
          <div className="flex items-center gap-3">
            <label htmlFor="vault-request-due" className="text-[13px] font-medium text-ink-muted">
              Due
            </label>
            <Input id="vault-request-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-[180px]" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void send()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Send request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One client's document requests (staff vault). The page reads the open count for "Upload · N requested". */
export function useVaultRequests(engagementId: string | null) {
  return useQuery({
    queryKey: ['documents', 'requests', engagementId],
    enabled: Boolean(engagementId),
    queryFn: async (): Promise<VaultRequest[]> => {
      const res = await fetch(`/api/documents/requests?engagementId=${encodeURIComponent(engagementId ?? '')}`);
      const json = (await res.json()) as { ok?: boolean; error?: string; requests?: VaultRequest[] };
      if (!res.ok || json.ok === false) throw new Error(json.error ?? 'fetch_failed');
      return json.requests ?? [];
    },
  });
}

export function VaultRequestsSection({
  engagementId,
  companyName,
  onZip,
  zipping,
}: {
  engagementId: string;
  companyName: string;
  onZip: (name: string, items: ZipItem[]) => void;
  zipping: boolean;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const query = useVaultRequests(engagementId);
  const requests = query.data ?? [];
  const open = requests.filter((r) => r.status === 'pending').length;
  const allFiles = requests.flatMap((r) => r.files.map((f) => ({ ...refOf(f), folder: `Requested/${r.title}` })));

  return (
    <>
      <DashSection
        title="Requested files"
        className="mt-5"
        loading={query.isLoading}
        meta={
          <span className="flex items-center gap-2">
            {requests.length > 0 ? (
              <span className="text-[12.5px] tabular-nums text-ink-muted">
                {open} open · {requests.length}
              </span>
            ) : null}
            {allFiles.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={zipping}
                onClick={() => onZip(`${companyName} requested files`, allFiles)}
                aria-label="Download requested files (ZIP)"
                title="Download requested files (ZIP)"
              >
                <Download aria-hidden /> ZIP
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => setAsking(true)}>
              <Plus aria-hidden /> Request a file
            </Button>
          </span>
        }
      >
        {query.isError ? (
          <EmptyState title="Could not load the requests" />
        ) : requests.length === 0 ? (
          <EmptyState title="No files requested yet" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-2 py-2.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  {r.files.length === 0 ? (
                    <span className="h-[18px] w-[30px] flex-none rounded-sm border-1.5 border-line-strong" aria-label="Not sent yet" />
                  ) : (
                    <FileBadge name={r.files[0].fileName} className="h-[18px] w-[30px] text-[9px]" />
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-medium text-ink">{r.title}</b>
                    {r.detail ? <span className="block truncate text-[12.5px] text-ink-muted">{r.detail}</span> : null}
                  </span>
                  <span className="text-[12.5px] tabular-nums text-ink-muted">
                    {r.dueOn ? `Due ${formatUploadDate(r.dueOn)}` : `Asked ${formatUploadDate(r.createdAt)}`}
                  </span>
                  <Chip>{statusChip(r.status, r.files.length)}</Chip>
                </div>
                {r.files.length > 0 ? (
                  <ul className="flex flex-wrap gap-2 pl-10">
                    {r.files.map((f) => {
                      const ref = refOf(f);
                      const inline = previewKind(f.fileName, f.contentType) !== null;
                      return (
                        <li key={`${f.kind}:${f.id}`}>
                          <a
                            href={fileUrl(ref, inline ? 'inline' : 'download')}
                            target={inline ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            className="inline-flex max-w-[280px] items-center gap-1.5 text-[13px] font-medium text-brand-text hover:underline"
                          >
                            <span className="truncate">{f.fileName}</span>
                            <span className="flex-none text-[12px] font-normal text-ink-muted">{formatUploadDate(f.uploadedAt)}</span>
                            {inline ? <span className="sr-only"> (opens in a new tab)</span> : null}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DashSection>

      <RequestDialog
        open={asking}
        onOpenChange={setAsking}
        engagementId={engagementId}
        companyName={companyName}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ['documents', 'requests', engagementId] })}
      />
    </>
  );
}
