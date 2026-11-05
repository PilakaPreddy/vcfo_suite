'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SEO } from '@/components/SEO';
import { PageTransition } from '@/components/shell/PageTransition';
import { PageBackCluster } from '@/components/shell/PageBackButton';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { sep } from '@/lib/date-format';
import { TokenUseLink } from './TokenUseLink';

type SourceRow = {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  audience: string;
  status: 'processing' | 'ready' | 'failed' | 'archived';
  error: string | null;
  effectiveFrom: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
};

const TYPE_LABEL: Record<string, string> = { govt: 'Government', firm_pdf: 'Firm document', firm_note: 'Firm note' };
const AUDIENCE_LABEL: Record<string, string> = { client: 'Clients', staff: 'Staff only', both: 'Clients and staff' };
const STATUS_TONE: Record<SourceRow['status'], ChipTone> = {
  processing: 'prog',
  ready: 'ok',
  failed: 'bad',
  archived: 'idle',
};
const STATUS_LABEL: Record<SourceRow['status'], string> = {
  processing: 'Indexing',
  ready: 'Ready',
  failed: 'Failed',
  archived: 'Archived',
};

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error || fallback);
  return body as T;
}

/** Native select in the Spectrum input look (1.5px edge, blurple focus). */
const select =
  'h-control-md w-full rounded-md border-1.5 border-line-strong bg-surface-raised px-3 text-[14px] text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring/25';
const label = 'mb-1 block text-[13px] font-medium text-ink';

