import { partnerStatement } from '@/db/repositories/receivables';
import { pageMetadata } from '@/lib/shell/page-metadata';
import { todayIst } from '@/lib/receivables/dates';
import { parseStatementQuery } from '@/lib/receivables/statement';
import { publicReceivablesMetadata } from '@/views/receivables/client/public-metadata';
import { StatementView } from '@/views/receivables/StatementView';
import { PartnerHeader } from '@/views/receivables/partner/PartnerHeader';
import { partnerPageGuard } from '../_partner-guard';

export const metadata = { ...publicReceivablesMetadata, ...pageMetadata('Statement of account', 'Your receivables statement') };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * /receivables/statement?client=&from=&to= — the signed-in client partner's statement of account
 * (Phase 10), from their own rows of the latest published version. A bad date falls back to the
 * default period rather than an error page.
 */
export default async function PartnerStatementPage({ searchParams }: Props) {
  const ctx = await partnerPageGuard('/receivables/statement');
  const raw = await searchParams;
  const q = new URLSearchParams();
  for (const k of ['client', 'from', 'to']) if (typeof raw[k] === 'string') q.set(k, raw[k] as string);
  const today = todayIst();
  const parsed = parseStatementQuery(q, today);
  const fallback = parseStatementQuery(new URLSearchParams(), today);
  const query = parsed.ok ? parsed.query : { client: q.get('client') || null, from: fallback.ok ? fallback.query.from : today, to: today };
  const { clientOrgName, statement } = await partnerStatement(ctx, query);
  return (
    <StatementView
      statement={statement}
      clientOrgName={clientOrgName}
      basePath="/receivables/statement"
      xlsxPath="/api/receivables/partner/statement"
      backHref="/receivables"
      backLabel="My invoices"
      source="Published by SBC"
      header={<PartnerHeader clientOrgName={clientOrgName} partnerName={ctx.name} current="statement" />}
    />
  );
}
