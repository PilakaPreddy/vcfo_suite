'use client';

import Link from 'next/link';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DEMO_ACCOUNTS, DEMO_HINT, demoLoginsOn } from './demo-accounts';

export interface LoginFormCardProps {
  email: string;
  password: string;
  showPassword: boolean;
  error: string | null;
  loading: boolean;
  forgotOpen: boolean;
  forgotEmail: string;
  forgotLoading: boolean;
  profileError: string | null;
  resetNotice: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onForgotOpenChange: (open: boolean) => void;
  onForgotEmailChange: (value: string) => void;
  onForgotSubmit: (e: React.FormEvent) => void;
  onOpenForgot: () => void;
  /** Sits at the right of the logo row, for example the theme toggle. */
  headerAction?: React.ReactNode;
  /** Where "Book a demo" goes for people without an account, when no dialog opener is given. */
  demoHref?: string;
  /** Opens the Book a demo dialog. When set, "Book a demo" is a button, not a link. */
  onBookDemo?: () => void;
  /** Shows the demo account buttons. Defaults to the `NEXT_PUBLIC_DEMO_LOGINS` flag. */
  showDemoAccounts?: boolean;
  /** Two-step sign-in (G-25): `code` swaps the password form for the code form. */
  step?: 'password' | 'code';
  code?: string;
  onCodeChange?: (value: string) => void;
  onCodeSubmit?: (e: React.FormEvent) => void;
  onBackToPassword?: () => void;
  /** Starts the Microsoft sign-in; the button shows only when this is set (the provider is configured). */
  onMicrosoft?: () => void;
  /** The heading of the password step. Defaults to "Sign in to your workspace". */
  title?: string;
  /** The line under the heading on the password step. */
  subtitle?: string;
  /** Replaces the default foot (forgot password and Book a demo), for example on the partner login. */
  foot?: React.ReactNode;
}

/** Plain words for the `?error=microsoft_*` codes the Auth.js `signIn` callback sends back. */
export const MICROSOFT_ERRORS: Record<string, string> = {
  microsoft_no_profile: 'No VCFO Suite account uses this Microsoft email. Ask your firm admin to add you.',
  microsoft_not_allowed: 'This account cannot sign in with Microsoft. Use your email and password.',
  microsoft_linked_elsewhere: 'Your VCFO Suite account is linked to a different Microsoft account.',
  microsoft_two_step_on: 'Your account uses a two-step code. Sign in with your email, password and code.',
};

/** The four-square Microsoft mark (brand colours are the mark itself, so they stay literal). */
function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="0" y="0" width="7.5" height="7.5" fill="#F25022" />
      <rect x="8.5" y="0" width="7.5" height="7.5" fill="#7FBA00" />
      <rect x="0" y="8.5" width="7.5" height="7.5" fill="#00A4EF" />
      <rect x="8.5" y="8.5" width="7.5" height="7.5" fill="#FFB900" />
    </svg>
  );
}

/* The peak band along the bottom of the card, as in the prototype's sign-in card. */
const CARD_PEAKS = 'polygon(0 66%, 12% 44%, 24% 61%, 38% 33%, 52% 56%, 67% 29%, 81% 53%, 100% 38%, 100% 100%, 0 100%)';

