import type { DeployService, ServiceCheck } from './types';
import { SERVICE_SCOPES, tail4 } from './service-meta';

/**
 * The secrets inventory and service accounts for the Access page. Names and where each one
 * is stored only: a value never leaves the server. "Stored in" comes from App Runner (secret
 * references against plain env names) when the service can be read, or from this process.
 */

type Env = Record<string, string | undefined>;

/**
 * `secretIdVar` (M7): the env var that names a Secrets Manager secret the app reads at
 * runtime. When it is set, the secret counts as set and stored in Secrets Manager.
 * The database password has no DATABASE_URL in production: DB_SECRET_ARN names the
 * RDS-managed master secret (rotated every 7 days). DATABASE_URL is for local dev only.
 */
const APP_SECRETS: Array<{ name: string; scope: string; secretIdVar?: string }> = [
  { name: 'AUTH_SECRET', scope: 'Signs sign-in tokens' },
  { name: 'AUTH_SECRET_PREVIOUS', scope: 'Accepts tokens from before a rotation' },
  { name: 'CREDENTIALS_ENCRYPTION_KEY', scope: 'Encrypts portal logins and two-step secrets' },
  { name: 'DB_SECRET_ARN', scope: 'Postgres password, rotated by RDS' },
  { name: 'RESEND_API_KEY', scope: 'Email through Resend' },
  { name: 'INNGEST_SIGNING_KEY', scope: 'Background jobs, reads' },
  { name: 'INNGEST_EVENT_KEY', scope: 'Background jobs, sends' },
  { name: 'ANTHROPIC_API_KEY', scope: 'Ask VCFO answers', secretIdVar: 'ANTHROPIC_API_KEY_SECRET_ID' },
  { name: 'AZURE_AD_CLIENT_SECRET', scope: 'Outlook mail sign-in', secretIdVar: 'AZURE_AD_CLIENT_SECRET_SECRET_ID' },
  { name: 'S3_SECRET_ACCESS_KEY', scope: 'File storage with a key (local only)' },
];

export interface SecretRow {
  name: string;
  scope: string;
  storedIn: 'Secrets Manager' | 'App Runner env' | 'This server' | 'Not set';
  set: boolean;
}

export function secretInventory(env: Env, service: DeployService | null): SecretRow[] {
  return APP_SECRETS.map(({ secretIdVar, ...s }) => {
    const set = Boolean(env[s.name]?.trim());
    let storedIn: SecretRow['storedIn'] = set ? 'This server' : 'Not set';
    const runtime = Boolean(secretIdVar && (env[secretIdVar]?.trim() || service?.envNames?.includes(secretIdVar)));
    // DB_SECRET_ARN is a plain env var that names the RDS-managed secret.
    const dbSecret = s.name === 'DB_SECRET_ARN' && (set || service?.envNames?.includes(s.name));
    if (runtime || dbSecret || service?.secretNames?.includes(s.name)) storedIn = 'Secrets Manager';
    else if (service?.envNames?.includes(s.name)) storedIn = 'App Runner env';
    return { ...s, storedIn, set: set || storedIn === 'Secrets Manager' || storedIn === 'App Runner env' };
  });
}

export interface ServiceAccountRow {
  account: string;
  kind: string;
  can: string[];
  /** The service whose last check stands for "Last used". */
  service: string;
  lastUsed: string | null;
}

export function serviceAccounts(env: Env, service: DeployService | null, lastChecks: Record<string, ServiceCheck | null>): ServiceAccountRow[] {
  const out: ServiceAccountRow[] = [];
  const last = (id: string) => lastChecks[id]?.checkedAt ?? null;
  if (service?.instanceRole) {
    out.push({
      account: service.instanceRole.split('/').pop() ?? service.instanceRole,
      kind: 'IAM role (App Runner instance)',
      can: [...SERVICE_SCOPES.storage, ...SERVICE_SCOPES.logs, ...SERVICE_SCOPES.costs].slice(0, 8),
      service: 'deploys',
      lastUsed: last('deploys'),
    });
  }
  if (env.INNGEST_SIGNING_KEY?.trim()) out.push({ account: 'vcfo-suite', kind: 'Inngest app', can: SERVICE_SCOPES.jobs, service: 'jobs', lastUsed: last('jobs') });
  if (env.AZURE_AD_CLIENT_ID?.trim())
    out.push({ account: `App ${tail4(env.AZURE_AD_CLIENT_ID.trim())}`, kind: 'Microsoft Entra app', can: SERVICE_SCOPES.outlook, service: 'outlook', lastUsed: last('outlook') });
  if (env.S3_ACCESS_KEY_ID?.trim())
    out.push({ account: `Key ${tail4(env.S3_ACCESS_KEY_ID.trim())}`, kind: 'Storage access key', can: SERVICE_SCOPES.storage, service: 'storage', lastUsed: last('storage') });
  return out;
}
