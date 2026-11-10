import { adminProjectPath, adminProjectStepPath, internEngagementPath, internEngagementStepPath } from '@/lib/projects/project-step-path';

/**
 * Links for the client health notices, by the recipient's role. Leads open the intern shell;
 * managers the manager shell; admins and super admins the firm admin shell (super admins have no
 * project pages of their own). PURE.
 */

type ProjectTarget = { id: string; slug?: string | null };

const project = (p: ProjectTarget) => ({ id: p.id, slug: p.slug ?? p.id });

export function roleBase(role: string): '/app/intern' | '/app/manager' | '/app/admin' | '/app/super' {
  if (role === 'intern') return '/app/intern';
  if (role === 'manager') return '/app/manager';
  if (role === 'super_admin') return '/app/super';
  return '/app/admin';
}

export function projectHref(role: string, p: ProjectTarget): string {
  return role === 'intern' ? internEngagementPath(project(p)) : adminProjectPath(project(p), role === 'manager' ? 'manager' : 'admin');
}

export function stepHref(role: string, p: ProjectTarget, stepId: string): string {
  return role === 'intern' ? internEngagementStepPath(project(p), stepId) : adminProjectStepPath(project(p), stepId, role === 'manager' ? 'manager' : 'admin');
}

/** The compose screen with a reminder ready for a person to send; nothing goes out on its own. */
export function nudgeClientHref(role: string, companyName: string, itemTitle: string): string {
  const base = role === 'super_admin' ? '/app/admin' : roleBase(role);
  const subject = `Reminder: ${itemTitle}`;
  const body = `Hello,\n\nA quick reminder that "${itemTitle}" for ${companyName} is waiting on you. Please complete it in the client portal when you can.\n\nThank you.`;
  return `${base}/mail?${new URLSearchParams({ subject, body })}`;
}

/** The client health board for the role (the page shells under app/app/<role>/client-health). */
export function healthBoardHref(role: string): string {
  return `${roleBase(role)}/client-health`;
}
