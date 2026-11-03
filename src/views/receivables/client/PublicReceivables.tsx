import { Suspense } from 'react';
import { systemPublicSheet } from '@/db/repositories/receivables';
import { todayIst } from '@/lib/receivables/dates';
import { ClientPage } from './ClientPage';

/**
 * Server half of the client page. It reads the published snapshot by key (or, on the plain
 * /receivables URL, the one sheet whose key is turned off) and hands it to the client view.
 * Its metadata (no indexing, no Referer) is in public-metadata.ts.
 */

export async function PublicReceivables({ publicKey }: { publicKey: string | null }) {
  const sheet = await systemPublicSheet({ key: publicKey });
  if (!sheet) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-center text-ink">
        <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
        <h1 className="text-[20px] font-medium">{publicKey ? 'This link does not work' : 'Use the link SBC sent you'}</h1>
        <p className="max-w-md text-[14px] text-ink-muted">
          {publicKey ? 'It may be old or replaced by a newer one. Ask SBC for the current receivables link.' : 'The receivables page opens from the link in the email or message from SBC.'}
        </p>
      </main>
    );
  }
  const exportHref = `/api/public/receivables/export?${publicKey ? `k=${encodeURIComponent(publicKey)}` : ''}`;
  return (
    <Suspense>
      <ClientPage
        clientOrgName={sheet.clientOrgName}
        publishedAt={sheet.publishedAt.toISOString()}
        rows={sheet.rows}
        partners={sheet.partners}
        today={todayIst()}
        exportHref={exportHref}
        storageKey={`vcfo-receivables-partner:${publicKey ?? 'open'}`}
      />
    </Suspense>
  );
}
