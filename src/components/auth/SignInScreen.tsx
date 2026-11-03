'use client';

import { Suspense, useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { LoginFormCard } from '@/components/auth/LoginFormCard';
import { useSignIn } from '@/components/auth/use-sign-in';
import { DEMO_HINT, demoLoginsOn } from '@/components/auth/demo-accounts';
import { BookDemoDialog } from '@/components/marketing/BookDemoDialog';

/**
 * The sign-in page in the VCFO Spectrum look (prototype `SignInScreen.tsx`, C-0112): the sidebar navy with
 * a band of peaks, "Back to site" at the top, and one card in the middle. Signing in is the real Auth.js flow
 * from `use-sign-in.ts`. The demo account buttons show only when `NEXT_PUBLIC_DEMO_LOGINS` is "on", and
 * they fill the email only. "Book a demo" opens the same Book a demo dialog as the landing.
 *
 * The Suspense fallback renders the real form (not null): on LAN or slow JS, a null fallback leaves an empty page.
 *
 * `variant="partner"` is the client partner login at `/receivables/login` (docs/specs/receivables/PLAN.md,
 * Phase 8): the same form and Auth.js flow with the receivables heading, no demo accounts, no Microsoft
 * button and no Book a demo, and `/receivables` as the destination when the page has no `?next=`.
 */
export type SignInVariant = 'staff' | 'partner';

type SignInPageProps = { resetNotice: string | null; profileError: string | null; variant: SignInVariant };

export function SignInScreen({ variant = 'staff' }: { variant?: SignInVariant }) {
  return (
    <Suspense fallback={<SignInPage resetNotice={null} profileError={null} variant={variant} />}>
      <SignInWithSearchParams variant={variant} />
    </Suspense>
  );
}

function SignInWithSearchParams({ variant }: { variant: SignInVariant }) {
  const searchParams = useSearchParams();
  return (
    <SignInPage resetNotice={searchParams.get('reset')} profileError={searchParams.get('error')} variant={variant} />
  );
}

const PARTNER_FOOT = (
  <p className="text-[13px] leading-relaxed text-ink-muted">
    Forgot your password, or never set one? Ask your SBC receivables contact to send you a new link.
  </p>
);

function SignInPage({ resetNotice, profileError, variant }: SignInPageProps) {
  const partner = variant === 'partner';
  const form = useSignIn(partner ? { defaultNext: '/receivables' } : {});
  const { state } = form;
  const [demoOpen, setDemoOpen] = useState(false);
  // S-650: "Sign in with Microsoft" only when the server lists the provider (its env vars are set).
  // A client partner cannot sign in with Microsoft, so the partner login never asks.
  const [microsoftOn, setMicrosoftOn] = useState(false);
  useEffect(() => {
    if (partner) return;
    let live = true;
    getProviders()
      .then((p) => live && setMicrosoftOn(Boolean(p && 'microsoft-entra-id' in p)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [partner]);

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-side px-4 pb-[120px] pt-16 text-side-ink">
      {partner ? (
        <SEO
          title="Client partner sign in | SBC receivables"
          description="Sign in to see your open SBC invoices, promise a payment date and download your statement."
          path="/receivables/login"
        />
      ) : (
        <SEO
          title="Sign in | VCFO Suite"
          description="Sign in to VCFO Suite for engagements, filings, and client collaboration."
          path="/login"
        />
      )}

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46vh] w-full"
        viewBox="0 0 1440 360"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          className="fill-side-muted opacity-[.18]"
          d="M0 200 L120 150 L240 190 L384 110 L528 170 L672 96 L816 160 L960 120 L1104 176 L1248 104 L1440 150 L1440 360 L0 360Z"
        />
        <path
          className="fill-highlight-bright opacity-[.07]"
          d="M0 250 L168 206 L312 240 L480 196 L624 232 L792 188 L960 226 L1128 180 L1296 220 L1440 196 L1440 360 L0 360Z"
        />
        <path
          className="fill-side-hover"
          d="M0 300 L192 262 L360 290 L552 252 L720 284 L912 246 L1080 278 L1272 250 L1440 276 L1440 360 L0 360Z"
        />
      </svg>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 px-4 py-3 text-[13.5px] sm:px-6 sm:py-4">
        <Link
          href="/"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/[.22] pl-2 pr-3 font-semibold text-white transition-colors hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          Back to site
        </Link>
        {/* P-454: the mono hint, only in demo mode (seeded logins and sample firms). Hidden on phones. */}
        {!partner && demoLoginsOn() ? <span className="hidden font-mono text-[12px] text-side-muted sm:inline">{DEMO_HINT}</span> : null}
      </div>

      <LoginFormCard
        email={state.email}
        password={state.password}
        showPassword={state.showPassword}
        error={state.error}
        loading={state.loading}
        forgotOpen={state.forgotOpen}
        forgotEmail={state.forgotEmail}
        forgotLoading={state.forgotLoading}
        profileError={profileError}
        resetNotice={resetNotice}
        onEmailChange={form.setEmail}
        onPasswordChange={form.setPassword}
        onToggleShowPassword={form.toggleShowPassword}
        onSubmit={form.submit}
        onForgotOpenChange={form.setForgotOpen}
        onForgotEmailChange={form.setForgotEmail}
        onForgotSubmit={form.submitForgotPassword}
        onOpenForgot={form.openForgot}
        headerAction={<ThemeToggle />}
        {...(partner
          ? {
              title: 'SBC receivables — client partner sign in',
              subtitle: 'Use the email address SBC invited you with.',
              foot: PARTNER_FOOT,
              showDemoAccounts: false,
            }
          : {})}
        demoHref="/contact"
        onBookDemo={() => setDemoOpen(true)}
        step={state.step}
        code={state.code}
        onCodeChange={form.setCode}
        onCodeSubmit={form.submitCode}
        onBackToPassword={form.backToPassword}
        onMicrosoft={
          microsoftOn && !partner ? () => void signIn('microsoft-entra-id', { callbackUrl: '/login' }) : undefined
        }
      />
      {partner ? null : <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />}
    </div>
  );
}
