import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import { getSidebarFolds } from '@/db/repositories/sidebar-folds';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * GET /api/shell/sidebar — the staff sidebar's people folds: project leads with their open
 * tasks (manager), managers with their client count (admin, super admin), and "Your manager"
 * (project lead). `getSidebarFolds` scopes every read by the caller's `AuthContext`; a client
 * or developer gets empty lists.
 */
export async function GET() {
  const guard = await requireAuth();
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    const folds = await getSidebarFolds(guard.ctx);
    return NextResponse.json(folds, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    const message = publicErrorMessage(err, 'sidebar_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
