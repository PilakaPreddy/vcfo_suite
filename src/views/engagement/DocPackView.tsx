'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { Check, Download } from 'lucide-react';

import { HexgridLoader } from '@/components/common/HexgridLoader';
import { DocPackPreviewDialog } from '@/components/doc-pack/DocPackPreviewDialog';
import { DocPackPreviewPanel } from '@/components/doc-pack/DocPackPreviewPanel';
import { DocPackRow } from '@/components/doc-pack/DocPackRow';
import { DOC_STATUS_TAG_TONE } from '@/components/doc-pack/DocStatusChip';
import { EmptyStateIllustrated } from '@/components/noir';
import { Button } from '@/components/ui/button';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Tag } from '@/components/ui/spectrum-chip';
import { PageTransition } from '@/components/shell/PageTransition';
import { SEO } from '@/components/SEO';
import { useApp } from '@/context/AppContext';
import { useDocPack } from '@/hooks/use-doc-pack';
import { useStaffBasePath } from '@/hooks/use-staff-base-path';
import {
  DOC_PACK_PART_PARAM,
  docPackItemUrl,
  docPackStepPath,
  docPackZipUrl,
  parseDocPart,
  type DocPackShell,
} from '@/lib/doc-pack/paths';
import type { DocPackItem, DocPart, DocStatus } from '@/lib/doc-pack/types';
import { cn } from '@/lib/utils';
import { isInternEngagementPathname } from '@/lib/projects/project-step-path';
import { engagementRouteParamFromParams, resolveEngagementFromRouteParam } from '@/lib/slug';

type PartFilter = 'all' | DocPart;

const PART_LABEL: Record<PartFilter, string> = {
  all: 'All',
  'part-a': 'SPICe+ Part A',
  'part-b': 'SPICe+ Part B',
};

const STAT_LABEL: Record<DocStatus, string> = {
  ready: 'ready',
  'needs-inputs': 'need inputs',
  'waiting-release': 'waiting for release',
};

/**
 * The one place that previews and downloads generated pre-incorporation
 * documents. Staff only; the API answers 403 to clients and the shells never
 * link here for them. Shared by the lead, manager and admin routes.
 *
 * VCFO Spectrum (prototype `DocumentPackScreen`): a plain head with the count tags and the zip
 * button, the part switch above the list, one card with a grey band per part, and the preview
 * card that is always open (380px from xl, under the list below xl).
 */
