'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { FileBadge, fileType } from '@/components/ui/file-badge';
import type { Engagement } from '@/data/engagements';
import type { DocumentDto } from '@/db/repositories/documents';
import { shortDate } from '@/components/timeline/timeline-model';
import { errorMessage, toastError } from '@/lib/toast-errors';
import { cn } from '@/lib/utils';

/**
 * DOCUMENTS TAB of a staff client record (prototype `ClientRecordScreen` Documents card): a flush
 * card of the client's indexed files, newest first, with "Vault ›" in the head. Each row has the
 * file badge, the name, the source (Client in amber, SBC), the date and the size, and a download
 * button. The list is `GET /api/documents?engagementId=…`, which scopes by role through
 * `listDocuments`; download signs the file through `/api/documents/:id/signed-url`.
 */
export function useRecordDocuments(engagementId: string) {
  return useQuery({
    queryKey: ['documents', 'engagement', engagementId],
    queryFn: async (): Promise<DocumentDto[]> => {
      const res = await fetch(`/api/documents?engagementId=${encodeURIComponent(engagementId)}`);
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; documents?: DocumentDto[] };
      if (!res.ok || !out.ok) throw new Error('Could not load the documents');
      return out.documents ?? [];
    },
    staleTime: 60_000,
  });
}

function sizeOf(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function download(doc: DocumentDto) {
  try {
    const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}/signed-url`);
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
    if (!res.ok || !out.url) throw new Error('Could not open the file');
    window.open(out.url, '_blank', 'noopener');
  } catch (err) {
    toastError('Could not download', errorMessage(err));
  }
}

export function RecordDocumentsPanel({ engagement, vaultHref }: { engagement: Engagement; vaultHref: string }) {
  const docs = useRecordDocuments(engagement.id);
  const list = docs.data ?? [];

  return (
    <section className="surface min-w-0 overflow-hidden" aria-label="Documents">
      <div className="flex min-h-[52px] min-w-0 items-center gap-2.5 border-b border-line-soft px-4 py-2 md:px-5">
        <CardHeadTile title="Documents" />
        <h2 className="whitespace-nowrap text-[15px] font-medium text-ink">Documents</h2>
        {docs.data ? <span className="truncate text-[13px] tabular-nums text-ink-muted">{list.length}</span> : null}
        <Link href={vaultHref} className="ml-auto shrink-0 text-[13px] font-medium text-brand-text hover:underline">
          Vault ›
        </Link>
      </div>
      {docs.isPending ? (
        <div className="p-4">
          <SkeletonRows rows={4} />
        </div>
      ) : docs.isError ? (
        <div className="p-4">
          <EmptyState title="Could not load the documents" />
        </div>
      ) : list.length === 0 ? (
        <div className="p-4">
          <EmptyState title="No documents yet" />
        </div>
      ) : (
        <div role="list">
          <div className="border-b border-line-soft bg-surface-sunken px-4 py-1.5 md:px-5 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">
            All
          </div>
          {list.map((doc) => {
            const fromClient = Boolean(engagement.clientUserId) && doc.uploadedBy === engagement.clientUserId;
            const size = sizeOf(doc.sizeBytes);
            return (
              <div key={doc.id} role="listitem" className="flex min-h-row items-center gap-3 border-b border-line-soft px-4 py-2 last:border-0 md:px-5">
                <FileBadge type={fileType(doc.fileName)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-ink" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">
                    <span className={cn('font-medium', fromClient ? 'text-warning' : 'text-ink-2')}>{fromClient ? 'Client' : 'SBC'}</span>
                    {' · '}
                    {shortDate(doc.createdAt.slice(0, 10))}
                    {size ? ` · ${size}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void download(doc)}
                  className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md border-1.5 border-line text-ink-2 hover:bg-surface-sunken hover:text-ink"
                  aria-label={`Download ${doc.fileName}`}
                  title="Download"
                >
                  <Download size={15} strokeWidth={1.6} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
