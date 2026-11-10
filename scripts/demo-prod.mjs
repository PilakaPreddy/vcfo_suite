#!/usr/bin/env node
/**
 * One command to seed (or remove) the named demo clients on PRODUCTION.
 *
 *   npm run demo:seed:prod
 *   npm run demo:clean:prod
 *
 * Production RDS is private and has no DATABASE_URL, so a script from a laptop
 * reaches it only through an SSM port forward on the NAT instance
 * (docs/context/AWS-DEPLOY.md). `scripts/db-env-prod.mjs` prints the two steps
 * to do that by hand; this wrapper does them for you and tidies up after:
 *
 *   1. Ask AWS, with your own credentials, for the RDS endpoint, its managed
 *      master secret and the NAT instance.
 *   2. Read the App Runner service's own environment variables, so the script
 *      writes document placeholders to the same S3 bucket the app reads.
 *   3. Open the port forward, wait for the local port to answer.
 *   4. Run scripts/seed-demo-clients.ts through it.
 *   5. Close the port forward, whatever happened.
 *
 * No password is ever printed or stored: the script reads the rotating RDS
 * secret itself when it connects.
 *
 * Needs the AWS CLI, the Session Manager plugin, and credentials for the
 * account that holds the deployment.
 *
 * Options: --remove (take the demo data out again), --db <identifier>,
 * --region <region>, --port <local port>, --nat <instance id>,
 * --service <App Runner service name>.
 *
 * `--reset-clients` runs scripts/reset-client-data.ts instead of the demo seed
 * (npm run clients:reset:prod). It only counts unless `--yes` is also given; with
 * `--yes` it first takes a manual RDS snapshot and waits for it, so the deleted
 * test data can be restored from the snapshot if anything was wanted after all.
 */
import { execFileSync, spawn } from 'node:child_process';
import { connect } from 'node:net';
import process from 'node:process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const remove = process.argv.includes('--remove');
const resetClients = process.argv.includes('--reset-clients');
const migrate = process.argv.includes('--migrate');
const confirmed = process.argv.includes('--yes');
const dbId = arg('db', 'vcfo-suite-db');
const region = arg('region', process.env.AWS_REGION || 'ap-south-1');
const localPort = Number(arg('port', '15432'));
const serviceName = arg('service', '');

function aws(args, { quiet = false } = {}) {
  const out = execFileSync('aws', [...args, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', quiet ? 'pipe' : 'inherit'],
  });
  return JSON.parse(out);
}

/** Wait until something is listening on the forwarded port. */
async function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port });
      const done = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.setTimeout(2000, () => done(false));
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/* ---- 1. The database ---- */

console.log(`Looking up ${dbId} in ${region}…`);
const instance = aws(['rds', 'describe-db-instances', '--db-instance-identifier', dbId])
  .DBInstances?.[0];
if (!instance) throw new Error(`No RDS instance named ${dbId}`);
const secretArn = instance.MasterUserSecret?.SecretArn;
if (!secretArn) {
  throw new Error(`${dbId} does not use an RDS-managed password (db_managed_password is off)`);
}
if (instance.PubliclyAccessible) {
  console.error(`WARNING: ${dbId} is publicly accessible. It should be private.`);
}
const host = instance.Endpoint.Address;
const port = instance.Endpoint.Port;

let nat = arg('nat', '');
if (!nat) {
  const res = aws([
    'ec2',
    'describe-instances',
    '--filters',
    'Name=tag:project,Values=vcfo-suite',
    'Name=instance-state-name,Values=running',
  ]);
  const found = (res.Reservations ?? [])
    .flatMap((r) => r.Instances ?? [])
    .find((i) =>
      /nat/i.test(
        `${(i.Tags ?? []).find((t) => t.Key === 'Name')?.Value ?? ''} ${i.IamInstanceProfile?.Arn ?? ''}`,
      ),
    );
  nat = found?.InstanceId ?? '';
}
if (!nat) {
  throw new Error('No running NAT instance found — pass --nat <instance id>');
}

/* ---- 1b. A snapshot before a reset that deletes ---- */

