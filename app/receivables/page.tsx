import { Suspense } from 'react';
import { publicReceivablesMetadata } from '@/views/receivables/client/public-metadata';
import { PartnerPage } from '@/views/receivables/partner/PartnerPage';
import { partnerPageGuard } from './_partner-guard';

export const metadata = publicReceivablesMetadata;
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ invoice?: string | string[] }> };

/**
 * /receivables — the signed-in client partner's own invoices of the latest published version
 * (Phase 8 of docs/specs/receivables/PLAN.md). `?invoice=<id>` opens that invoice's details;
 * reminder emails link there, so a signed-out partner returns to the same invoice after login.
 */
export default async function ReceivablesPartnerPage({ searchParams }: Props) {
  const q = await searchParams;
  const invoice = typeof q.invoice === 'string' && /^[0-9a-f-]{36}$/i.test(q.invoice) ? q.invoice : null;
  await partnerPageGuard(invoice ? `/receivables?invoice=${invoice}` : '/receivables');
  return (
    <Suspense>
      <PartnerPage />
    </Suspense>
  );
}
