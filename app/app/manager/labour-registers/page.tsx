import { notFound } from 'next/navigation';

import { requireAuth } from '@/auth/guards';
import { listEngagements } from '@/db/repositories/engagements';
import { listBatches } from '@/db/repositories/labour-registers';
import { BatchPage } from '@/views/labour-registers/BatchPage';
import { LabourRegistersPage } from '@/views/labour-registers/LabourRegistersPage';
import { loadBatchView } from '@/views/labour-registers/load-batch';
import { loadMappingView } from '@/views/labour-registers/load-mapping';
import { MappingPage } from '@/views/labour-registers/MappingPage';
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

    /* `?map=` opens the column reconciliation for one slot of that batch. */
    const slot = one('map');
    if (slot && ['paysheet', 'attendance', 'overtime', 'employees'].includes(slot)) {
      const mapping = await loadMappingView(guard.ctx, batchId, slot as 'paysheet');
      if (!mapping) notFound();
      return <MappingPage view={mapping} shellBase="/app/manager" />;
    }

    const view = await loadBatchView(guard.ctx, batchId);
    if (!view) notFound();
    return <BatchPage view={view} shellBase="/app/manager" />;
  }

  /* Opening a batch needs a client as well as a state, and this screen is state-first, so the
     clients this preparer can reach are listed here and chosen on the page. */
  const guard = await requireAuth();
  const all = guard.ok ? await listEngagements(guard.ctx) : [];
  const engagements = all.map((e) => ({ id: e.id, name: e.companyName }));

  /* Batches already opened, so last month is reachable without opening it again. */
  const byId = new Map(all.map((e) => [e.id, e.companyName]));
  const recent = guard.ok
    ? (await listBatches(guard.ctx)).slice(0, 6).map((b) => ({
        id: b.id,
        stateCode: b.stateCode,
        periodFrom: b.periodFrom,
        status: b.status,
        client: byId.get(b.engagementId) ?? 'Client',
      }))
    : [];

  return (
    <LabourRegistersPage
      shellBase="/app/manager"
      stateCode={one('state')}
      period={one('period')}
      canPrepare={true}
      engagements={engagements}
      recent={recent}
    />
  );
}
