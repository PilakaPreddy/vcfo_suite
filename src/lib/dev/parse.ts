import type { CostGroup, CostLine, JobFunction, JobRun, LogLevel } from './types';

/**
 * Pure parsing for the developer console readers, kept apart from the AWS and Inngest calls
 * so it can be tested without a network.
 */

// ---------- Logs ----------

/**
 * The level of a log line. App Runner keeps stdout as plain text, so the level comes from the
 * text: a JSON "level" field when the line is JSON, otherwise the first error or warn word.
 */
export function logLevelOf(message: string): LogLevel {
  const m = message.trim();
  if (m.startsWith('{')) {
    try {
      const j = JSON.parse(m) as { level?: unknown; severity?: unknown };
      const raw = String(j.level ?? j.severity ?? '').toLowerCase();
      if (/^(error|fatal|critical|50|60)$/.test(raw)) return 'error';
      if (/^(warn|warning|40)$/.test(raw)) return 'warn';
      if (raw) return 'info';
    } catch {
      // Not JSON after all; fall through to the word test.
    }
  }
  if (/\b(error|fatal|unhandled|exception|err_[a-z_]+)\b|⨯/i.test(m)) return 'error';
  if (/\b(warn|warning|deprecated)\b|⚠/i.test(m)) return 'warn';
  return 'info';
}

/**
 * A CloudWatch filter pattern for a free-text search: each word must appear. Quotes in the
 * input are dropped so a search cannot change the pattern's meaning.
 */
