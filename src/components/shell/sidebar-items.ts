import type { ComponentType } from 'react';
import {
  Archive,
  BadgeCheck,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  Clock,
  Columns3,
  Database,
  FileBarChart,
  FolderClosed,
  FolderOpen,
  History as HistoryIcon,
  Inbox,
  Landmark,
  LayoutDashboard,
  Lock,
  Mail,
  Megaphone,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Text as TextIcon,
  TrendingUp,
  TriangleAlert,
  UserSquare2,
  Users,
  Wallet,
} from 'lucide-react';
import type { Role } from '@/lib/auth';
import { complianceLeaves, compliancesBasePath } from '@/components/shell/compliance-nav';
import { TONE } from '@/components/shell/nav-tones';
import type { SidebarNavLeaf } from '@/components/shell/SidebarNavGroup';

/**
 * STAFF SHELL NAV DEFINITIONS — the entries each role's sidebar draws, in order. Pure data, so
 * the order, labels, icons and hrefs can be tested without rendering the shell
 * (`sidebar-items.test.ts`). `RoleSidebar` adds the folds, counts and motion.
 */

export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

export interface NavItem {
  to: string;
  label: string;
  icon: NavIcon;
  badge?: number;
  /** Icon color when item is inactive — the "colorful nav" treatment. */
  iconTone?: string;
}

export interface NavGroupDef {
  id: string;
  label: string;
  icon: NavIcon;
  iconTone?: string;
  items: SidebarNavLeaf[];
}

export type NavSectionBreak = { kind: 'break'; id: string };

export type NavEntry = NavItem | NavGroupDef | NavSectionBreak;

/** Hairline before Analytics + Audit Log so they read as a quieter tools cluster. */
const NAV_TOOLS_BREAK: NavSectionBreak = { kind: 'break', id: 'tools' };

export function isNavSectionBreak(entry: NavEntry): entry is NavSectionBreak {
  return 'kind' in entry && entry.kind === 'break';
}

export function isNavGroup(entry: NavEntry): entry is NavGroupDef {
  return 'items' in entry;
}

function docsGroup(base: string, vaultIcon: NavIcon = FolderClosed): NavGroupDef {
  return {
    id: `docs:${base}`,
    label: 'Docs',
    icon: FolderOpen,
    iconTone: TONE.files,
    items: [
      { to: `${base}/vault`, label: 'Vault', icon: vaultIcon, iconTone: TONE.files },
      { to: `${base}/knowledge-bank`, label: 'Knowledge Bank', icon: BookOpen, iconTone: TONE.knowledge },
    ],
  };
}

/** Compliances → Obligations, Calendar and Filings, the same disclosure shape as Updates. */
function compliancesGroup(base: string, items: SidebarNavLeaf[] = complianceLeaves(base)): NavGroupDef {
  return {
    id: `compliances:${base}`,
    label: 'Compliances',
    icon: CalendarCheck,
    iconTone: TONE.calendar,
    items,
  };
}

function updatesGroup(base: string): NavGroupDef {
  return {
    id: `updates:${base}`,
    label: 'Updates',
    icon: Bell,
    iconTone: TONE.news,
    items: [
      { to: `${base}/announcements`, label: 'Announcements', icon: Megaphone, iconTone: TONE.news },
      { to: `${base}/notifications`, label: 'Notifications', icon: Bell, iconTone: TONE.work },
    ],
  };
}

/** The practice block's three labels, in order (R-51). */
export const PRACTICE_BLOCK_LABELS = ['Incorporation', 'Compliances', 'Registrations'] as const;

/**
 * R-51 (D-29): the practice block every practice role shares, in the client's order:
 * Incorporation (Landmark), Compliances (Obligations, Calendar, Filings), Registrations
 * (BadgeCheck). `base` is the shell's own segment; Compliances keeps the shell's existing
 * compliance routes (`compliancesBasePath`). The super admin's block links to the Practice
 * pages instead: Obligations opens Practice · Compliances (`/app/super/practice/calendar` only
 * redirects there, so Calendar is left out), then Filings.
 */
export function practiceBlock(role: Role, base: string): NavEntry[] {
  if (role === 'super_admin') {
    const practice = '/app/super/practice';
    return [
      { to: `${practice}/incorporation`, label: 'Incorporation', icon: Landmark, iconTone: TONE.work },
      compliancesGroup(practice, [
        { ...complianceLeaves(practice)[0], to: `${practice}/compliances` },
        { ...complianceLeaves(practice)[2], to: `${practice}/filings` },
      ]),
      { to: `${practice}/registrations`, label: 'Registrations', icon: BadgeCheck, iconTone: TONE.work },
    ];
  }
  return [
    { to: `${base}/incorporation`, label: 'Incorporation', icon: Landmark, iconTone: TONE.work },
    compliancesGroup(compliancesBasePath(role, base)),
    { to: `${base}/registrations`, label: 'Registrations', icon: BadgeCheck, iconTone: TONE.work },
  ];
}