if (resetClients && confirmed) {
  const snapshotId = `${dbId}-before-client-reset-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  console.log(`Taking RDS snapshot ${snapshotId} before deleting anything…`);
  aws(['rds', 'create-db-snapshot', '--db-instance-identifier', dbId, '--db-snapshot-identifier', snapshotId]);
  execFileSync(
    'aws',
    ['rds', 'wait', 'db-snapshot-available', '--db-snapshot-identifier', snapshotId, '--region', region],
    { stdio: 'inherit' },
  );
  console.log(`Snapshot ${snapshotId} is available.\n`);
}

/* ---- 2. Storage, from the running service's own configuration ---- */

const storageEnv = {};
try {
  const services = aws(['apprunner', 'list-services'], { quiet: true }).ServiceSummaryList ?? [];
  const match = serviceName
    ? services.find((s) => s.ServiceName === serviceName)
    : services.find((s) => /vcfo/i.test(s.ServiceName));
  if (match) {
    const described = aws(['apprunner', 'describe-service', '--service-arn', match.ServiceArn], {
      quiet: true,
    });
    const vars =
      described.Service?.SourceConfiguration?.ImageRepository?.ImageConfiguration
        ?.RuntimeEnvironmentVariables ?? {};
    for (const key of ['S3_BUCKET', 'S3_REGION']) {
      if (vars[key]) storageEnv[key] = vars[key];
    }
    console.log(
      `App Runner service ${match.ServiceName}: ` +
        (storageEnv.S3_BUCKET ? `bucket ${storageEnv.S3_BUCKET}` : 'no S3_BUCKET in its env'),
    );
  } else {
    console.log('No App Runner service found — falling back to the S3 settings in your env.');
  }
} catch {
  console.log('Could not read the App Runner configuration — falling back to your own S3 settings.');
}

/* ---- 3. The tunnel ---- */

console.log(`Opening the port forward ${localPort} → ${host}:${port} through ${nat}…`);
const tunnel = spawn(
  'aws',
  [
    'ssm',
    'start-session',
    '--region',
    region,
    '--target',
    nat,
    '--document-name',
    'AWS-StartPortForwardingSessionToRemoteHost',
    '--parameters',
    JSON.stringify({
      host: [host],
      portNumber: [String(port)],
      localPortNumber: [String(localPort)],
    }),
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
);
tunnel.stdout.on('data', () => {});

let closed = false;
const closeTunnel = () => {
  if (closed) return;
  closed = true;
  tunnel.kill('SIGTERM');
};
process.on('SIGINT', () => {
  closeTunnel();
  process.exit(130);
});
process.on('exit', closeTunnel);

tunnel.on('exit', (code) => {
  if (!closed) {
    console.error(`The port forward exited early (code ${code}).`);
    console.error('Check that the Session Manager plugin is installed and your credentials work.');
    process.exit(1);
  }
});

if (!(await waitForPort(localPort))) {
  closeTunnel();
  throw new Error(`Nothing is listening on 127.0.0.1:${localPort} — the port forward did not open`);
}
console.log('Tunnel is up.\n');

/* ---- 4. The seed (or the client reset) ---- */

const seed = spawn(
  process.execPath,
  [
    ...(migrate ? ['node_modules/drizzle-kit/bin.cjs', 'migrate'] : ['--conditions=react-server', '--import', 'tsx']),
    ...(migrate ? [] : resetClients
      ? ['scripts/reset-client-data.ts', ...(confirmed ? ['--yes'] : [])]
      : ['scripts/seed-demo-clients.ts', ...(remove ? ['--remove'] : [])]),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DB_SECRET_ARN: secretArn,
      DB_HOST: '127.0.0.1',
      DB_PORT: String(localPort),
      DB_NAME: instance.DBName,
      DB_USER: instance.MasterUsername,
      DB_SSL_SERVERNAME: host,
      NODE_EXTRA_CA_CERTS: 'certs/rds-global-bundle.pem',
      AWS_REGION: region,
      // Real S3, not the local MinIO values that may sit in .env.local. Empty
      // strings read as "unset" in src/storage/s3.ts, so the AWS SDK falls back
      // to the default endpoint and your own credentials.
      S3_ENDPOINT: '',
      S3_FORCE_PATH_STYLE: 'false',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      S3_REGION: storageEnv.S3_REGION ?? region,
      ...(storageEnv.S3_BUCKET ? { S3_BUCKET: storageEnv.S3_BUCKET } : {}),
    },
  },
);

seed.on('exit', (code) => {
  closeTunnel();
  console.log('\nTunnel closed.');
  process.exit(code ?? 1);
});
