import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { pageMetadata } from '@/lib/shell/page-metadata';
import { requireAuth } from '@/auth/guards';
import { roleHomePath } from '@/lib/auth-routes';
import { listMySheets } from '@/db/repositories/receivables';
import { ReceivablesManager } from '@/views/receivables/manager/ReceivablesManager';

export const metadata = pageMetadata('Receivables', 'Keep the client receivables sheet current');
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ sheet?: string }> };

const EDITORS = new Set(['super_admin', 'admin', 'manager']);

/**
 * /receivables/manager — the only signed-in part of receivables (docs/specs/receivables/PLAN.md).
 * The proxy sends a signed-out visitor to /login?next=/receivables/manager; this page checks the
 * role again and lists only the sheets the repository lets the caller edit.
 */
export default async function ReceivablesManagerPage({ searchParams }: Props) {
  const guard = await requireAuth();
  if (guard.ok === false) redirect('/login?next=/receivables/manager');
  const { ctx } = guard;
  const home = roleHomePath(ctx.role);

  if (!EDITORS.has(ctx.role)) return <Notice title="Receivables is for SBC's receivables manager" body="Your account does not have access to this page." home={home} />;

  const sheets = await listMySheets(ctx);
  if (!sheets.length) return <Notice title="No receivables sheet is assigned to you" body="Ask the developer to import the client's workbook with you as its manager." home={home} />;

  const q = await searchParams;
  const sheetId = sheets.find((s) => s.id === q.sheet)?.id ?? sheets[0].id;
  return (
    <Suspense>
      <ReceivablesManager sheets={sheets.map((s) => ({ id: s.id, name: s.name, clientOrgName: s.clientOrgName }))} sheetId={sheetId} userName={ctx.name} homeHref={home} />
    </Suspense>
  );
}

function Notice({ title, body, home }: { title: string; body: string; home: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-center text-ink">
      <h1 className="text-[20px] font-medium">{title}</h1>
      <p className="max-w-md text-[14px] text-ink-muted">{body}</p>
      <a href={home} className="text-[14px] font-medium text-brand-text hover:underline">
        Back to VCFO Suite
      </a>
    </main>
  );
}