/**
 * R-51 sits three labels in the practice block, so Payroll is its own row directly after it
 * rather than a fourth label inside it. Labour registers used to hold this row; it now opens as
 * a tab inside Payroll (next to Salary updates and Payroll summary), and the old
 * `…/labour-registers` route still works for links already shared. Every role that does
 * practice work gets it, clients included: their page is read-only, which the page enforces.
 */
function payrollItem(base: string): NavItem {
  return { to: `${base}/payroll`, label: 'Payroll', icon: Wallet, iconTone: TONE.work };
}

/* Sidebars in priority order (K-15, rule R-32): daily work, the practice block (R-51), dated
   work, messages, documents, then reports and settings below the break. */
const firmAdminItems: NavEntry[] = [
  { to: '/app/admin/dashboard', label: 'Home', icon: LayoutDashboard, iconTone: TONE.home },
  { to: '/app/admin/projects', label: 'Projects', icon: Briefcase, iconTone: TONE.work },
  { to: '/app/admin/approvals', label: 'Approvals', icon: ClipboardCheck, iconTone: TONE.queue },
  { to: '/app/admin/people', label: 'People', icon: Users, iconTone: TONE.people },
  { to: '/app/admin/managers', label: 'Managers', icon: UserSquare2, iconTone: TONE.people },
  ...practiceBlock('admin', '/app/admin'),
  payrollItem('/app/admin'),
  updatesGroup('/app/admin'),
  { to: '/app/admin/mail', label: 'Email', icon: Mail, iconTone: TONE.work },
  docsGroup('/app/admin'),
  NAV_TOOLS_BREAK,
  { to: '/app/admin/analytics', label: 'Analytics', icon: BarChart3, iconTone: TONE.analytics },
  { to: '/app/admin/ask-vcfo/sources', label: 'Ask VCFO sources', icon: BookMarked, iconTone: TONE.knowledge },
  { to: '/app/admin/audit-log', label: 'Audit', icon: HistoryIcon, iconTone: TONE.audit },
  { to: '/app/admin/firm-settings', label: 'Firm settings', icon: Settings, iconTone: TONE.audit },
];

/* The client normally gets the client portal shell (`client-portal/Sidebar.tsx`); this list is
   the staff-shell fallback and keeps the same practice block order. */
const clientItems: NavEntry[] = [
  { to: '/app/client/overview', label: 'Home', icon: LayoutDashboard, iconTone: TONE.home },
  ...practiceBlock('client', '/app/client'),
  payrollItem('/app/client'),
  updatesGroup('/app/client'),
  { to: '/app/client/documents', label: 'Documents', icon: FolderClosed, iconTone: TONE.files },
  { to: '/app/client/library', label: 'Library', icon: BookMarked, iconTone: TONE.knowledge },
  { to: '/app/client/audit', label: 'Audit', icon: HistoryIcon, iconTone: TONE.audit },
  { to: '/app/client/team', label: 'Team', icon: Users, iconTone: TONE.people },
];

/* Super admin, in the prototype's order (K-45, R-51): Overview, Risks, Clients, the practice
   block, Team, Growth, Reports, then the firm-scope entries the super admin already had. */
const superAdminItems: NavEntry[] = [
  { to: '/app/super/dashboard', label: 'Overview', icon: LayoutDashboard, iconTone: TONE.home },
  { to: '/app/super/risks', label: 'Risks', icon: TriangleAlert, iconTone: TONE.queue },
  { to: '/app/super/projects', label: 'Clients', icon: Briefcase, iconTone: TONE.work },
  ...practiceBlock('super_admin', '/app/super'),
  payrollItem('/app/super/practice'),
  { to: '/app/super/team', label: 'Team', icon: Users, iconTone: TONE.people },
  { to: '/app/super/growth', label: 'Growth', icon: TrendingUp, iconTone: TONE.analytics },
  { to: '/app/super/reports', label: 'Reports', icon: FileBarChart, iconTone: TONE.analytics },
  { to: '/app/super/vault', label: 'Documents', icon: FolderOpen, iconTone: TONE.files },
  updatesGroup('/app/super'),
  NAV_TOOLS_BREAK,
  { to: '/app/admin/dashboard', label: 'Firm', icon: Building2, iconTone: TONE.work },
  { to: '/app/admin/people', label: 'People', icon: Users, iconTone: TONE.people },
  { to: '/app/admin/mail', label: 'Email', icon: Mail, iconTone: TONE.work },
  { to: '/app/admin/audit-log', label: 'Firm log', icon: HistoryIcon, iconTone: TONE.audit },
  { to: '/app/client/overview', label: 'Portal', icon: Inbox, iconTone: TONE.home },
  { to: '/app/client/audit', label: 'Client log', icon: ScrollText, iconTone: TONE.audit },
  { to: '/app/super/settings', label: 'Firm settings', icon: Settings, iconTone: TONE.audit },
  { to: '/app/dev/overview', label: 'Developer console', icon: Plug, iconTone: TONE.work },
];

