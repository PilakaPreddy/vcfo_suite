'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

/**
 * The header strip of the signed-in client partner's pages: the brand, the client organisation,
 * the partner's name, the links between the sheet and the account page, and Log out.
 */
export function PartnerHeader({ clientOrgName, partnerName, current }: { clientOrgName?: string; partnerName?: string; current: 'sheet' | 'account' }) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4 print:hidden">
      <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
      <span className="min-w-0 text-[13px] text-ink-muted">/ Receivables{clientOrgName ? ` · ${clientOrgName}` : ''}</span>
      <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        {partnerName ? <span className="font-medium">{partnerName}</span> : null}
        {current === 'sheet' ? (
          <Link href="/receivables/account" className="text-ink-2 underline-offset-4 hover:underline">
            My account
          </Link>
        ) : (
          <Link href="/receivables" className="text-ink-2 underline-offset-4 hover:underline">
            My invoices
          </Link>
        )}
        <Button size="sm" variant="quiet" onClick={() => void signOut({ callbackUrl: '/receivables/login' })}>
          Log out
        </Button>
      </div>
    </header>
  );
}
