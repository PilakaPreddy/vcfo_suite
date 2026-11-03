import { notFound } from 'next/navigation';

import { requireAuth } from '@/auth/guards';
import { BatchPage } from '@/views/labour-registers/BatchPage';
import { ClientRegistersPage } from '@/views/labour-registers/ClientRegistersPage';
import { loadBatchView } from '@/views/labour-registers/load-batch';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Labour registers', 'Statutory labour registers, state by state');

/**
 * Route shell only. `?state=` and `?period=` carry the choice across a refresh, and `?batch=`
 * opens one batch.
 *
 * The client gets `ClientRegistersPage`, not the staff picker with its buttons hidden: the
 * question a client opens this page with is "where do I employ people, and can I have last
 * month's file", which is a different screen. The staff view is the one that picks a
 * jurisdiction to prepare.
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

  return <ClientRegistersPage shellBase="/app/client" stateCode={one('state')} period={one('period')} />;
}
