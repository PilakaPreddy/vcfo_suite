import { z } from 'zod';

/**
 * FIRM SETTINGS — pure shapes, defaults, input schema and the change list (G-02).
 *
 * The store is the one-row `firm_settings` table (`src/db/schema-firm.ts`). This module has no
 * `db`, `server-only` or React import, so the repository, the route and the screen share it and
 * every rule here is unit-tested.
 */

export interface FirmHoliday {
  /** YYYY-MM-DD. */
  date: string;
  label: string;
}

/** Service targets (P-238). Each is a whole number, or null when the firm has not set it. */
export interface ServiceTargets {
  /** Days from start to the certificate of incorporation. */
  daysToCoi: number | null;
  /** Days before the due date that statutory returns should be filed. */
  fileDaysAhead: number | null;
  /** Working hours within which a client gets a reply. */
  replyHours: number | null;
  /** Days a step may sit stuck before it goes to the admin. */
  escalateAfterDays: number | null;
  /** Day of the month the partner report goes out (1 to 28). */
  partnerReportDay: number | null;
}

export const SERVICE_TARGET_KEYS = ['daysToCoi', 'fileDaysAhead', 'replyHours', 'escalateAfterDays', 'partnerReportDay'] as const;
export type ServiceTargetKey = (typeof SERVICE_TARGET_KEYS)[number];

export const SERVICE_TARGET_LABEL: Record<ServiceTargetKey, string> = {
  daysToCoi: 'Days to certificate (COI)',
  fileDaysAhead: 'File statutory returns before the due date',
  replyHours: 'Reply to a client',
  escalateAfterDays: 'Escalate a stuck step to the admin',
  partnerReportDay: 'Monthly partner report',
};

/** The unit word shown beside each target's input. */
export const SERVICE_TARGET_UNIT: Record<ServiceTargetKey, string> = {
  daysToCoi: 'days',
  fileDaysAhead: 'days ahead',
  replyHours: 'working hours',
  escalateAfterDays: 'days',
  partnerReportDay: 'day of the month',
};

const SERVICE_TARGET_MAX: Record<ServiceTargetKey, number> = {
  daysToCoi: 365,
  fileDaysAhead: 60,
  replyHours: 240,
  escalateAfterDays: 60,
  partnerReportDay: 28,
};

const EMPTY_SERVICE_TARGETS: ServiceTargets = {
  daysToCoi: null,
  fileDaysAhead: null,
  replyHours: null,
  escalateAfterDays: null,
  partnerReportDay: null,
};

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

/** One target in plain words: "30 days", "2 days ahead", "Within 4 working hours", "After 3 days", "1st of the month". */
export function serviceTargetText(key: ServiceTargetKey, value: number | null): string | null {
  if (value === null) return null;
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  switch (key) {
    case 'daysToCoi':
      return days(value);
    case 'fileDaysAhead':
      return value === 0 ? 'On the due date' : `${days(value)} ahead`;
    case 'replyHours':
      return `Within ${value} working ${value === 1 ? 'hour' : 'hours'}`;
    case 'escalateAfterDays':
      return `After ${days(value)}`;
    case 'partnerReportDay':
      return `${ordinal(value)} of the month`;
  }
}

/** Keep only known keys with whole numbers in range; anything else reads as not set. */
export function readServiceTargets(raw: unknown): ServiceTargets {
  const out: ServiceTargets = { ...EMPTY_SERVICE_TARGETS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of SERVICE_TARGET_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    const min = key === 'partnerReportDay' ? 1 : 0;
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= SERVICE_TARGET_MAX[key]) out[key] = v;
  }
  return out;
}

/**
 * Role permissions (P-236): what each staff role may do. The super admin row is fixed (all on)
 * and is not stored. Clients and the developer role are outside the grid.
 */
export const PERMISSION_ROLES = ['admin', 'manager', 'intern'] as const;
export type PermissionRole = (typeof PERMISSION_ROLES)[number];
export const PERMISSIONS = ['view', 'edit', 'approve'] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type RolePermissions = Record<PermissionRole, Record<Permission, boolean>>;

export const PERMISSION_ROLE_LABEL: Record<PermissionRole | 'super_admin', string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  manager: 'Manager',
  intern: 'Project lead',
};

/** What the code allows today: admins and managers approve, project leads do not. */
export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  admin: { view: true, edit: true, approve: true },
  manager: { view: true, edit: true, approve: true },
  intern: { view: true, edit: true, approve: false },
};

