'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The header strip of the signed-in client partner's pages: the brand, the client organisation,
 * the links between the invoices, the statement and the account page, the partner's name and
 * Log out. On a phone the links move to a second line.
 */

const LINKS = [
  { key: 'sheet', href: '/receivables', label: 'My invoices' },
  { key: 'statement', href: '/receivables/statement', label: 'Statement' },
  { key: 'account', href: '/receivables/account', label: 'My account' },
] as const;

export function PartnerHeader({ clientOrgName, partnerName, current }: { clientOrgName?: string; partnerName?: string; current: 'sheet' | 'account' | 'statement' }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-navy text-[11px] font-bold tracking-[.04em] text-on-navy" aria-hidden>
          SBC
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold leading-4 text-ink">Receivables</span>
          <span className="block truncate text-[12px] text-ink-muted">{clientOrgName || 'VCFO Suite'}</span>
        </span>
      </div>
      <nav aria-label="Receivables" className="order-3 flex w-full items-center gap-1 sm:order-none sm:ml-4 sm:w-auto">
        {LINKS.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            aria-current={current === l.key ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors',
              current === l.key ? 'bg-brand-soft text-brand-text' : 'text-ink-2 hover:bg-ink/[.06] hover:text-ink',
            )}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 text-[13px]">
        {partnerName ? <span className="hidden font-medium text-ink-2 sm:inline">{partnerName}</span> : null}
        <Button size="sm" variant="secondary" onClick={() => void signOut({ callbackUrl: '/receivables/login' })}>
          Log out
        </Button>
      </div>
    </header>
  );
}