export default function DocPackView() {
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { engagements, engagementsSettled } = useApp();
  const staffBase = useStaffBasePath();

  const shell: DocPackShell = isInternEngagementPathname(pathname) ? 'intern' : staffBase;
  const engagementParam = engagementRouteParamFromParams(params as Record<string, string | string[] | undefined>);
  const eng = useMemo(
    () => resolveEngagementFromRouteParam(engagements, engagementParam),
    [engagements, engagementParam],
  );

  const [part, setPart] = useState<PartFilter>(
    () => parseDocPart(searchParams.get(DOC_PACK_PART_PARAM)) ?? 'all',
  );
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [largeItem, setLargeItem] = useState<DocPackItem | null>(null);
  const [zipped, setZipped] = useState(false);

  // The zip button says how many files went into the .zip for two seconds after a click.
  useEffect(() => {
    if (!zipped) return;
    const timer = window.setTimeout(() => setZipped(false), 2000);
    return () => window.clearTimeout(timer);
  }, [zipped]);

  const pack = useDocPack(eng?.id);

  if (!eng) {
    return (
      <PageTransition>
        {engagementsSettled ? (
          <EmptyStateIllustrated
            title="Project not found"
            description="This project is not in your list, or the link is out of date."
            art="empty"
          />
        ) : (
          <div className="flex justify-center py-16">
            <HexgridLoader size="sm" />
          </div>
        )}
      </PageTransition>
    );
  }

  const summary = pack.data;
  const items = summary?.items.filter((item) => part === 'all' || item.part === part) ?? [];
  const countFor = (filter: PartFilter) =>
    summary ? summary.items.filter((item) => filter === 'all' || item.part === filter).length : 0;
  const readyCount = summary?.counts.ready ?? 0;
  const parts = (['part-a', 'part-b'] as const)
    .filter((key) => part === 'all' || key === part)
    .map((key) => ({ key, items: items.filter((item) => item.part === key) }))
    .filter((group) => group.items.length > 0);
  // The picked row, else the first ready document, else the first document.
  const picked =
    summary?.items.find((item) => item.key === pickedKey) ??
    summary?.items.find((item) => item.status === 'ready') ??
    summary?.items[0] ??
    null;

  const hrefForStep = (stepId: string, tabId?: string) => docPackStepPath(eng, shell, stepId, tabId);
  const pickedStep = picked ? picked.missing[0]?.stepId ?? picked.sourceStepIds[0] ?? null : null;

  return (
    <PageTransition>
      <SEO
        title={`Document pack — ${eng.companyName}`}
        description="Readiness, preview and download of the SPICe+ document pack."
        path={pathname}
      />

      {/* Plain head (prototype `DocumentPackScreen`): 28px title, the company and the count tags,
          the one main button on the right. No back link (R-09). */}
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_260px]">
          <h1 className="text-[28px] font-medium leading-9 tracking-[-0.01em] text-ink">Document pack</h1>
          <p className="flex flex-wrap items-center gap-1.5 pt-1 text-[13.5px] text-ink-muted">
            {summary
              ? (['ready', 'needs-inputs', 'waiting-release'] as const).map((status) => (
                  <Tag key={status} tone={DOC_STATUS_TAG_TONE[status]}>
                    {summary.counts[status]} {STAT_LABEL[status]}
                  </Tag>
                ))
              : null}
          </p>
        </div>
        {summary ? (
          readyCount > 0 ? (
            <Button asChild>
              <a href={docPackZipUrl(eng.id)} download onClick={() => setZipped(true)} aria-live="polite">
                {zipped ? <Check strokeWidth={1.6} aria-hidden /> : <Download strokeWidth={1.6} aria-hidden />}
                {zipped ? `${readyCount} ${readyCount === 1 ? 'file' : 'files'} in the .zip` : `Download ready (${readyCount}) as .zip`}
              </a>
            </Button>
          ) : (
            <Button type="button" disabled title="Nothing is ready to download yet">
              <Download strokeWidth={1.6} aria-hidden />
              Download ready (0) as .zip
            </Button>
          )
        ) : null}
      </header>

      {pack.isError ? (
        <EmptyStateIllustrated
          title="Could not load the document pack"
          description={pack.error instanceof Error ? pack.error.message : 'The readiness check failed.'}
          actionLabel="Try again"
          onAction={() => void pack.refetch()}
          art="waiting"
        />
      ) : !summary ? (
        <section className="surface min-w-0 overflow-hidden p-4" aria-busy="true" aria-live="polite" aria-label="Document pack">
          <SkeletonRows rows={6} />
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SpectrumTabs
              label="Filter by part"
              items={(['all', 'part-a', 'part-b'] as const).map((filter) => ({
                key: filter,
                label: PART_LABEL[filter],
                count: countFor(filter),
              }))}
              value={part}
              onChange={(k) => setPart(k as PartFilter)}
            />
            {summary.skippedDirectors.length > 0 ? (
              <Link
                href={hrefForStep('pre-15')}
                title={summary.skippedDirectors[0]?.reason}
                className="text-[13px] font-medium text-brand-text hover:underline"
              >
                Not in the pack yet: {summary.skippedDirectors.map((d) => d.displayName).join(', ')} →
              </Link>
            ) : null}
          </div>

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="surface min-w-0 overflow-hidden" aria-label="Document pack">
              {parts.length === 0 ? (
                <EmptyState title="No documents in this part" className="m-4" />
              ) : (
                parts.map((group, index) => {
                  const done = group.items.filter((item) => item.status === 'ready').length;
                  const pct = group.items.length > 0 ? (done / group.items.length) * 100 : 0;
                  return (
                    <div key={group.key}>
                      <div
                        className={cn(
                          'flex items-center gap-2.5 bg-surface-sunken px-4 py-2.5 md:px-5',
                          index > 0 && 'border-t-1.5 border-line',
                        )}
                      >
                        <b className="text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-2">{PART_LABEL[group.key]}</b>
                        <span
                          className="relative block h-2 max-w-[160px] flex-1 overflow-hidden rounded-bar bg-surface-raised"
                          role="img"
                          aria-label={`${done} of ${group.items.length} ready`}
                        >
                          {done > 0 ? <i className="absolute inset-y-0 left-0 rounded-bar bg-positive-mid" style={{ width: `${pct}%` }} /> : null}
                        </span>
                        <span className="text-[12.5px] tabular-nums text-ink-muted">
                          {done} of {group.items.length}
                        </span>
                      </div>
                      <ul className="list-none">
                        {group.items.map((item) => (
                          <DocPackRow
                            key={item.key}
                            item={item}
                            picked={picked?.key === item.key}
                            downloadUrl={docPackItemUrl(eng.id, item.key)}
                            onPreview={(next) => setPickedKey(next.key)}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
            </section>

            <DocPackPreviewPanel
              className="xl:sticky xl:top-[var(--shell-sticky-top)]"
              item={picked}
              previewUrl={picked ? docPackItemUrl(eng.id, picked.key, true) : null}
              downloadUrl={picked ? docPackItemUrl(eng.id, picked.key) : null}
              stepHref={pickedStep ? hrefForStep(pickedStep) : null}
              onExpand={picked ? () => setLargeItem(picked) : undefined}
            />
          </div>
        </>
      )}

      <DocPackPreviewDialog
        item={largeItem}
        previewUrl={largeItem ? docPackItemUrl(eng.id, largeItem.key, true) : null}
        onClose={() => setLargeItem(null)}
      />
    </PageTransition>
  );
}
