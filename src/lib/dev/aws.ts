import 'server-only';
import { CloudWatchLogsClient, DescribeLogGroupsCommand, FilterLogEventsCommand, PutRetentionPolicyCommand } from '@aws-sdk/client-cloudwatch-logs';
import { AppRunnerClient, DescribeServiceCommand, ListOperationsCommand, StartDeploymentCommand, UpdateServiceCommand } from '@aws-sdk/client-apprunner';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import {
  S3Client,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLocationCommand,
  GetBucketVersioningCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { SocialMessagingClient, GetLinkedWhatsAppBusinessAccountPhoneNumberCommand, ListWhatsAppMessageTemplatesCommand } from '@aws-sdk/client-socialmessaging';
import type { BucketStat, DataPayload, DeployOperation, DeployService, LogLevel, LogLine, LogRetention, MonthCost, OverviewPayload, Reach, WhatsAppTemplate } from './types';
import { missingEnv, notSetUp, reach } from './reach';
import { groupCosts, logFilterPattern, logLevelOf, logSourceOf, requestIdOf, sumCostsByService } from './parse';
import { scrubText } from './mask';

/**
 * AWS readers for the developer console: CloudWatch Logs, App Runner and Cost Explorer. Each
 * uses the default credential chain (the App Runner instance role in AWS), one attempt, short
 * timeouts, and returns the "not set up" state when its env var is missing.
 *
 * Env: APP_LOG_GROUP, APP_RUNNER_SERVICE_ARN, AWS_COST_EXPLORER=on, AWS_REGION, S3_BUCKET,
 * EUM_PHONE_NUMBER_ID.
 * IAM: logs:FilterLogEvents, logs:DescribeLogGroups and (for "Keep logs for")
 * logs:PutRetentionPolicy on the group; apprunner:DescribeService, apprunner:ListOperations,
 * and (for "Redeploy" and "Roll back") apprunner:StartDeployment and apprunner:UpdateService
 * on the service; ce:GetCostAndUsage; s3:ListBucket, s3:GetBucketVersioning,
 * s3:GetLifecycleConfiguration, s3:GetBucketLocation on the bucket;
 * social-messaging:GetLinkedWhatsAppBusinessAccountPhoneNumber and
 * social-messaging:ListWhatsAppMessageTemplates.
 */

const HANDLER = { requestTimeout: 4000, connectionTimeout: 2000 };

function region(): string {
  return process.env.AWS_REGION?.trim() || process.env.S3_REGION?.trim() || 'ap-south-1';
}

/** The region from an App Runner service ARN, so the client matches the service. */
function arnRegion(arn: string): string {
  return arn.split(':')[3] || region();
}

const iso = (d: Date | undefined | null) => (d ? new Date(d).toISOString() : null);

// ---------- CloudWatch Logs ----------

export async function readLogLines(opts: { level?: LogLevel | 'all'; text?: string; hours?: number; limit?: number }): Promise<Reach<LogLine[]>> {
  const missing = missingEnv(['APP_LOG_GROUP']);
  if (missing.length) return notSetUp(missing);
  const group = process.env.APP_LOG_GROUP!.trim();
  const hours = Math.min(Math.max(opts.hours ?? 6, 1), 72);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  return reach(async (abortSignal) => {
    const client = new CloudWatchLogsClient({ region: region(), maxAttempts: 1, requestHandler: HANDLER });
    const res = await client.send(
      new FilterLogEventsCommand({
        logGroupName: group,
        startTime: Date.now() - hours * 3600000,
        filterPattern: logFilterPattern(opts.text ?? ''),
        limit,
      }),
      { abortSignal },
    );
    const lines: LogLine[] = (res.events ?? []).map((e, i) => {
      const message = scrubText((e.message ?? '').trim()).slice(0, 2000);
      return {
        id: e.eventId ?? `${e.timestamp ?? 0}-${i}`,
        at: new Date(e.timestamp ?? 0).toISOString(),
        level: logLevelOf(message),
        stream: (e.logStreamName ?? '').split('/').slice(-1)[0] ?? '',
        message,
        source: logSourceOf(message),
        requestId: requestIdOf(message),
      };
    });
    const level = opts.level ?? 'all';
    return lines.filter((l) => level === 'all' || l.level === level).sort((a, b) => b.at.localeCompare(a.at));
  });
}

/**
 * Error lines among the app log lines of the last 24 hours, for the overview tile. It reads
 * at most 500 lines; `capped` says the window held more, so the count is a lower bound.
 */
export async function countLogErrors24h(): Promise<OverviewPayload['errors24h']> {
  const LIMIT = 500;
  const lines = await readLogLines({ hours: 24, limit: LIMIT });
  if (lines.state !== 'ok') return lines;
  return {
    state: 'ok',
    data: { errors: lines.data.filter((l) => l.level === 'error').length, lines: lines.data.length, capped: lines.data.length >= LIMIT },
  };
}

// ---------- App Runner ----------

export async function readAppRunner(): Promise<{ service: Reach<DeployService>; operations: Reach<DeployOperation[]> }> {
  const missing = missingEnv(['APP_RUNNER_SERVICE_ARN']);
  if (missing.length) return { service: notSetUp(missing), operations: notSetUp(missing) };
  const arn = process.env.APP_RUNNER_SERVICE_ARN!.trim();
  const client = new AppRunnerClient({ region: arnRegion(arn), maxAttempts: 1, requestHandler: HANDLER });

  const [service, operations] = await Promise.all([
    reach<DeployService>(async (abortSignal) => {
      const res = await client.send(new DescribeServiceCommand({ ServiceArn: arn }), { abortSignal });
      const s = res.Service;
      const image = s?.SourceConfiguration?.ImageRepository?.ImageIdentifier ?? null;
      const runtime = s?.SourceConfiguration?.ImageRepository?.ImageConfiguration;
      return {
        name: s?.ServiceName ?? '',
        url: s?.ServiceUrl ?? null,
        status: s?.Status ?? 'UNKNOWN',
        // Keep only the tag or digest; the registry path is not useful on the page.
        image: image ? (image.split('/').pop() ?? image) : null,
        cpu: s?.InstanceConfiguration?.Cpu ?? null,
        memory: s?.InstanceConfiguration?.Memory ?? null,
        updatedAt: iso(s?.UpdatedAt),
        imageIdentifier: image,
        autoDeploy: s?.SourceConfiguration?.AutoDeploymentsEnabled ?? null,
        instanceRole: s?.InstanceConfiguration?.InstanceRoleArn ?? null,
        // Names only: the values (and secret ARNs) never leave this function.
        secretNames: Object.keys(runtime?.RuntimeEnvironmentSecrets ?? {}).sort(),
        envNames: Object.keys(runtime?.RuntimeEnvironmentVariables ?? {}).sort(),
      };
    }),
    reach<DeployOperation[]>(async (abortSignal) => {
      const res = await client.send(new ListOperationsCommand({ ServiceArn: arn, MaxResults: 20 }), { abortSignal });
      return (res.OperationSummaryList ?? []).map((o, i) => ({
        id: o.Id ?? `op-${i}`,
        type: o.Type ?? 'UNKNOWN',
        status: o.Status ?? 'UNKNOWN',
        startedAt: iso(o.StartedAt),
        endedAt: iso(o.EndedAt),
      }));
    }),
  ]);
  return { service, operations };
}

/**
 * "Redeploy": App Runner StartDeployment on APP_RUNNER_SERVICE_ARN. It pulls the image the
 * service already names and rolls it out; it never changes the image, the settings or the
 * env. App Runner refuses it while another operation runs. Returns the operation id.
 */
export async function startRedeploy(): Promise<{ operationId: string | null }> {
  const missing = missingEnv(['APP_RUNNER_SERVICE_ARN']);
  if (missing.length) throw new Error('not_set_up');
  const arn = process.env.APP_RUNNER_SERVICE_ARN!.trim();
  const client = new AppRunnerClient({ region: arnRegion(arn), maxAttempts: 1, requestHandler: HANDLER });
  const res = await client.send(new StartDeploymentCommand({ ServiceArn: arn }));
  return { operationId: res.OperationId ?? null };
}

// ---------- Cost Explorer ----------

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function readCosts(days = 30): Promise<DataPayload['costs']> {
  if ((process.env.AWS_COST_EXPLORER ?? '').trim().toLowerCase() !== 'on') return notSetUp(['AWS_COST_EXPLORER']);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);

  return reach(async (abortSignal) => {
    // Cost Explorer has one endpoint, in us-east-1.
    const client = new CostExplorerClient({ region: 'us-east-1', maxAttempts: 1, requestHandler: HANDLER });
    const res = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: ymd(start), End: ymd(end) },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }),
      { abortSignal },
    );
    const sum = sumCostsByService(res.ResultsByTime ?? []);
    return { ...sum, start: ymd(start), end: ymd(end) };
  });
}

