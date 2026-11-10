import { getItem } from '@/data/checklist';
import type { Role } from '@/lib/auth';
import { roleHomePath } from '@/lib/auth-routes';
import { adminProjectPath, adminProjectStepPath, internEngagementPath, internEngagementStepPath } from '@/lib/projects/project-step-path';

/**
 * Where "Fix in Suite" in the VCFO Assist side panel lands: the engagement's checklist step page in
 * the shell the signed-in role can open. The extension does not know the role, so it opens
 * `GET /api/assist/step-link/[id]?step=` and Suite redirects here.
 *
 *   project lead (intern)   /app/intern/engagements/{slug}/step/{stepSlug}
 *   manager                 /app/manager/projects/{slug}/step/{stepSlug}
 *   admin and super admin   /app/admin/projects/{slug}/step/{stepSlug}   (super has no project routes)
 *
 * An unknown step id opens the engagement's own page instead; any other role goes home.
 */
export function assistStepPath(role: Role, project: { slug?: string | null; id: string }, stepId?: string | null): string {
  const target = { slug: project.slug ?? undefined, id: project.id };
  const step = stepId ? getItem(stepId) : undefined;
  if (role === 'intern') return step ? internEngagementStepPath(target, step.id) : internEngagementPath(target);
  if (role === 'manager' || role === 'admin' || role === 'super_admin') {
    const base = role === 'manager' ? 'manager' : 'admin';
    return step ? adminProjectStepPath(target, step.id, base) : adminProjectPath(target, base);
  }
  return roleHomePath(role);
}
