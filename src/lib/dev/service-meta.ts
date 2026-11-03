import type { ServiceConfig, ServiceMeta } from './types';

/**
 * Non-secret facts about each outside service, from env vars and the code: the account it
 * runs under (a from address, a bucket, an app id), where the app talks to it, and the
 * permissions or OAuth scopes the app uses. Secrets are never read here; ids that could help
 * an attacker (phone number ids, tenant ids) keep only their last four characters.
 */

type Env = Record<string, string | undefined>;

const v = (env: Env, name: string) => env[name]?.trim() || '';

/** "…1a2b" for an id that should not be shown whole. */
export function tail4(value: string): string {
  return value.length > 4 ? `…${value.slice(-4)}` : value;
}

/** The address part of "Name <a@b>" or a bare address. */
function address(raw: string): string {
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/** The domain mail leaves from, from the configured from address, or null. */
export function mailDomain(env: Env = process.env): string | null {
  const from = address(v(env, 'SES_FROM_EMAIL') || v(env, 'EMAIL_FROM') || v(env, 'RESEND_FROM_EMAIL'));
  const at = from.lastIndexOf('@');
  return at > 0 ? from.slice(at + 1).toLowerCase() : null;
}

/** The permissions each service uses, read from the code that calls it. */
export const SERVICE_SCOPES: Record<ServiceConfig['id'], string[]> = {
  email: ['ses:SendEmail', 'ses:GetAccount'],
  whatsapp: ['social-messaging:SendWhatsAppMessage', 'social-messaging:ListWhatsAppMessageTemplates'],
  storage: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
  jobs: ['events:send', 'runs:read'],
  ask: ['messages:create'],
  outlook: ['offline_access', 'User.Read', 'Mail.Send', 'Calendars.ReadWrite'],
  credentials: ['aes-256-gcm'],
  logs: ['logs:FilterLogEvents', 'logs:DescribeLogGroups', 'logs:PutRetentionPolicy'],
  deploys: ['apprunner:DescribeService', 'apprunner:ListOperations', 'apprunner:StartDeployment', 'apprunner:UpdateService'],
  costs: ['ce:GetCostAndUsage'],
};

/** Services that a live check costs nothing to run against. Cost Explorer bills each call. */
const CHECKABLE: ServiceConfig['id'][] = ['email', 'whatsapp', 'storage', 'jobs', 'ask', 'outlook', 'credentials', 'logs', 'deploys'];

export function serviceMeta(services: ServiceConfig[], env: Env = process.env, outlookExpires: string | null = null): ServiceMeta[] {
  const ses = v(env, 'EMAIL_PROVIDER').toLowerCase() === 'ses';
  const region = v(env, 'AWS_REGION') || v(env, 'S3_REGION') || null;
  const arn = v(env, 'APP_RUNNER_SERVICE_ARN');
  const scopes = { ...SERVICE_SCOPES, email: ses ? SERVICE_SCOPES.email : ['emails:send', 'domains:read'] };
  const askBedrock = v(env, 'ASK_VCFO_LLM_PROVIDER').toLowerCase() === 'bedrock';
  if (askBedrock) scopes.ask = ['bedrock:InvokeModel'];

  const facts: Record<ServiceConfig['id'], { account: string | null; endpoint: string | null }> = {
    email: {
      account: address(v(env, 'SES_FROM_EMAIL') || v(env, 'EMAIL_FROM') || v(env, 'RESEND_FROM_EMAIL')) || null,
      endpoint: ses ? `email.${v(env, 'SES_REGION') || region || 'ap-south-1'}.amazonaws.com` : 'api.resend.com',
    },
    whatsapp: {
      account: v(env, 'EUM_PHONE_NUMBER_ID') ? `Phone ${tail4(v(env, 'EUM_PHONE_NUMBER_ID'))}` : null,
      endpoint: `social-messaging.${v(env, 'SOCIAL_MESSAGING_REGION') || region || 'ap-south-1'}.amazonaws.com`,
    },
    storage: {
      account: v(env, 'S3_BUCKET') || null,
      endpoint: v(env, 'S3_ENDPOINT') || `s3.${v(env, 'S3_REGION') || 'us-east-1'}.amazonaws.com`,
    },
    jobs: { account: 'vcfo-suite', endpoint: (v(env, 'INNGEST_API_BASE_URL') || 'https://api.inngest.com').replace(/^https?:\/\//, '') },
    ask: {
      account: askBedrock ? `Bedrock ${v(env, 'ASK_VCFO_BEDROCK_REGION') || ''}`.trim() : v(env, 'ANTHROPIC_API_KEY_SECRET_ID') || v(env, 'ANTHROPIC_API_KEY') ? 'Anthropic API key' : null,
      endpoint: askBedrock ? `bedrock-runtime.${v(env, 'ASK_VCFO_BEDROCK_REGION') || 'ap-south-1'}.amazonaws.com` : 'api.anthropic.com',
    },
    outlook: {
      account: v(env, 'AZURE_AD_TENANT_ID') ? `Tenant ${tail4(v(env, 'AZURE_AD_TENANT_ID'))}` : null,
      endpoint: 'graph.microsoft.com',
    },
    credentials: { account: null, endpoint: null },
    logs: { account: v(env, 'APP_LOG_GROUP') || null, endpoint: region ? `logs.${region}.amazonaws.com` : null },
    deploys: {
      account: arn ? (arn.split('/')[1] ?? null) : null,
      endpoint: arn ? `apprunner.${arn.split(':')[3] || 'ap-south-1'}.amazonaws.com` : null,
    },
    costs: { account: null, endpoint: 'ce.us-east-1.amazonaws.com' },
  };

  return services.map((s) => ({
    id: s.id,
    account: facts[s.id].account,
    endpoint: facts[s.id].endpoint,
    scopes: scopes[s.id],
    checkable: CHECKABLE.includes(s.id) && s.status !== 'off',
    authExpires: s.id === 'outlook' ? outlookExpires : null,
  }));
}