/** Cost Explorer bills each call, and the overview refreshes every minute, so keep an answer for an hour. */
const COST_TTL_MS = 3600000;
let monthCache: { at: number; key: string; value: OverviewPayload['costsMonth'] } | null = null;

/**
 * Spend from the first of this month (UTC) to today, in the five overview groups. On the
 * first day of a month the window is empty, so the reader returns a zero total. A good
 * answer is kept for an hour; a failure is not kept.
 */
export async function readCostsThisMonth(now = new Date()): Promise<OverviewPayload['costsMonth']> {
  if ((process.env.AWS_COST_EXPLORER ?? '').trim().toLowerCase() !== 'on') return notSetUp(['AWS_COST_EXPLORER']);
  const key = ymd(now);
  if (monthCache && monthCache.key === key && now.getTime() - monthCache.at < COST_TTL_MS) return monthCache.value;
  const value = await readCostsMonthUncached(now);
  if (value.state === 'ok') monthCache = { at: now.getTime(), key, value };
  return value;
}

async function readCostsMonthUncached(now: Date): Promise<OverviewPayload['costsMonth']> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (end.getTime() <= start.getTime()) {
    return { state: 'ok', data: { currency: 'USD', start: ymd(start), end: ymd(end), total: 0, groups: groupCosts([]) } };
  }
  return reach(async (abortSignal) => {
    const client = new CostExplorerClient({ region: 'us-east-1', maxAttempts: 1, requestHandler: HANDLER });
    const res = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: { Start: ymd(start), End: ymd(end) },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
      }),
      { abortSignal },
    );
    const sum = sumCostsByService(res.ResultsByTime ?? []);
    return { currency: sum.currency, start: ymd(start), end: ymd(end), total: sum.total, groups: groupCosts(sum.services) };
  });
}

