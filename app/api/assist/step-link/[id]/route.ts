import { NextResponse } from 'next/server';
import { assertEngagementAccess } from '@/db/repositories/engagements';
import { assistStaffGuard } from '@/lib/assist-agents/http';
import { assistStepPath } from '@/lib/assist-agents/step-link';
import { roleHomePath } from '@/lib/auth-routes';
import { appEngagementId } from '@/lib/projects/legacy-engagement-ids';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/assist/step-link/[id]?step=pre-4 — "Fix in Suite": a 302 to that engagement's checklist
 * step in the caller's own shell (`assistStepPath`). Signed out goes to the login page; an engagement out of reach goes to the role home, so ids cannot be probed. Staff only.
 */
export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin), 302);
  const guard = await assistStaffGuard();
  if (guard.ok === false) {
    if (guard.status === 401) return to('/login');
    // A client or developer: their own home, through the root redirect.
    return to('/');
  }
  const { id } = await context.params;
  const access = await assertEngagementAccess(guard.ctx, id);
  if (access.ok === false) return to(roleHomePath(guard.ctx.role));
  const project = { slug: access.row.slug, id: appEngagementId(access.row.id) };
  return to(assistStepPath(guard.ctx.role, project, url.searchParams.get('step')));
}
