import { CalendarDays, CalendarClock, FileSpreadsheet, FileWarning, Hourglass, ListChecks } from 'lucide-react';
import { TONE } from '@/components/shell/nav-tones';
import type { SidebarNavLeaf } from '@/components/shell/SidebarNavGroup';

/**
 * COMPLIANCES NAV — the one place that knows where each shell's
 * Compliances → Obligations / Calendar / Filings pages live.
 *
 * Every role has the same three children under `{base}/compliances/`. The base
 * is the shell's own segment for client, intern, admin and manager; the
 * super admin has no compliance routes of its own and, like its Firm / People
 * / Email entries, jumps into the firm scope at `/app/admin`.
 */
export function compliancesBasePath(role: string | undefined, staffBase: string): string {
  if (role === 'client') return '/app/client';
  if (role === 'intern') return '/app/intern';
  if (role === 'admin' || role === 'super_admin') return '/app/admin';
  return staffBase;
}

export function complianceCalendarPath(role: string | undefined, staffBase: string): string {
  return `${compliancesBasePath(role, staffBase)}/compliances/calendar`;
}

/** The leaves of the Compliances disclosure, in nav order (R-33: Obligations, Calendar, Filings). */
export function complianceLeaves(base: string): SidebarNavLeaf[] {
  return [
    { to: `${base}/compliances/obligations`, label: 'Obligations', icon: ListChecks, iconTone: TONE.work },
    { to: `${base}/compliances/calendar`, label: 'Calendar', icon: CalendarDays, iconTone: TONE.calendar },
    { to: `${base}/compliances/filings`, label: 'Filings', icon: FileSpreadsheet, iconTone: TONE.files },
  ];
}

/**
 * The staff-only leaves after the shared three: Expiries (registrations and KYC that lapse),
 * Notices (the notice desk) and Events (company events that start an MCA filing). Clients do not
 * get these pages.
 */
export function staffComplianceLeaves(base: string): SidebarNavLeaf[] {
  return [
    { to: `${base}/compliances/expiries`, label: 'Expiries', icon: Hourglass, iconTone: TONE.calendar },
    { to: `${base}/compliances/notices`, label: 'Notices', icon: FileWarning, iconTone: TONE.queue },
    { to: `${base}/compliances/events`, label: 'Company events', icon: CalendarClock, iconTone: TONE.work },
  ];
}
