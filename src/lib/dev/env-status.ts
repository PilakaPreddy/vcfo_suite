import type { ServiceConfig } from './types';

/**
 * The configured state of each outside service, read from env var presence only. A value is
 * never returned: the result holds env var names and a provider word from a fixed list, so
 * this is safe to send to the browser. Pass `env` in tests; the routes use `process.env`.
 */

type Env = Record<string, string | undefined>;

function has(env: Env, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function on(env: Env, name: string): boolean {
  return (env[name] ?? '').trim().toLowerCase() === 'true';
}

function build(
  base: Omit<ServiceConfig, 'status' | 'present' | 'missing'>,
  env: Env,
  needed: string[],
  optional: string[] = [],
  forceOff = false,
): ServiceConfig {
  const present = [...needed, ...optional].filter((n) => has(env, n));
  const missing = needed.filter((n) => !has(env, n));
  const status: ServiceConfig['status'] = forceOff
    ? 'off'
    : missing.length === 0
      ? 'configured'
      : present.length > 0
        ? 'partial'
        : 'off';
  return { ...base, status, present, missing };
}

export function readServiceConfig(env: Env = process.env): ServiceConfig[] {
  const emailProvider = (env.EMAIL_PROVIDER ?? 'resend').trim().toLowerCase() === 'ses' ? 'ses' : 'resend';
  const email =
    emailProvider === 'ses'
      ? build(
          { id: 'email', name: 'Email', kind: 'Email', what: 'Mail to clients and staff', provider: 'Amazon SES' },
          env,
          ['EMAIL_PROVIDER'],
          ['SES_FROM_EMAIL', 'EMAIL_FROM', 'SES_REGION'],
        )
      : build(
          { id: 'email', name: 'Email', kind: 'Email', what: 'Mail to clients and staff', provider: 'Resend' },
          env,
          ['RESEND_API_KEY'],
          ['EMAIL_PROVIDER', 'EMAIL_FROM', 'RESEND_FROM_EMAIL'],
        );

  const waEnabled = on(env, 'WHATSAPP_ENABLED');
  const whatsapp = build(
    { id: 'whatsapp', name: 'WhatsApp', kind: 'Messaging', what: 'Outbound nudges beside email', provider: 'AWS End User Messaging' },
    env,
    ['WHATSAPP_ENABLED', 'EUM_PHONE_NUMBER_ID'],
    ['SOCIAL_MESSAGING_REGION', 'AWS_EUM_SNS_TOPIC_ARN'],
    !waEnabled,
  );

  const localStore = has(env, 'S3_ENDPOINT');
  const storage = build(
    { id: 'storage', name: 'File storage', kind: 'Storage', what: 'Documents, vault and templates', provider: localStore ? 'MinIO (S3 endpoint)' : 'Amazon S3' },
    env,
    ['S3_BUCKET', 'S3_REGION'],
    ['S3_ENDPOINT', 'S3_ACCESS_KEY_ID'],
  );

  const jobs = build(
    { id: 'jobs', name: 'Background jobs', kind: 'Jobs', what: 'Reminders, feeds and ingest', provider: 'Inngest' },
    env,
    ['INNGEST_SIGNING_KEY'],
    ['INNGEST_EVENT_KEY'],
  );

  const askProvider = (env.ASK_VCFO_LLM_PROVIDER ?? '').trim().toLowerCase() === 'bedrock' ? 'bedrock' : 'anthropic';
  const ask = build(
    { id: 'ask', name: 'Ask VCFO', kind: 'AI', what: 'Answers from the firm library', provider: askProvider === 'bedrock' ? 'Amazon Bedrock' : 'Anthropic API' },
    env,
    // M7: the key is read from Secrets Manager when ANTHROPIC_API_KEY_SECRET_ID is set.
    askProvider === 'bedrock'
      ? ['ASK_VCFO_ENABLED', 'ASK_VCFO_BEDROCK_REGION']
      : ['ASK_VCFO_ENABLED', has(env, 'ANTHROPIC_API_KEY_SECRET_ID') ? 'ANTHROPIC_API_KEY_SECRET_ID' : 'ANTHROPIC_API_KEY'],
    ['ASK_VCFO_LLM_PROVIDER'],
    !on(env, 'ASK_VCFO_ENABLED'),
  );

  const outlook = build(
    { id: 'outlook', name: 'Outlook mail', kind: 'Email', what: 'Staff send from their own mailbox', provider: 'Microsoft Graph' },
    env,
    ['AZURE_AD_CLIENT_ID', has(env, 'AZURE_AD_CLIENT_SECRET_SECRET_ID') ? 'AZURE_AD_CLIENT_SECRET_SECRET_ID' : 'AZURE_AD_CLIENT_SECRET', 'AZURE_AD_TENANT_ID'],
  );

  const credentials = build(
    { id: 'credentials', name: 'Portal credentials', kind: 'Security', what: 'Encrypts client portal logins', provider: 'AES-256-GCM key' },
    env,
    ['CREDENTIALS_ENCRYPTION_KEY'],
  );

  const logs = build(
    { id: 'logs', name: 'Logs', kind: 'Monitoring', what: 'App log lines on the Logs page', provider: 'CloudWatch Logs' },
    env,
    ['APP_LOG_GROUP'],
  );

  const deploys = build(
    { id: 'deploys', name: 'Deploys', kind: 'Hosting', what: 'Service state and deploy history', provider: 'App Runner' },
    env,
    ['APP_RUNNER_SERVICE_ARN'],
  );

  const costs = build(
    { id: 'costs', name: 'Costs', kind: 'Monitoring', what: 'Spend by AWS service', provider: 'Cost Explorer' },
    env,
    ['AWS_COST_EXPLORER'],
    [],
    (env.AWS_COST_EXPLORER ?? '').trim().toLowerCase() !== 'on',
  );

  return [email, whatsapp, storage, jobs, ask, outlook, credentials, logs, deploys, costs];
}

/** Secrets the app needs in every environment, whatever services are switched on. */
const ALWAYS_NEEDED_SECRETS = ['AUTH_SECRET', 'CREDENTIALS_ENCRYPTION_KEY'] as const;

/**
 * Secret names to fix, for the overview tile "Secrets to fix": the secrets every environment
 * needs, plus the names a partly set service still lacks. Names only, never values.
 */
export function missingSecrets(env: Env = process.env, services: ServiceConfig[] = readServiceConfig(env)): string[] {
  const out = new Set<string>(ALWAYS_NEEDED_SECRETS.filter((n) => !has(env, n)));
  for (const s of services) if (s.status === 'partial') for (const m of s.missing) out.add(m);
  return [...out];
}