function Notice({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'error' | 'success' | 'info';
}) {
  /* Soft ground and a text-safe colour; the words carry the state. */
  const styles = {
    error: 'bg-danger-soft text-danger',
    success: 'bg-positive-soft text-positive',
    info: 'bg-surface-sunken text-ink-muted',
  };
  return (
    <p
      className={cn('rounded-md px-3 py-2.5 text-[13px] leading-relaxed', styles[variant])}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

/**
 * The sign-in card in the VCFO Spectrum look (prototype `SignInScreen.tsx`, C-0112): the logo row,
 * "Sign in to your workspace", work email and password, the main button and a short foot.
 * The form, its ids (`#email`, `#password`) and the forgot-password dialog are the real ones.
 */
export function LoginFormCard({
  email,
  password,
  showPassword,
  error,
  loading,
  forgotOpen,
  forgotEmail,
  forgotLoading,
  profileError,
  resetNotice,
  onEmailChange,
  onPasswordChange,
  onToggleShowPassword,
  onSubmit,
  onForgotOpenChange,
  onForgotEmailChange,
  onForgotSubmit,
  onOpenForgot,
  headerAction,
  demoHref = '/contact',
  onBookDemo,
  showDemoAccounts = demoLoginsOn(),
  step = 'password',
  code = '',
  onCodeChange,
  onCodeSubmit,
  onBackToPassword,
  onMicrosoft,
  title = 'Sign in to your workspace',
  subtitle = 'Use the account your firm created for you.',
  foot,
}: LoginFormCardProps) {
  const codeDigits = code.replace(/[\s-]/g, '');
  const footLink =
    'rounded-sm font-semibold text-brand-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring';
  /* A demo button fills the work email only; the password field takes the focus next. */
  const pickDemo = (address: string) => {
    onEmailChange(address);
    document.getElementById('password')?.focus();
  };
  return (
    <div className="relative z-[1] w-full max-w-[420px] overflow-hidden rounded-[14px] border border-line bg-surface-raised px-[18px] py-[22px] text-ink shadow-dialog sm:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[90px] bg-brand-text opacity-[.07]"
        style={{ clipPath: CARD_PEAKS }}
      />
      <div className="relative z-[1] grid gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2.5">
            <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-highlight-bright text-[14px] font-bold text-on-brand">
              V
            </span>
            <span>
              <b className="text-[16px] font-semibold">VCFO Suite</b>{' '}
              <small className="text-[12px] text-ink-muted">by SBC</small>
            </span>
          </span>
          {headerAction}
        </div>

        <h1 id="sign-in-title" className="mt-1.5 text-[22px] font-semibold tracking-[-0.01em]">
          {step === 'code' ? 'Enter your code' : title}
        </h1>
        <p className="-mt-1.5 mb-1 text-[14px] text-ink-muted">
          {step === 'code'
            ? `Open your authenticator app for ${email}.`
            : subtitle}
        </p>

        {profileError === 'no_profile' && (
          <Notice variant="error">No profile is linked to this account. Ask your firm admin to complete setup.</Notice>
        )}
        {profileError && MICROSOFT_ERRORS[profileError] ? <Notice variant="error">{MICROSOFT_ERRORS[profileError]}</Notice> : null}
        {resetNotice === 'check-email' && (
          <Notice variant="info">Check your email for a password reset link, then sign in here.</Notice>
        )}
        {resetNotice === 'success' && <Notice variant="success">Password updated. Sign in with your new password.</Notice>}

        {step === 'code' ? (
          <form onSubmit={onCodeSubmit} className="grid gap-3.5" aria-labelledby="sign-in-title">
            <div className="grid gap-1.5">
              <Label htmlFor="otp" className="text-[13px] font-medium text-ink-2">
                Code from the app
              </Label>
              <Input
                id="otp"
                value={code}
                onChange={(e) => onCodeChange?.(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="font-mono text-[16px] tracking-[0.3em]"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the code field when this step opens
                autoFocus
                required
              />
            </div>

            {error && (
              <p className="-mt-1 text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="h-10 w-full" disabled={codeDigits.length !== 6 || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                  Checking
                </>
              ) : (
                'Verify'
              )}
            </Button>
            <Button type="button" variant="quiet" className="h-9 w-full" onClick={onBackToPassword} disabled={loading}>
              Use another account
            </Button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3.5" aria-labelledby="sign-in-title">
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-[13px] font-medium text-ink-2">
                Work email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- deliberate: focuses the first field when this form opens
                autoFocus
                autoComplete="username"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium text-ink-2">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  className="pr-11"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={onToggleShowPassword}
                  className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted transition-colors hover:bg-ink/[.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.6} /> : <Eye className="h-4 w-4" strokeWidth={1.6} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="-mt-1 text-[13px] text-danger" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="h-10 w-full dark:border dark:border-brand-line" disabled={!email || !password || loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                  Signing in
                </>
              ) : (
                'Sign in'
              )}
            </Button>
            {onMicrosoft ? (
              <Button type="button" variant="secondary" className="h-10 w-full" onClick={onMicrosoft} disabled={loading}>
                <MicrosoftMark />
                Sign in with Microsoft
              </Button>
            ) : null}
          </form>
        )}

        {showDemoAccounts && step === 'password' ? (
          <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
            <span className="col-span-full text-[12px] text-ink-muted">Demo accounts</span>
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.label}
                type="button"
                variant="outline"
                size="sm"
                className="w-full min-w-0"
                title={a.email}
                onClick={() => pickDemo(a.email)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}

        {foot ?? (
          <p className="text-[13px] leading-relaxed text-ink-muted">
            <button
              type="button"
              onClick={onOpenForgot}
              className={footLink}
            >
              Forgot your password?
            </button>{' '}
            Ask your firm&apos;s admin to reset it.
            <br />
            No account yet?{' '}
            {onBookDemo ? (
              <button type="button" onClick={onBookDemo} className={footLink} aria-haspopup="dialog">
                Book a demo
              </button>
            ) : (
              <Link href={demoHref} className={footLink}>
                Book a demo
              </Link>
            )}
          </p>
        )}
        {/* P-470: the same demo hint as the top bar, under the form on phones. */}
        {showDemoAccounts ? <p className="font-mono text-[12px] text-ink-muted sm:hidden">{DEMO_HINT}</p> : null}
      </div>

      <Dialog open={forgotOpen} onOpenChange={onForgotOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Need a new password?</DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              Email reset links are not enabled on this pilot. Ask your firm manager for a temporary password, then
              change it from Account settings after you sign in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onForgotSubmit} className="mt-2 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="forgot-email" className="text-[13px] font-medium text-ink-2">
                Your account email
              </Label>
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => onForgotEmailChange(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={!forgotEmail.trim() || forgotLoading}>
              {forgotLoading ? (
                <>
                  <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden />
                  Opening help
                </>
              ) : (
                'Back to sign in'
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
