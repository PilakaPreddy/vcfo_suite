import { redirect } from 'next/navigation';
import { requireAuth } from '@/auth/guards';
import type { Role } from '@/lib/auth';

const SHELL: Partial<Record<Role, string>> = {
  super_admin: '/app/super/practice',
  admin: '/app/admin',
  manager: '/app/manager',
  intern: '/app/intern',
  client: '/app/client',
};

/** Bell rows and emails link here, because a message does not know its reader's role. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireAuth();
  if (!guard.ok) redirect('/login');
  const base = SHELL[guard.ctx.role as Role];
  redirect(base ? `${base}/budgets/${id}` : '/app');
}