/* Developer console (G-01), in the prototype's order. The super admin reaches it from a
   "Developer console" link; a developer sees only these items. No practice block (R-51). */
export const developerItems: NavEntry[] = [
  { to: '/app/dev/overview', label: 'Overview', icon: LayoutDashboard, iconTone: TONE.home },
  { to: '/app/dev/connections', label: 'Connections', icon: Plug, iconTone: TONE.work },
  { to: '/app/dev/jobs', label: 'Jobs', icon: Clock, iconTone: TONE.work },
  { to: '/app/dev/logs', label: 'Logs', icon: TextIcon, iconTone: TONE.work },
  { to: '/app/dev/messages', label: 'Messages', icon: Mail, iconTone: TONE.work },
  { to: '/app/dev/deploys', label: 'Deploys', icon: ShieldCheck, iconTone: TONE.work },
  { to: '/app/dev/access', label: 'Access', icon: Lock, iconTone: TONE.people },
  { to: '/app/dev/data', label: 'Data and costs', icon: Database, iconTone: TONE.analytics },
  { to: '/app/dev/audit', label: 'Audit', icon: HistoryIcon, iconTone: TONE.audit },
];

function managerItems(staffBase: string): NavEntry[] {
  return [
    { to: `${staffBase}/dashboard`, label: 'Home', icon: LayoutDashboard, iconTone: TONE.home },
    { to: `${staffBase}/work`, label: 'Work', icon: Columns3, iconTone: TONE.work },
    { to: `${staffBase}/projects`, label: 'Projects', icon: Briefcase, iconTone: TONE.work },
    { to: `${staffBase}/approvals`, label: 'Approvals', icon: ClipboardCheck, iconTone: TONE.queue },
    { to: `${staffBase}/people`, label: 'People', icon: Users, iconTone: TONE.people },
    { to: `${staffBase}/team`, label: 'Project leads', icon: UserSquare2, iconTone: TONE.people },
    ...practiceBlock('manager', staffBase),
    payrollItem(staffBase),
    updatesGroup(staffBase),
    { to: `${staffBase}/mail`, label: 'Email', icon: Mail, iconTone: TONE.work },
    docsGroup(staffBase),
    NAV_TOOLS_BREAK,
    { to: `${staffBase}/analytics`, label: 'Analytics', icon: BarChart3, iconTone: TONE.analytics },
    { to: `${staffBase}/audit-log`, label: 'Audit', icon: HistoryIcon, iconTone: TONE.audit },
  ];
}

/** Intern clients list — keep equal to `INTERN_CLIENTS_HREF` in InternClientsNav. */
const INTERN_CLIENTS = '/app/intern/clients';

/* R-51: the lead always sees Compliances; with no incorporated client the pages show
   "No incorporated clients yet" instead of sending the lead to Today. */
const internItems: NavEntry[] = [
  { to: '/app/intern/today', label: 'Today', icon: LayoutDashboard, iconTone: TONE.home },
  { to: '/app/intern/tasks', label: 'Work', icon: Columns3, iconTone: TONE.work },
  { to: INTERN_CLIENTS, label: 'Clients', icon: UserSquare2, iconTone: TONE.people },
  ...practiceBlock('intern', '/app/intern'),
  payrollItem('/app/intern'),
  updatesGroup('/app/intern'),
  { to: '/app/intern/mail', label: 'Email', icon: Mail, iconTone: TONE.work },
  docsGroup('/app/intern', Archive),
  NAV_TOOLS_BREAK,
  { to: '/app/intern/analytics', label: 'Analytics', icon: BarChart3, iconTone: TONE.analytics },
  { to: '/app/intern/audit-log', label: 'Audit', icon: HistoryIcon, iconTone: TONE.audit },
];

/**
 * The sidebar entries for a role. `staffBase` is the shell's own segment (the manager's
 * shell); `inDevConsole` is true while the super admin is inside `/app/dev`.
 */
export function sidebarItemsFor(role: Role, staffBase: string, inDevConsole = false): NavEntry[] {
  if (inDevConsole) return developerItems;
  switch (role) {
    case 'super_admin':
      return superAdminItems;
    case 'admin':
      return firmAdminItems;
    case 'manager':
      return managerItems(staffBase);
    case 'intern':
      return internItems;
    case 'developer':
      return developerItems;
    default:
      return clientItems;
  }
}
