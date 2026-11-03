import { notFound } from 'next/navigation';

import { requireAuth } from '@/auth/guards';
import { BatchPage } from '@/views/labour-registers/BatchPage';
import { LabourRegistersPage } from '@/views/labour-registers/LabourRegistersPage';
import { loadBatchView } from '@/views/labour-registers/load-batch';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Labour registers', 'Statutory labour registers, state by state');

/**
 * Route shell only. `?state=` and `?period=` carry the picker's choice across a refresh, and
 * `?batch=` opens one batch: its provenance, its close and its registers.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);

  const batchId = one('batch');
  if (batchId) {
    const guard = await requireAuth();
    if (!guard.ok) notFound();
    const view = await loadBatchView(guard.ctx, batchId);
    if (!view) notFound();
    return <BatchPage view={view} shellBase="/app/client" />;
  }

  return (
    <LabourRegistersPage
      shellBase="/app/client"
      stateCode={one('state')}
      period={one('period')}
      canPrepare={false}
    />
  );
}
