import { pageMetadata } from '@/lib/shell/page-metadata';
import { SetPasswordPage } from '@/components/client-portal/pages/team/SetPasswordPage';

export const metadata = pageMetadata('Set your password', 'Choose a password for your receivables login');

/**
 * Phase 8: a client partner opens the link from the invite or reset email
 * (`/receivables/set-password?token=…`) and chooses a password, then signs in at
 * `/receivables/login`. The page is public; the token is the authority.
 */
export default async function ReceivablesSetPassword({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === 'string' ? raw : '';
  return (
    <SetPasswordPage
      token={token}
      apiPath="/api/public/receivables/set-password"
      loginPath="/receivables/login"
      invalidText="This link was used already or has expired. Ask your SBC contact to send a new one."
    />
  );
}