/**
 * "Roll back": point the production service at an earlier image identifier with App Runner
 * UpdateService, keeping every other source setting as it is (port, env, secrets, access
 * role, auto deploy). App Runner then deploys that image. Terraform names the image tag too,
 * so the next `terraform apply` returns the service to `var.image_tag`.
 */
export async function rollBackTo(image: string): Promise<{ operationId: string | null; before: string | null }> {
  const missing = missingEnv(['APP_RUNNER_SERVICE_ARN']);
  if (missing.length) throw new Error('not_set_up');
  const arn = process.env.APP_RUNNER_SERVICE_ARN!.trim();
  const client = new AppRunnerClient({ region: arnRegion(arn), maxAttempts: 1, requestHandler: HANDLER });
  const cur = await client.send(new DescribeServiceCommand({ ServiceArn: arn }));
  const src = cur.Service?.SourceConfiguration;
  const repo = src?.ImageRepository;
  if (!src || !repo) throw new Error('no_image_source');
  const res = await client.send(
    new UpdateServiceCommand({
      ServiceArn: arn,
      SourceConfiguration: {
        ...src,
        ImageRepository: { ...repo, ImageIdentifier: image },
      },
    }),
  );
  return { operationId: res.OperationId ?? null, before: repo.ImageIdentifier ?? null };
}

// ---------- Log retention ----------

/** CloudWatch keeps log lines for one of these day counts; the console offers three. */
export const RETENTION_DAYS = [14, 30, 90] as const;

export async function readLogRetention(): Promise<Reach<LogRetention>> {
  const missing = missingEnv(['APP_LOG_GROUP']);
  if (missing.length) return notSetUp(missing);
  const group = process.env.APP_LOG_GROUP!.trim();
  return reach(async (abortSignal) => {
    const client = new CloudWatchLogsClient({ region: region(), maxAttempts: 1, requestHandler: HANDLER });
    const res = await client.send(new DescribeLogGroupsCommand({ logGroupNamePrefix: group, limit: 5 }), { abortSignal });
    const g = (res.logGroups ?? []).find((x) => x.logGroupName === group);
    if (!g) throw new Error('Log group not found');
    return { group, days: g.retentionInDays ?? null, storedBytes: g.storedBytes ?? null };
  });
}