/** The stored grid over the defaults; unknown roles and keys are dropped. */
export function readRolePermissions(raw: unknown): RolePermissions {
  const out = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS)) as RolePermissions;
  if (!raw || typeof raw !== 'object') return out;
  for (const role of PERMISSION_ROLES) {
    const row = (raw as Record<string, unknown>)[role];
    if (!row || typeof row !== 'object') continue;
    for (const perm of PERMISSIONS) {
      const v = (row as Record<string, unknown>)[perm];
      if (typeof v === 'boolean') out[role][perm] = v;
    }
  }
  return out;
}

/** True when the role may do this. The super admin always may; clients and developers never edit or approve. */
export function roleCan(perms: RolePermissions, role: string, perm: Permission): boolean {
  if (role === 'super_admin') return true;
  if ((PERMISSION_ROLES as readonly string[]).includes(role)) return perms[role as PermissionRole][perm];
  return perm === 'view';
}

export interface FirmSettings {
  firmName: string | null;
  /** True when a logo has been uploaded; the bytes stream from `/api/firm-settings/logo`. */
  hasLogo: boolean;
  /** ISO weekday numbers, 1 = Monday to 7 = Sunday, ascending. */
  workingDays: number[];
  /** Sorted by date, one per date. */
  holidays: FirmHoliday[];
  /** Days before a due date when the default reminders go out, largest first. */
  reminderDays: number[];
  timezone: string;
  supportEmail: string | null;
  supportPhone: string | null;
  address: string | null;
  serviceTargets: ServiceTargets;
  rolePermissions: RolePermissions;
  updatedAt: string | null;
  updatedByName: string | null;
}

export const FIRM_SETTINGS_DEFAULTS: FirmSettings = {
  firmName: null,
  hasLogo: false,
  workingDays: [1, 2, 3, 4, 5, 6],
  holidays: [],
  reminderDays: [7, 3, 1],
  timezone: 'Asia/Kolkata',
  supportEmail: null,
  supportPhone: null,
  address: null,
  serviceTargets: EMPTY_SERVICE_TARGETS,
  rolePermissions: DEFAULT_ROLE_PERMISSIONS,
  updatedAt: null,
  updatedByName: null,
};

/** The fields a person may change through PATCH. The logo has its own route. */
export type FirmSettingsField =
  | 'firmName'
  | 'workingDays'
  | 'holidays'
  | 'reminderDays'
  | 'timezone'
  | 'supportEmail'
  | 'supportPhone'
  | 'address'
  | 'serviceTargets'
  | 'rolePermissions';

const FIRM_SETTINGS_FIELD_LABEL: Record<FirmSettingsField | 'logo', string> = {
  firmName: 'Firm name',
  logo: 'Logo',
  workingDays: 'Working days',
  holidays: 'Holidays',
  reminderDays: 'Default reminders',
  timezone: 'Timezone',
  supportEmail: 'Support email',
  supportPhone: 'Phone',
  address: 'Address',
  serviceTargets: 'Service targets',
  rolePermissions: 'Roles and permissions',
};

