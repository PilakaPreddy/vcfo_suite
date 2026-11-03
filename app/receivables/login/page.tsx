import { pageMetadata } from '@/lib/shell/page-metadata';
import { SignInScreen } from '@/components/auth/SignInScreen';

export const metadata = pageMetadata('Client partner sign in', 'Sign in to your SBC receivables');

/**
 * /receivables/login — the client partner login (docs/specs/receivables/PLAN.md, Phase 8). It is the
 * staff sign-in form and Auth.js flow with the receivables heading. The proxy sends a signed-out
 * visitor of /receivables here with `?next=`, and a partner who is already signed in on to that page.
 * After sign-in a partner goes to `next` when it is a partner page, and to /receivables otherwise.
 */
export default function ReceivablesLoginPage() {
  return <SignInScreen variant="partner" />;
}