/** "2026-10-01" or an ISO time as "1 Oct 2026" (R-28: dates stay in the UI font). */
function plainDate(value: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return sep(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
}

const T1_HEAD = 'h-9 border-b-1.5 border-line px-4 text-left text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted';

/**
 * Knowledge sources Ask VCFO retrieves from (Phase 7). Admin / super admin only. VCFO Spectrum: a
 * plain head, the add form in a section card and the sources as T1 rows (R-07).
 */
export default function AskSources() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<'file' | 'note'>('file');
  const list = useQuery({
    queryKey: ['ask', 'sources'],
    queryFn: async () => readJson<{ documents: SourceRow[] }>(await fetch('/api/ask/admin/documents'), 'Could not load sources'),
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.status === 'processing') ? 4000 : false),
  });
  const upload = useMutation({
    mutationFn: async (form: FormData) =>
      readJson(await fetch('/api/ask/admin/documents', { method: 'POST', body: form }), 'Could not save the source'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ask', 'sources'] }),
    onError: (err: Error) => setError(err.message),
  });
  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'retry' | 'archive' }) =>
      readJson(
        await fetch(`/api/ask/admin/documents/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }),
        'Could not update the source',
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ask', 'sources'] }),
    onError: (err: Error) => setError(err.message),
  });

  const docs = list.data?.documents ?? [];

  return (
    <PageTransition>
      <SEO title="Ask VCFO sources" description="Knowledge sources for Ask VCFO" path="/app/admin/ask-vcfo/sources" />
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <PageBackCluster className="min-w-0 flex-[1_1_240px]">
            <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Ask VCFO sources</h1>
          </PageBackCluster>
          <Link href="/app/admin/ask-vcfo/gaps" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
            Question gaps
          </Link>
          <TokenUseLink />
        </div>

        <section aria-labelledby="src-add-title" className="surface min-w-0 overflow-hidden">
          <header className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-4 py-2">
            <CardHeadTile title="Add a document" />
            <h2 id="src-add-title" className="text-[15px] font-medium text-ink">
              Add a source
            </h2>
            <span className="truncate text-[13px] text-ink-muted">Staff-only sources never reach client answers</span>
          </header>
          <form
            className="grid gap-3 p-4 md:grid-cols-2 md:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const form = new FormData(e.currentTarget);
              upload.mutate(form, { onSuccess: () => (e.target as HTMLFormElement).reset() });
            }}
          >
            <div className="md:col-span-2">
              <label htmlFor="src-title" className={label}>
                Title
              </label>
              <Input id="src-title" name="title" required maxLength={200} />
            </div>
            <div>
              <label htmlFor="src-type" className={label}>
                Source type
              </label>
              <select id="src-type" name="sourceType" className={select} defaultValue="firm_pdf">
                <option value="govt">Government</option>
                <option value="firm_pdf">Firm document</option>
                <option value="firm_note">Firm note</option>
              </select>
            </div>
            <div>
              <label htmlFor="src-audience" className={label}>
                Used in answers for
              </label>
              <select id="src-audience" name="audience" className={select} defaultValue="staff">
                <option value="staff">Staff only</option>
                <option value="both">Clients and staff</option>
                <option value="client">Clients</option>
              </select>
            </div>
            <div>
              <label htmlFor="src-url" className={label}>
                Source link (optional)
              </label>
              <Input id="src-url" name="sourceUrl" type="url" placeholder="https://" />
            </div>
            <div>
              <label htmlFor="src-date" className={label}>
                Effective from (optional)
              </label>
              <Input id="src-date" name="effectiveFrom" type="date" />
            </div>
            <fieldset className="md:col-span-2">
              <legend className={label}>Content</legend>
              <SpectrumTabs
                label="Content"
                size="md"
                items={[
                  { key: 'file', label: 'Upload a file' },
                  { key: 'note', label: 'Write a note' },
                ]}
                value={kind}
                onChange={(k) => setKind(k as 'file' | 'note')}
              />
              {kind === 'file' ? (
                <input
                  aria-label="File (PDF, DOCX, TXT or MD)"
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  required
                  className="mt-2 block w-full rounded-md border-dash-fine px-3 py-3 text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
                />
              ) : (
                <Textarea aria-label="Note" name="note" required rows={6} className="mt-2" />
              )}
            </fieldset>
            <div className="flex items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? 'Uploading…' : 'Add source'}
              </Button>
              {error && (
                <p role="alert" className="text-[13px] text-danger">
                  {error}
                </p>
              )}
            </div>
          </form>
        </section>

        <section aria-label="Sources" className="surface min-w-0 overflow-hidden">
          <header className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-4 py-2">
            <CardHeadTile title="Library" />
            <h2 className="text-[15px] font-medium text-ink">Sources</h2>
            {list.data ? <span className="text-[13px] tabular-nums text-ink-muted">{docs.length}</span> : null}
          </header>
          {list.isLoading && <SkeletonRows rows={4} className="p-4" />}
          {list.isError && (
            <p role="alert" className="m-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              Could not load sources.
            </p>
          )}
          {list.data && docs.length === 0 && <EmptyState title="No sources yet" className="m-4" />}
          {docs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[14px]">
                <thead>
                  <tr>
                    <th scope="col" className={T1_HEAD}>Source</th>
                    <th scope="col" className={T1_HEAD}>Status</th>
                    <th scope="col" className={T1_HEAD}>Effective from</th>
                    <th scope="col" className={T1_HEAD}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b border-line-soft last:border-b-0 hover:bg-surface-sunken/60">
                      <td className="min-w-0 px-4 py-2.5">
                        <p className="truncate font-medium text-ink">
                          {doc.sourceUrl ? (
                            <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-brand-text hover:underline">
                              {doc.title}
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            doc.title
                          )}
                        </p>
                        <p className="text-[12.5px] text-ink-muted">
                          {TYPE_LABEL[doc.sourceType] ?? doc.sourceType} · {AUDIENCE_LABEL[doc.audience] ?? doc.audience}
                        </p>
                        {doc.error && <p className="text-[12.5px] text-danger">{doc.error}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Chip tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Chip>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2">
                        {doc.effectiveFrom ? plainDate(doc.effectiveFrom) : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {doc.status !== 'archived' && (
                          <div className="flex justify-end gap-1.5">
                            {(doc.status === 'failed' || doc.status === 'ready') && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={act.isPending}
                                onClick={() => act.mutate({ id: doc.id, action: 'retry' })}
                              >
                                {doc.status === 'failed' ? 'Retry' : 'Re-index'}
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="quiet"
                              size="sm"
                              disabled={act.isPending}
                              onClick={() => act.mutate({ id: doc.id, action: 'archive' })}
                            >
                              Archive
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