/** The longest reminder lead the screen offers; a filing a quarter away needs no nudge yet. */
export const MAX_REMINDER_DAYS = 60;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(value: string): boolean {
  if (!YMD.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** True when the runtime knows this IANA zone name. */
function isKnownTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Empty text means "clear it". */
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((v) => (v === null || v === '' ? null : v));

const targetNumber = (min: number, max: number) => z.union([z.number().int().min(min).max(max), z.null()]);
const permissionRow = z.object({ view: z.boolean(), edit: z.boolean(), approve: z.boolean() }).strict();

export const firmSettingsPatchSchema = z
  .object({
    firmName: optionalText(160),
    workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    holidays: z
      .array(
        z.object({
          date: z.string().refine(isRealDay, 'Holiday dates are YYYY-MM-DD'),
          label: z.string().trim().min(1, 'Name each holiday').max(80),
        }),
      )
      .max(120),
    reminderDays: z.array(z.number().int().min(0).max(MAX_REMINDER_DAYS)).max(6),
    timezone: z.string().trim().min(1).max(64).refine(isKnownTimezone, 'Unknown timezone'),
    supportEmail: z
      .union([z.string().trim().max(200), z.null()])
      .transform((v) => (v === null || v === '' ? null : v))
      .refine((v) => v === null || z.string().email().safeParse(v).success, 'Enter a valid email'),
    supportPhone: optionalText(40),
    address: optionalText(500),
    serviceTargets: z
      .object({
        daysToCoi: targetNumber(0, SERVICE_TARGET_MAX.daysToCoi),
        fileDaysAhead: targetNumber(0, SERVICE_TARGET_MAX.fileDaysAhead),
        replyHours: targetNumber(0, SERVICE_TARGET_MAX.replyHours),
        escalateAfterDays: targetNumber(0, SERVICE_TARGET_MAX.escalateAfterDays),
        partnerReportDay: targetNumber(1, SERVICE_TARGET_MAX.partnerReportDay),
      })
      .strict(),
    rolePermissions: z
      .object({ admin: permissionRow, manager: permissionRow, intern: permissionRow })
      .strict(),
  })
  .partial()
  .strict();

export type FirmSettingsPatch = z.infer<typeof firmSettingsPatchSchema>;

/** One value per field in a stable order, so equal settings compare equal. */
export function normalizePatch(patch: FirmSettingsPatch): FirmSettingsPatch {
  const out: FirmSettingsPatch = { ...patch };
  if (patch.workingDays) out.workingDays = [...new Set(patch.workingDays)].sort((a, b) => a - b);
  if (patch.reminderDays) out.reminderDays = [...new Set(patch.reminderDays)].sort((a, b) => b - a);
  if (patch.holidays) {
    const byDate = new Map<string, FirmHoliday>();
    for (const h of patch.holidays) byDate.set(h.date, { date: h.date, label: h.label.trim() });
    out.holidays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

export interface FirmSettingsChange {
  field: FirmSettingsField;
  old: unknown;
  new: unknown;
}

/** The fields whose value actually changes, with the old and the new value (for the audit trail). */
export function diffFirmSettings(before: FirmSettings, patch: FirmSettingsPatch): FirmSettingsChange[] {
  const changes: FirmSettingsChange[] = [];
  const next = normalizePatch(patch);
  for (const field of Object.keys(next) as FirmSettingsField[]) {
    const value = next[field];
    if (value === undefined) continue;
    const old = before[field];
    if (JSON.stringify(old) === JSON.stringify(value)) continue;
    changes.push({ field, old, new: value });
  }
  return changes;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon to Sat", "Mon to Fri", or a list such as "Mon, Wed, Fri". */
export function workingDaysLabel(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (sorted.length === 0) return 'None';
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (contiguous && sorted.length >= 3) {
    return `${WEEKDAY_SHORT[sorted[0]! - 1]} to ${WEEKDAY_SHORT[sorted.at(-1)! - 1]}`;
  }
  return sorted.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
}

export const WEEKDAYS: Array<{ day: number; short: string }> = WEEKDAY_SHORT.map((short, i) => ({
  day: i + 1,
  short,
}));

/** "7, 3 and 1 day before"; "On the due date" for 0 alone. */
export function reminderDaysLabel(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => b - a);
  if (sorted.length === 0) return 'Off';
  if (sorted.length === 1 && sorted[0] === 0) return 'On the due date';
  const words = sorted.map(String);
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  const last = sorted.at(-1);
  return `${list} ${sorted.length === 1 && last === 1 ? 'day' : 'days'} before`;
}

/** A short line for the audit trail and the settings history. */
export function describeChange(change: { field: FirmSettingsField | 'logo'; new: unknown; old?: unknown }): string {
  const label = FIRM_SETTINGS_FIELD_LABEL[change.field];
  const value = change.new;
  if (change.field === 'logo') return value ? 'Logo uploaded' : 'Logo removed';
  if (change.field === 'workingDays' && Array.isArray(value)) {
    return `${label}: ${workingDaysLabel(value as number[])}`;
  }
  if (change.field === 'reminderDays' && Array.isArray(value)) {
    return `${label}: ${reminderDaysLabel(value as number[])}`;
  }
  if (change.field === 'holidays' && Array.isArray(value)) {
    return `${label}: ${value.length} listed`;
  }
  if (change.field === 'serviceTargets' && value && typeof value === 'object') {
    const old = readServiceTargets(change.old);
    const next = readServiceTargets(value);
    const moved = SERVICE_TARGET_KEYS.filter((k) => old[k] !== next[k]).map(
      (k) => `${SERVICE_TARGET_LABEL[k].toLowerCase()} ${serviceTargetText(k, next[k]) ?? 'cleared'}`,
    );
    return moved.length ? `Service target: ${moved.join('; ')}` : label;
  }
  if (change.field === 'rolePermissions' && value && typeof value === 'object') {
    const old = readRolePermissions(change.old);
    const next = readRolePermissions(value);
    const moved: string[] = [];
    for (const r of PERMISSION_ROLES) {
      for (const p of PERMISSIONS) {
        if (old[r][p] !== next[r][p]) moved.push(`${PERMISSION_ROLE_LABEL[r]} can ${p} ${next[r][p] ? 'on' : 'off'}`);
      }
    }
    return moved.length ? `Role ${moved.join('; ')}` : label;
  }
  if (value === null || value === '') return `${label} cleared`;
  return `${label}: ${String(value)}`;
}
