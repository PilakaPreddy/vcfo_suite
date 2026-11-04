import type { RotationRow, RotationStatus } from './types';

/**
 * Pure rules for the SOC 2 cards (M7): which secrets the console tracks, when each is due,
 * the status word, the backup schedule in IST, and how an AWS error maps to "Not connected".
 * No AWS calls here; `soc.ts` reads AWS and calls these.
 */

type Env = Record<string, string | undefined>;

export interface RotationSecretDef {
  key: string;
  scope: string;
  /** The env var that names the secret (name or ARN); the default name is used when it is unset. */
  idEnv: string;
  defaultId: string | null;
  finding: string | null;
  mode: 'manual' | 'auto';
  everyDays?: number;
  everyMonths?: number;
  /** The accepted exception's next review date (YYYY-MM-DD). */
  reviewAt: string | null;
}

/**
 * The tracked secrets. The three manual ones are the accepted SOC 2 exceptions (371, 372,
 * 376). The database password is the RDS-managed master secret (DB_SECRET_ARN), which RDS
 * rotates every 7 days.
 */
export const ROTATION_SECRETS: RotationSecretDef[] = [
  {
    key: 'auth',
    scope: 'Signs sign-in tokens',
    idEnv: 'AUTH_SECRET_SECRET_ID',
    defaultId: 'vcfo-suite/AUTH_SECRET',
    finding: '371',
    mode: 'manual',
    everyDays: 90,
    reviewAt: '2027-01-31',
  },
  {
    key: 'azure',
    scope: 'Outlook mail sign-in',
    idEnv: 'AZURE_AD_CLIENT_SECRET_SECRET_ID',
    defaultId: 'vcfo-suite/AZURE_AD_CLIENT_SECRET',
    finding: '372',
    mode: 'manual',
    everyMonths: 6,
    reviewAt: '2027-04-30',
  },
  {
    key: 'anthropic',
    scope: 'Ask VCFO answers',
    idEnv: 'ANTHROPIC_API_KEY_SECRET_ID',
    defaultId: '/vcfo/ask-vcfo/anthropic-api-key',
    finding: '376',
    mode: 'manual',
    everyDays: 90,
    reviewAt: '2027-01-31',
  },
  {
    key: 'db',
    scope: 'Postgres password',
    idEnv: 'DB_SECRET_ARN',
    defaultId: null,
    finding: null,
    mode: 'auto',
    everyDays: 7,
    reviewAt: null,
  },
];

/** A row shows amber this many days before it is due. */
const DUE_SOON_DAYS = 14;

export function secretIdFor(def: RotationSecretDef, env: Env = process.env): string | null {
  return env[def.idEnv]?.trim() || def.defaultId;
}

function cadenceLabel(def: RotationSecretDef): string {
  if (def.everyMonths) return `Every ${def.everyMonths} months`;
  return `Every ${def.everyDays ?? 0} days`;
}

/** `from` plus the secret's cadence, in UTC. */
export function addCadence(def: RotationSecretDef, from: Date): Date {
  const d = new Date(from.getTime());
  if (def.everyMonths) {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + def.everyMonths);
    // Keep the day, or the month's last day (31 Aug + 6 months = 28 or 29 Feb).
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d;
  }
  return new Date(d.getTime() + (def.everyDays ?? 0) * 86400000);
}

/** ok, due soon (amber) or past due (red). Red only when the due date has passed. */
export function dueStatus(dueAt: Date | null, now: Date): 'ok' | 'due_soon' | 'past_due' {
  if (!dueAt) return 'ok';
  if (dueAt.getTime() < now.getTime()) return 'past_due';
  if (dueAt.getTime() - now.getTime() <= DUE_SOON_DAYS * 86400000) return 'due_soon';
  return 'ok';
}

/** The fields of DescribeSecret the console uses. */
export interface SecretFacts {
  name?: string | null;
  createdDate?: Date | null;
  lastChangedDate?: Date | null;
  lastRotatedDate?: Date | null;
  nextRotationDate?: Date | null;
  rotationEnabled?: boolean | null;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

/** The row for one secret that DescribeSecret answered for. */
export function rotationRow(def: RotationSecretDef, facts: SecretFacts, now: Date): RotationRow {
  const lastRotated = facts.lastRotatedDate ?? facts.lastChangedDate ?? facts.createdDate ?? null;
  const lastFrom: RotationRow['lastFrom'] = facts.lastRotatedDate ? 'rotated' : facts.lastChangedDate ? 'changed' : facts.createdDate ? 'created' : null;
  const base = {
    key: def.key,
    name: facts.name || secretIdFor(def, {}) || def.key,
    scope: def.scope,
    finding: def.finding,
    mode: def.mode,
    cadence: cadenceLabel(def),
    lastRotated: iso(lastRotated),
    lastFrom,
    reviewAt: def.reviewAt,
  };
  if (def.mode === 'auto') {
    const due = facts.nextRotationDate ?? (lastRotated ? addCadence(def, lastRotated) : null);
    let status: RotationStatus = facts.rotationEnabled === false ? 'auto_off' : 'auto';
    if (due && due.getTime() < now.getTime()) status = 'past_due';
    return { ...base, dueAt: iso(due), status };
  }
  const due = lastRotated ? addCadence(def, lastRotated) : def.reviewAt ? new Date(`${def.reviewAt}T23:59:59Z`) : null;
  return { ...base, dueAt: iso(due), status: dueStatus(due, now) };
}

/** The row for a secret DescribeSecret did not answer for. */
export function rotationErrorRow(def: RotationSecretDef, id: string | null, status: 'not_found' | 'not_connected' | 'unreachable', error?: string): RotationRow {
  return {
    key: def.key,
    name: id ?? def.key,
    scope: def.scope,
    finding: def.finding,
    mode: def.mode,
    cadence: cadenceLabel(def),
    lastRotated: null,
    lastFrom: null,
    dueAt: null,
    reviewAt: def.reviewAt,
    status,
    ...(error ? { error } : {}),
  };
}

/**
 * True when an AWS error means the app may not read this (IAM), or this server has no AWS
 * credentials at all. The card then says "Not connected" rather than "Unreachable".
 */
export function isAccessDenied(error: string): boolean {
  return /AccessDenied|UnauthorizedOperation|not authorized|AuthorizationError|CredentialsProviderError|Could not load credentials|UnrecognizedClient|InvalidClientTokenId|ExpiredToken/i.test(
    error,
  );
}

/**
 * "02:00 IST" for a daily AWS cron such as `cron(30 20 * * ? *)` (UTC). Null for any other
 * shape, so the card shows the raw expression instead.
 */
export function dailyCronIst(expr: string | null | undefined): string | null {
  const m = /^cron\((\d{1,2}) (\d{1,2}) \* \* \? \*\)$/.exec(expr?.trim() ?? '');
  if (!m) return null;
  const mins = (Number(m[2]) * 60 + Number(m[1]) + 330) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} IST`;
}

/** The RDS instance id: RDS_INSTANCE_ID, else the first label of DB_HOST (the RDS endpoint). */
export function rdsInstanceId(env: Env = process.env): string | null {
  const id = env.RDS_INSTANCE_ID?.trim();
  if (id) return id;
  const host = env.DB_HOST?.trim();
  if (host && /\.rds\.amazonaws\.com$/i.test(host)) return host.split('.')[0] || null;
  return null;
}
