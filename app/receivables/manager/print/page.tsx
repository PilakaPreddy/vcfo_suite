import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageMetadata } from '@/lib/shell/page-metadata';
import { requireAuth } from '@/auth/guards';
import { roleHomePath } from '@/lib/auth-routes';
import { todayIst } from '@/lib/receivables/dates';
import { getVersion, listMySheets } from '@/db/repositories/receivables';
import { PrintView } from '@/views/receivables/manager/PrintView';

export const metadata = pageMetadata('Receivables print', 'The published receivables sheet, ready to print');
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ sheet?: string }> };

const EDITORS = new Set(['super_admin', 'admin', 'manager']);

/**
 * /receivables/manager/print?sheet=<id> — the published version of one sheet in a print layout
 * (the PDF tile of Share). Guarded like /receivables/manager: signed out goes to the login, other
 * roles go home, and the sheet must be one the repository lets the caller edit.
 */
export default async function ReceivablesPrintPage({ searchParams }: Props) {
  const q = await searchParams;
  const next = `/receivables/manager/print${q.sheet ? `?sheet=${encodeURIComponent(q.sheet)}` : ''}`;
  const guard = await requireAuth();
  if (guard.ok === false) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { ctx } = guard;
  if (!EDITORS.has(ctx.role)) redirect(roleHomePath(ctx.role));

  const sheets = await listMySheets(ctx);
  const sheet = sheets.find((s) => s.id === q.sheet) ?? (q.sheet ? null : sheets[0]);
  if (!sheet) return <Notice text="This sheet is not assigned to you." />;
  if (!sheet.publishedVersionId) return <Notice text="Nothing is published yet. Click Update on the sheet first." />;
  const version = await getVersion(ctx, sheet.publishedVersionId);
  return <PrintView clientOrgName={sheet.clientOrgName} publishedAt={version.publishedAt.toISOString()} publishedByName={version.publishedByName} rows={version.snapshot} today={todayIst()} />;
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
