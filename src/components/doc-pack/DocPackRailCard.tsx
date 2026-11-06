'use client';

import Link from 'next/link';

import { DashSection } from '@/components/dash/DashSection';
import { Tag } from '@/components/ui/spectrum-chip';
import type { DocPackSummary } from '@/lib/doc-pack/types';

export type DocPackRailCardProps = {
  summary: DocPackSummary | undefined;
  loading: boolean;
  error: boolean;
  packHref: string;
  className?: string;
};

/**
 * Status and a link, under the journey rail on SPICe+ Part A / B steps (prototype `StepView`
 * documents card): three tags and "Open document pack". Never a download: the pack page is the
 * only place that serves files.
 */
export function DocPackRailCard({ summary, loading, error, packHref, className }: DocPackRailCardProps) {
  return (
    <DashSection title="Pre-incorporation documents" className={className} bodyClassName="px-4 py-3 md:px-4">
      {error ? (
        <p className="text-[12.5px] text-ink-muted">Readiness could not be loaded.</p>
      ) : !summary ? (
        <p className="text-[12.5px] text-ink-muted" aria-busy={loading}>
          Checking readiness…
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Tag tone="ok">{summary.counts.ready} ready</Tag>
          <Tag tone="warn">{summary.counts['needs-inputs']} need inputs</Tag>
          <Tag tone="idle">{summary.counts['waiting-release']} waiting</Tag>
        </div>
      )}
      <Link href={packHref} className="mt-3 inline-block text-[13px] font-medium text-brand-text hover:underline">
        Open document pack →
      </Link>
    </DashSection>
  );
}
