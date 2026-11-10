import Link from 'next/link';
import { DEMO_ACCOUNTS, DEMO_HINT, demoLoginsOn } from '@/components/auth/demo-accounts';
import { initialsOf } from '@/components/ui/avatar-stack';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Portals', 'Every VCFO Suite portal home in one list.');

const LINK = 'font-medium text-brand-text hover:underline';

/**
 * /portals (P-474, prototype `PortalsScreen.tsx`): every portal home in one list, with the demo
 * login that opens it and its path. It lists the seeded demo logins, so it shows only when
 * `NEXT_PUBLIC_DEMO_LOGINS` is "on"; otherwise it says demo portals are not set up. A row goes to
 * the portal home; signed out, the proxy sends it to the sign-in card first.
 */
export default function PortalsPage() {
  const on = demoLoginsOn();
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[720px] content-center gap-6 bg-surface px-4 py-10 text-ink">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-[13px] font-semibold text-on-brand" aria-hidden>
          V
        </span>
        <h1 className="text-[22px] font-medium">VCFO Suite</h1>
        {on ? <span className="ml-auto font-mono text-[12px] text-ink-muted">{DEMO_HINT}</span> : null}
      </div>

      {on ? (
        <div className="overflow-hidden rounded-md border-1.5 border-line bg-surface-raised">
          {DEMO_ACCOUNTS.map((p, i) => (
            <Link
              key={p.label}
              href={p.home}
              className={`flex h-14 min-w-0 items-center gap-3 px-4 hover:bg-surface-sunken ${i ? 'border-t border-line-soft' : ''}`}
            >
              <span
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-full bg-brand-soft text-[12px] font-medium text-brand-text"
                aria-hidden
              >
                {initialsOf(p.label)}
              </span>
              <span className="truncate text-[14px] font-medium">{p.title}</span>
              <span className="truncate text-[13px] text-ink-muted">{p.email}</span>
              <span className="ml-auto hidden font-mono text-[12px] text-ink-faint sm:inline">{p.home}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-md border-fine px-4 py-8 text-center">
          <p className="text-[14px] font-medium">Demo portals are not set up</p>
          <p className="mt-1 text-[13px] text-ink-muted">Sign in to open your own portal.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
        <Link href="/" className={LINK}>
          Landing page
        </Link>
        <Link href="/login" className={LINK}>
          Sign in
        </Link>
      </div>
    </main>
  );
}