export async function setLogRetention(days: (typeof RETENTION_DAYS)[number]): Promise<void> {
  const missing = missingEnv(['APP_LOG_GROUP']);
  if (missing.length) throw new Error('not_set_up');
  const client = new CloudWatchLogsClient({ region: region(), maxAttempts: 1, requestHandler: HANDLER });
  await client.send(new PutRetentionPolicyCommand({ logGroupName: process.env.APP_LOG_GROUP!.trim(), retentionInDays: days }));
}

// ---------- Cost by month ----------

/** Spend per calendar month for the last `months` months (this month so far included). */
export async function readCostsByMonth(months = 6, now = new Date()): Promise<Reach<{ currency: string; months: MonthCost[] }>> {
  if ((process.env.AWS_COST_EXPLORER ?? '').trim().toLowerCase() !== 'on') return notSetUp(['AWS_COST_EXPLORER']);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return reach(async (abortSignal) => {
    const client = new CostExplorerClient({ region: 'us-east-1', maxAttempts: 1, requestHandler: HANDLER });
    const res = await client.send(
      new GetCostAndUsageCommand({ TimePeriod: { Start: ymd(start), End: ymd(end) }, Granularity: 'MONTHLY', Metrics: ['UnblendedCost'] }),
      { abortSignal },
    );
    let currency = 'USD';
    const out: MonthCost[] = (res.ResultsByTime ?? []).map((r) => {
      const m = r.Total?.UnblendedCost;
      if (m?.Unit) currency = m.Unit;
      return { month: (r.TimePeriod?.Start ?? '').slice(0, 7), amount: Number(m?.Amount ?? 0) || 0 };
    });
    return { currency, months: out };
  });
}

// ---------- S3 bucket ----------

/** The most objects the bucket reader counts before it stops, so a page load stays quick. */
const BUCKET_COUNT_LIMIT = 20000;

export async function readBucketStats(): Promise<Reach<BucketStat>> {
  const missing = missingEnv(['S3_BUCKET']);
  if (missing.length) return notSetUp(missing);
  const bucket = process.env.S3_BUCKET!.trim();
  return reach(async (abortSignal) => {
    const client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      maxAttempts: 1,
      requestHandler: HANDLER,
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
    const [loc, ver, life] = await Promise.all([
      client.send(new GetBucketLocationCommand({ Bucket: bucket }), { abortSignal }).catch(() => null),
      client.send(new GetBucketVersioningCommand({ Bucket: bucket }), { abortSignal }).catch(() => null),
      // A bucket without rules answers with an error, which means none.
      client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }), { abortSignal }).catch(() => null),
    ]);
    let objects = 0;
    let size = 0;
    let token: string | undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }), { abortSignal });
      for (const o of page.Contents ?? []) {
        objects += 1;
        size += o.Size ?? 0;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token && objects < BUCKET_COUNT_LIMIT);
    return {
      bucket,
      region: loc ? loc.LocationConstraint || 'us-east-1' : (process.env.S3_REGION ?? null),
      versioning: ver?.Status ?? 'Off',
      lifecycleRules: life?.Rules?.length ?? 0,
      objects,
      bytes: size,
      capped: Boolean(token),
    };
  }, 10000);
}

// ---------- WhatsApp templates ----------

/** The approved and waiting WhatsApp templates on the linked business account. */
export async function readWhatsAppTemplates(): Promise<Reach<WhatsAppTemplate[]>> {
  const missing = missingEnv(['EUM_PHONE_NUMBER_ID']);
  if (missing.length) return notSetUp(missing);
  return reach(async (abortSignal) => {
    const r = process.env.SOCIAL_MESSAGING_REGION?.trim() || process.env.AWS_REGION?.trim();
    const client = new SocialMessagingClient({ ...(r ? { region: r } : {}), maxAttempts: 1, requestHandler: HANDLER });
    const phone = await client.send(new GetLinkedWhatsAppBusinessAccountPhoneNumberCommand({ id: process.env.EUM_PHONE_NUMBER_ID!.trim() }), { abortSignal });
    const waba = phone.linkedWhatsAppBusinessAccountId;
    if (!waba) throw new Error('No business account is linked to the number');
    const res = await client.send(new ListWhatsAppMessageTemplatesCommand({ id: waba, maxResults: 100 }), { abortSignal });
    return (res.templates ?? []).map((t) => ({
      name: t.templateName ?? '',
      language: t.templateLanguage ?? '',
      category: t.templateCategory ?? '',
      status: t.templateStatus ?? '',
    }));
  }, 8000);
}
