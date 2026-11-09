import type { Destination } from '@/data/ask/schema';
import { clientStepHref } from '@/lib/client/client-overview';
import {
  adminProjectPath,
  adminProjectStepPath,
  internEngagementPath,
  internEngagementStepPath,
  staffProjectBase,
} from '@/lib/projects/project-step-path';
import type { StaffPathBase } from '@/lib/projects/project-step-path';

export const LEAD_BASE = '/app/intern';
export const CLIENT_BASE = '/app/client';
/** A staff shell, the Project Lead's own one, which has different pages, or the client's. */
export type AskLinkBase = StaffPathBase | typeof LEAD_BASE | typeof CLIENT_BASE;

/** Query params a go-there link adds; the arrival handler strips them. */
export const ASK_FROM_PARAM = 'from';
export const ASK_FROM_VALUE = 'ask';
export const ASK_FOCUS_PARAM = 'focus';

function withArrival(path: string, focus?: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set(ASK_FROM_PARAM, ASK_FROM_VALUE);
  if (focus) params.set(ASK_FOCUS_PARAM, focus);
  return `${base}?${params.toString()}`;
}

type ListDest = Extract<Destination, { to: 'list' }>;

/** The list page that holds these rows, for this person. A lead has no Projects or Approvals of their own. */
function listPath(dest: ListDest, base: string, lead: boolean): string {
  switch (dest.list) {
    case 'projects':
    case 'approvals':
      if (lead) return `${LEAD_BASE}/clients`;
      return dest.list === 'approvals' ? `${base}/approvals` : `${base}/projects`;
    case 'filings':
      return `${base}/compliances/filings`;
    case 'obligations':
      return `${base}/compliances/obligations`;
    case 'requests':
      if (base === CLIENT_BASE) return `${CLIENT_BASE}/documents`;
      return lead ? `${LEAD_BASE}/requests` : `${base}/projects`;
    case 'tasks':
      if (lead) return `${LEAD_BASE}/tasks`;
      return base === '/app/manager' ? '/app/manager/work' : `${base}/projects`;
    case 'documents':
      return base === CLIENT_BASE ? `${CLIENT_BASE}/documents` : `${base}/vault`;
    case 'registrations':
      return `${base}/registrations`;
    case 'labour':
      return `${base}/labour-registers`;
    case 'people':
      return `${base}/people`;
    case 'updates':
      return `${base}/announcements`;
    case 'receivables':
      return '/receivables/manager';
  }
}

function listHref(dest: ListDest, base: string, lead: boolean): string {
  const params = new URLSearchParams();
  if (dest.status) params.set('status', dest.status);
  if (dest.view) params.set('view', dest.view);
  if (dest.company) params.set('company', dest.company);
  // The Filings page opens on two months; a count covers the year, so the list has to as well.
  if (dest.list === 'filings') params.set('cadence', 'annual');
  const query = params.toString();
  return withArrival(`${listPath(dest, base, lead)}${query ? `?${query}` : ''}`);
}

/**
 * URL for a destination, built only through the existing route helpers so
 * staff links follow the caller's own shell (never a hardcoded /app/manager).
 * Super admin has no project / approvals / mail pages of its own and uses the
 * firm admin ones, exactly as `staffProjectBase` already decides.
 */
export function resolveHref(dest: Destination, base: AskLinkBase): string {
  const lead = base === LEAD_BASE;
  const staffBase = lead || base === CLIENT_BASE ? '/app/manager' : base;
  const staff = lead ? LEAD_BASE : staffProjectBase(staffBase);
  switch (dest.to) {
    case 'list':
      return listHref(dest, base === CLIENT_BASE ? CLIENT_BASE : staff, lead);
    case 'incorporation':
      return withArrival('/app/client/incorporation', dest.focusStepId);
    case 'step':
      return withArrival(clientStepHref(dest.stepId), dest.section ?? dest.stepId);
    case 'inbox':
      // No client Inbox yet (Phase 0): Home carries the next action.
      return withArrival('/app/client/overview', dest.itemId);
    case 'compliances':
      return withArrival('/app/client/compliances/calendar', dest.itemId);
    case 'documents':
      return withArrival('/app/client/documents', dest.docId);
    case 'library':
      return dest.itemId ? `/app/client/library/${encodeURIComponent(dest.itemId)}` : '/app/client/library';
    case 'learn':
      return `/app/client/learn/${encodeURIComponent(dest.slug)}`;
    case 'project':
      return withArrival(askProjectPath(dest.engagementId, base));
    case 'projectStep': {
      const project = { slug: dest.engagementId, id: dest.engagementId };
      return withArrival(
        lead ? internEngagementStepPath(project, dest.stepId) : adminProjectStepPath(project, dest.stepId, staffBase),
        dest.stepId,
      );
    }
    case 'approvals':
      return withArrival(lead ? `${LEAD_BASE}/clients` : `${staff}/approvals`);
    case 'compliance':
      return withArrival(`${staff}/compliances/filings`, dest.filter);
    case 'composeReminder': {
      const subject = dest.subject || 'Reminder: action needed on your project';
      const body =
        dest.body || 'Hello,\n\nA quick reminder that a step on your project is waiting on you. Please complete it in the client portal when you can.\n\nThank you.';
      return `${staff}/mail?${new URLSearchParams({ subject, body })}`;
    }
  }
}

/** The project page for this person, by route key. */
export function askProjectPath(engagementId: string, base: AskLinkBase): string {
  const project = { slug: engagementId, id: engagementId };
  return base === LEAD_BASE || base === CLIENT_BASE ? internEngagementPath(project) : adminProjectPath(project, base);
}

/** The same URL without the arrival params (so a refresh does not re-pulse). */
export function stripAskParams(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(ASK_FROM_PARAM);
  params.delete(ASK_FOCUS_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
