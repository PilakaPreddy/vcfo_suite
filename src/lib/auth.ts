/**
 * `partner` (3 Nov 2026, docs/specs/receivables/PLAN.md): a client's partner who reads their own
 * receivables at /receivables. Like `developer`, the guards refuse it everywhere except the
 * routes that ask for it (`requirePartner`), because many repositories predate it.
 */
export type Role = 'super_admin' | 'admin' | 'manager' | 'intern' | 'client' | 'developer' | 'partner';
export type DbRole = Role;

/** User-facing role labels. */
export const ROLE_UI_LABEL: Record<Role, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  manager: 'Manager',
  intern: 'Project lead',
  client: 'Client',
  developer: 'Developer',
  partner: 'Client partner',
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
  /** Same-origin `/api/account/avatar?v=…` when the user has a photo. */
  imageUrl?: string | null;
  clientId?: string;
  internId?: string;
}

/** DB role and app role are 1:1 after the four-role split. */
export function mapDbRoleToAppRole(dbRole: DbRole): Role {
  return dbRole;
}

const DB_ROLES: readonly DbRole[] = [
  'super_admin',
  'admin',
  'manager',
  'intern',
  'client',
  'developer',
  'partner',
];

export function isValidDbRole(role: string): role is DbRole {
  return (DB_ROLES as readonly string[]).includes(role);
}

export function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Firm-wide admins (super admin + firm admin). */
export function isFirmWideAdmin(role: Role | string | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}

/** Firm admin or project manager (shared create/approve surfaces). */
export function isAdminOrManager(role: Role | string | undefined): boolean {
  return isFirmWideAdmin(role) || role === 'manager';
}
