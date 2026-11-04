'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

/**
 * The two answers of a shared receivables view that are not the view itself (Phase 10): the link
 * does not work (unknown, revoked or expired, told apart for nobody), or it is shared with
 * specific people and the signed-in account is not one of them, with a way to switch account.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="mx-auto max-w-[1180px] px-4 pb-12">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 py-4">
          <span className="text-[13px] font-bold tracking-[.06em]">VCFO SUITE</span>
          <span className="text-[13px] text-ink-muted">/ Receivables</span>
        </header>
        <div className="mx-auto mt-10 max-w-[520px] rounded-md border border-line bg-surface-raised px-5 py-8 text-center sm:mt-16 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

export function SharedLinkGone({ signedIn }: { signedIn: boolean }) {
  return (
    <Frame>
      <h1 className="text-[18px] font-semibold">This link does not work</h1>
      <p className="mt-2 text-[14px] text-ink-2">It may have expired or been turned off by SBC. Ask the person who shared it for a new link.</p>
      <Button variant="secondary" className="mt-5" asChild>
        <Link href={signedIn ? '/login' : '/receivables/login'}>{signedIn ? 'Go to VCFO Suite' : 'Go to sign in'}</Link>
      </Button>
    </Frame>
  );
}

export function SharedLinkForbidden({ email, token }: { email: string; token: string }) {
  const back = `/receivables/login?next=${encodeURIComponent(`/receivables/s/${token}`)}`;
  return (
    <Frame>
      <h1 className="text-[18px] font-semibold">This view is shared with specific people</h1>
      <p className="mt-2 text-[14px] text-ink-2">
        You are signed in as <span className="font-medium text-ink">{email || 'an account'}</span>, which is not on the list for this view. If you have another login, switch to it, or ask SBC to share the view with you.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={() => void signOut({ callbackUrl: back })}>Switch account</Button>
        <Button variant="secondary" onClick={() => void signOut({ callbackUrl: '/receivables/login' })}>
          Sign out
        </Button>
      </div>
    </Frame>
  );
}