export function logFilterPattern(text: string): string | undefined {
  const words = text
    .replace(/["\\]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!words.length) return undefined;
  return words.map((w) => `"${w}"`).join(' ');
}

/**
 * The source of a log line: a JSON "source", "module" or "name" field, or the "[tag]" the
 * line starts with (the app logs as "[audit] ...", "[dev-console] ..."). "" when there is none.
 */
export function logSourceOf(message: string): string {
  const m = message.trim();
  if (m.startsWith('{')) {
    try {
      const j = JSON.parse(m) as { source?: unknown; module?: unknown; name?: unknown };
      const raw = j.source ?? j.module ?? j.name;
      if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 40);
    } catch {
      // Not JSON after all; fall through to the tag test.
    }
  }
  const tag = /^\[([A-Za-z][\w.:/-]{0,39})\]/.exec(m);
  return tag ? tag[1] : '';
}

/** A request id in a log line ("requestId": "...", request_id=..., x-request-id: ...), or "". */
export function requestIdOf(message: string): string {
  const r = /\b(?:request[_-]?id|x-request-id|reqId)["']?\s*[:=]\s*["']?([A-Za-z0-9-]{6,64})/i.exec(message);
  return r ? r[1] : '';
}

// ---------- Costs ----------

/** The overview group for a Cost Explorer service name. */
function costGroupOf(service: string): CostGroup['group'] {
  const s = service.toLowerCase();
  if (/bedrock|claude|anthropic/.test(s)) return 'AI';
  if (/app runner|apprunner/.test(s)) return 'App Runner';
  if (/relational database|rds|aurora/.test(s)) return 'Database';
  if (/simple email|\bses\b|end user messaging|pinpoint|simple notification|\bsns\b|social messaging/.test(s)) return 'Messaging';
  return 'Other';
}

/** Five fixed groups in the overview order, each the sum of its services. */
export function groupCosts(lines: CostLine[]): CostGroup[] {
  const order: CostGroup['group'][] = ['AI', 'App Runner', 'Database', 'Messaging', 'Other'];
  const by = new Map<CostGroup['group'], number>(order.map((g) => [g, 0]));
  for (const l of lines) by.set(costGroupOf(l.service), (by.get(costGroupOf(l.service)) ?? 0) + l.amount);
  return order.map((group) => ({ group, amount: Math.round((by.get(group) ?? 0) * 100) / 100 }));
}

type CeGroup = { Keys?: string[]; Metrics?: Record<string, { Amount?: string; Unit?: string }> };
type CeResult = { Groups?: CeGroup[] };

/** Sum Cost Explorer daily results by service, largest first, dropping lines under a cent. */
export function sumCostsByService(results: CeResult[], metric = 'UnblendedCost'): { currency: string; total: number; services: CostLine[] } {
  const by = new Map<string, number>();
  let currency = 'USD';
  for (const r of results) {
    for (const g of r.Groups ?? []) {
      const service = g.Keys?.[0] ?? 'Other';
      const m = g.Metrics?.[metric];
      const amount = Number(m?.Amount ?? 0);
      if (m?.Unit) currency = m.Unit;
      if (!Number.isFinite(amount)) continue;
      by.set(service, (by.get(service) ?? 0) + amount);
    }
  }
  const services = [...by.entries()]
    .map(([service, amount]) => ({ service, amount: Math.round(amount * 100) / 100 }))
    .filter((l) => l.amount >= 0.01)
    .sort((a, b) => b.amount - a.amount);
  const total = Math.round(services.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  return { currency, total, services };
}

// ---------- Inngest ----------

type FnLike = { id: (prefix?: string) => string; name?: string; opts?: { retries?: number; triggers?: unknown } };

/** Describe registered Inngest functions from their own config (id, trigger, retries). */
/** The event name that starts one job from the console's "Run now". */
export function runNowEvent(functionId: string): string {
  return `dev/run.${functionId}`;
}

export function describeFunctions(fns: FnLike[]): JobFunction[] {
  return fns.map((f) => {
    const triggers = (Array.isArray(f.opts?.triggers) ? f.opts?.triggers : f.opts?.triggers ? [f.opts.triggers] : []) as Array<{
      cron?: string;
      event?: string;
    }>;
    const id = f.id();
    // A `dev/run.<id>` trigger is the console's "Run now" door; it is not the job's schedule.
    const runEvent = runNowEvent(id);
    const t = triggers.find((x) => x.event !== runEvent) ?? {};
    return {
      id,
      name: f.name && f.name !== id ? f.name : id,
      trigger: t.cron ? { kind: 'cron', cron: t.cron } : { kind: 'event', event: t.event ?? '' },
      retries: typeof f.opts?.retries === 'number' ? f.opts.retries : null,
      runEvent: triggers.some((x) => x.event === runEvent) ? runEvent : null,
    } satisfies JobFunction;
  });
}

export type InngestEvent = { id?: string; internal_id?: string; name?: string; data?: { cron?: unknown } | null; received_at?: string };
export type InngestRun = { run_id?: string; status?: string; run_started_at?: string | null; ended_at?: string | null };

/**
 * The registered function an event triggered. An event trigger matches by name; a cron run
 * arrives as "inngest/scheduled.timer" with the cron string in its data.
 */
export function functionForEvent(ev: InngestEvent, fns: JobFunction[]): string | null {
  const name = ev.name ?? '';
  if (name === 'inngest/scheduled.timer') {
    const cron = typeof ev.data?.cron === 'string' ? ev.data.cron : '';
    return fns.find((f) => f.trigger.kind === 'cron' && f.trigger.cron === cron)?.id ?? null;
  }
  return fns.find((f) => f.trigger.kind === 'event' && f.trigger.event === name)?.id ?? null;
}

/** Turn Inngest runs for one event into console rows. Event data is dropped here. */
export function runsForEvent(ev: InngestEvent, runs: InngestRun[], fns: JobFunction[]): JobRun[] {
  const functionId = functionForEvent(ev, fns);
  return runs.map((r, i) => ({
    id: r.run_id ?? `${ev.internal_id ?? ev.id ?? 'event'}-${i}`,
    eventId: ev.internal_id ?? ev.id ?? null,
    functionId,
    event: ev.name ?? '',
    status: r.status ?? 'Unknown',
    startedAt: r.run_started_at ?? ev.received_at ?? null,
    endedAt: r.ended_at ?? null,
  }));
}

/**
 * Whether a failed run can be started again from the console. Only a run of an event
 * function can: the console sends the same event again, and only when exactly one
 * registered function listens to that event, so no other job runs twice. A cron run has no
 * event to send (Inngest's REST API has no "rerun"), so it waits for its next time.
 */
export function canRetryRun(run: Pick<JobRun, 'status' | 'event' | 'eventId'>, fns: JobFunction[]): boolean {
  if (run.status !== 'Failed' || !run.eventId || !run.event || run.event.startsWith('inngest/')) return false;
  return fns.filter((f) => f.trigger.kind === 'event' && f.trigger.event === run.event).length === 1;
}

/**
 * The next time a daily or weekly cron string the app uses fires, as an ISO instant, or null
 * for any other shape. "TZ=Asia/Kolkata m h * * *" is read in India time; no TZ means UTC.
 */
export function nextCronRun(cron: string, now = new Date()): string | null {
  const ist = /^TZ=Asia\/Kolkata\s/.test(cron);
  const c = cron.replace(/^TZ=\S+\s+/, '').trim();
  const m = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6])$/.exec(c);
  if (!m) return null;
  const minute = Number(m[1]);
  const hour = Number(m[2]);
  const dow = m[3] === '*' ? null : Number(m[3]);
  const offset = ist ? 5.5 * 3600000 : 0;
  // Work in the cron's own clock: shift "now" into it, find the next slot, shift back.
  const local = new Date(now.getTime() + offset);
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add, hour, minute));
    if (dow !== null && d.getUTCDay() !== dow) continue;
    if (d.getTime() > local.getTime()) return new Date(d.getTime() - offset).toISOString();
  }
  return null;
}

/** Human words for a cron string the app uses; anything else is shown as the cron itself. */
export function cronWords(cron: string): string {
  const c = cron.replace(/^TZ=\S+\s+/, '').trim();
  const tz = /^TZ=Asia\/Kolkata/.test(cron) ? ' IST' : ' UTC';
  const m = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(c);
  if (m) return `Daily at ${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}${tz}`;
  return c;
}

// ---------- Outlook ----------

/**
 * Health of a linked Outlook mailbox. The access token lasts about an hour and refreshes on
 * the next send, so its expiry alone says little. The refresh token lapses after 90 days
 * without use, and each refresh rewrites the row, so `updatedAt` is the real clock.
 */
export function outlookHealth(row: { updatedAt: string }, now = new Date()): 'Connected' | 'Due soon' | 'Needs re-auth' {
  const idleDays = (now.getTime() - new Date(row.updatedAt).getTime()) / 86400000;
  if (idleDays >= 90) return 'Needs re-auth';
  if (idleDays >= 75) return 'Due soon';
  return 'Connected';
}
