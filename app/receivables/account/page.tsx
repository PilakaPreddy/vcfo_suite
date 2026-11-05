import { pageMetadata } from '@/lib/shell/page-metadata';
import { publicReceivablesMetadata } from '@/views/receivables/client/public-metadata';
import { AccountPage } from '@/views/receivables/partner/AccountPage';
import { partnerPageGuard } from '../_partner-guard';

export const metadata = { ...publicReceivablesMetadata, ...pageMetadata('My account', 'Your receivables login') };
export const dynamic = 'force-dynamic';

/** /receivables/account — the client partner's name, email, update emails, password and Log out. */
export default async function ReceivablesAccountPage() {
  await partnerPageGuard('/receivables/account');
  return <AccountPage />;
}
