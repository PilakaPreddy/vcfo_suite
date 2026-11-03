import 'server-only';
import { redirect } from 'next/navigation';
import { requireAuth, requirePartner, type AuthContext } from '@/auth/guards';
import { roleHomePath } from '@/lib/auth-routes';

const STAFF = new Set(['super_admin', 'admin', 'manager']);

/**
 * The page guard of the client partner pages (/receivables, /receivables/account). Signed out
 * goes to the receivables login with `next` set to this page; SBC's receivables staff go to the
 * manager page; any other role goes to its own home. Only a signed-in partner gets through.
 */
export async function partnerPageGuard(next: string): Promise<AuthContext> {
  const guard = await requirePartner();
  if (guard.ok === true) return guard.ctx;
  if (guard.status === 401) redirect(`/receivables/login?next=${encodeURIComponent(next)}`);
  const other = await requireAuth();
  if (other.ok === false) redirect(`/receivables/login?next=${encodeURIComponent(next)}`);
  redirect(STAFF.has(other.ctx.role) ? '/receivables/manager' : roleHomePath(other.ctx.role));
}
