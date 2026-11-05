import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/auth/guards';
import { listMySheets, sheetStatement } from '@/db/repositories/receivables';
import { roleHomePath } from '@/lib/auth-routes';
import { pageMetadata } from '@/lib/shell/page-metadata';
import { todayIst } from '@/lib/receivables/dates';
import { parseStatementQuery } from '@/lib/receivables/statement';
import { StatementView } from '@/views/receivables/StatementView';

export const metadata = pageMetadata('Statement of account', 'A client statement from the receivables sheet');
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const EDITORS = new Set(['super_admin', 'admin', 'manager']);

/**
 * /receivables/manager/statement?sheet=&client=&from=&to= — a statement of account (Phase 10)
 * from the sheet's live invoices. Guarded like /receivables/manager/print: signed out goes to the
 * login, other roles go home, and the sheet must be one the repository lets the caller edit.
 */
export default async function ManagerStatementPage({ searchParams }: Props) {
  const raw = await searchParams;
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const guard = await requireAuth();
  if (guard.ok === false) redirect(`/login?next=${encodeURIComponent('/receivables/manager/statement')}`);
  const { ctx } = guard;
  if (!EDITORS.has(ctx.role)) redirect(roleHomePath(ctx.role));

  const sheets = await listMySheets(ctx);
  const sheet = sheets.find((s) => s.id === str('sheet')) ?? (str('sheet') ? null : sheets[0]);
  if (!sheet) return <Notice text="This sheet is not assigned to you." />;

  const today = todayIst();
  const q = new URLSearchParams();
  for (const k of ['client', 'from', 'to']) if (str(k)) q.set(k, str(k));
  const parsed = parseStatementQuery(q, today);
  const query = parsed.ok ? parsed.query : { client: str('client') || null, ...defaultPeriod(today) };
  const { clientOrgName, statement } = await sheetStatement(ctx, sheet.id, query);
  return (
    <StatementView
      statement={statement}
      clientOrgName={clientOrgName}
      basePath="/receivables/manager/statement"
      keep={{ sheet: sheet.id }}
      xlsxPath={`/api/receivables/sheets/${sheet.id}/statement`}
      backHref={`/receivables/manager?sheet=${sheet.id}&tab=reports`}
      backLabel="Back to receivables"
      source="Live draft"
    />
  );
}

function defaultPeriod(today: string) {
  const p = parseStatementQuery(new URLSearchParams(), today);
  return p.ok ? { from: p.query.from, to: p.query.to } : { from: today, to: today };
}

function Notice({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-center text-ink">
      <p className="max-w-md text-[14px] text-ink-muted">{text}</p>
      <Link href="/receivables/manager" className="text-[14px] font-medium text-brand-text hover:underline">
        Back to receivables
      </Link>
    </main>
  );
}
