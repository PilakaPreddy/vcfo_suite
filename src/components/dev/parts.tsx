'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { EmptyState, SkeletonRows } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InlineConfirm } from '@/components/ui/inline-confirm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import type { Reach } from '@/lib/dev/types';
import { words } from '@/lib/dev/format';


/**
 * Parts shared by the developer console screens (G-01). They compose the Spectrum parts
 * (Chip, EmptyState, SpectrumTabs, EFilingGrid, CardHeadTile) and add only what the console
 * needs: a card whose head bar holds the filters (R-08), the "not set up" and "could not
 * reach" states, a key and value list, and the console's fetch hook.
 */

// ---------- Layout ----------

/** Main column and a 360px rail from lg (the prototype's `Cols`). */
export function Cols({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]', className)}>{children}</div>;
}

export function Col({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid min-w-0 grid-cols-1 gap-5', className)}>{children}</div>;
}

/** A small blurple link in a card head: "Deploys ›", "All ›". */
export function HeadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] font-medium text-brand-text hover:underline">
      {children}
    </Link>
  );
}

/** EFilingGrid `rowClassName` for the picked row (R-36): a soft blurple tint. */
export function pickedRow<T>(key: (row: T) => string, picked: string | null | undefined) {
  return (row: T) => (picked && key(row) === picked ? 'bg-brand-soft/60' : undefined);
}

// ---------- Card ----------

/** R-15, R-16: a card with the 52px head. Filters sit in the head bar (R-08); the body is flush. */
export function DevCard({
  title,
  meta,
  filters,
  right,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  meta?: ReactNode;
  filters?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('surface min-w-0 overflow-hidden', className)}>
      <div className="flex min-h-[52px] min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-4 py-2">
        <CardHeadTile title={title} />
        <h2 className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</h2>
        {meta ? <span className="min-w-0 text-[12.5px] text-ink-muted">{meta}</span> : null}
        <span className="flex-1" />
        {filters ? <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div> : null}
        {right}
      </div>
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
    </section>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="h-[30px] w-[30px]" onClick={onClick} aria-label="Close">
      <X strokeWidth={1.6} />
    </Button>
  );
}

/** "Load older" under a paged grid. */
export function LoadOlder({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <div className="flex justify-center border-t border-line-soft px-4 py-3">
      <Button size="sm" variant="secondary" onClick={onClick} disabled={busy}>
        {busy ? 'Loading' : 'Load older'}
      </Button>
    </div>
  );
}

// ---------- States ----------

/** Loading, error and empty states for a card body (R-48). */
export function Pending({ error, rows = 4 }: { error?: unknown; rows?: number }) {
  if (error) {
    return (
      <div className="p-4">
        <EmptyState title={error instanceof Error ? error.message : 'Could not load'} />
      </div>
    );
  }
  return <SkeletonRows rows={rows} className="p-4" />;
}

/** The body for a reader that is not set up or could not reach its service. */
export function ReachNotice({ reach, service }: { reach: Exclude<Reach<unknown>, { state: 'ok' }>; service: string }) {
  return (
    <div className="p-4">
      <EmptyState
        title={
          reach.state === 'not_set_up' ? (
            <span className="grid gap-1">
              <span className="font-medium text-ink">{service} is not set up</span>
              <span>
                Set{' '}
                {reach.missing.map((m, i) => (
                  <span key={m}>
                    {i > 0 ? ', ' : ''}
                    <code className="font-mono text-[13px] text-ink-2">{m}</code>
                  </span>
                ))}
              </span>
            </span>
          ) : (
            <span className="grid gap-1">
              <span className="font-medium text-ink">Could not reach {service}</span>
              <span className="break-words">{reach.error}</span>
            </span>
          )
        }
      />
    </div>
  );
}

/** A Chip for a reader's state, for card heads. */
export function ReachChip({ reach }: { reach: Reach<unknown> }) {
  if (reach.state === 'ok') return <Chip tone="ok">Working</Chip>;
  if (reach.state === 'not_set_up') return <Chip tone="idle">Not set up</Chip>;
  return <Chip tone="bad">Unreachable</Chip>;
}

// ---------- Status words ----------

const TONE: Record<string, ChipTone> = {
  configured: 'ok',
  working: 'ok',
  connected: 'ok',
  sent: 'ok',
  delivered: 'ok',
  read: 'ok',
  completed: 'ok',
  succeeded: 'ok',
  running: 'prog',
  in_progress: 'prog',
  operation_in_progress: 'prog',
  queued: 'teal',
  pending: 'teal',
  partial: 'warn',
  'due soon': 'warn',
  'needs re-auth': 'bad',
  failed: 'bad',
  create_failed: 'bad',
  denied: 'bad',
  error: 'bad',
  warn: 'warn',
  info: 'idle',
  ok: 'ok',
  skipped: 'idle',
  off: 'idle',
  cancelled: 'idle',
  paused: 'idle',
  rollback_succeeded: 'warn',
  rollback_failed: 'bad',
  rollback_in_progress: 'warn',
};

const WORD: Record<string, string> = {
  configured: 'Working',
  partial: 'Partly set',
  off: 'Not set up',
  ok: 'OK',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
  completed: 'Completed',
  succeeded: 'Succeeded',
};

/**
 * Status chip for a console grid (R-13). Machine words get a tone from the table above and a
 * readable label. The console keeps words such as "Sent" and "Completed", because the six
 * client words do not describe a job or a message.
 */
export function StatusChip({ status, label, className }: { status: string; label?: string; className?: string }) {
  const key = status.trim().toLowerCase();
  const tone = TONE[key] ?? 'idle';
  const word = label ?? WORD[key] ?? words(status);
  return (
    <Chip tone={tone} className={cn('w-[124px]', className)}>
      <span className="truncate">{word}</span>
    </Chip>
  );
}

// ---------- Needs attention ----------

export type AttentionTint = 'bad' | 'warn' | 'prog' | 'idle';

export interface DevAttentionRow {
  id: string;
  /** The day the problem was seen; the tile shows it. Null shows an alert tile. */
  date: Date | null;
  tint?: AttentionTint;
  title: string;
  sub?: string;
  chip: { label: string; tone: ChipTone };
  /** A soft red row with a small navy action (R-20). */
  urgent?: boolean;
  action?: { label: string; href: string };
  href?: string;
}

const TILE_TONE: Record<AttentionTint, string> = {
  bad: 'border-transparent bg-danger-soft text-danger',
  warn: 'border-transparent bg-warning-soft text-warning',
  prog: 'border-brand-line bg-brand-soft text-brand-text',
  idle: 'border-line bg-surface-raised text-ink',
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 44px date tile tinted by urgency; the full date is the tooltip. */
function DateTile({ date, tint = 'idle' }: { date: Date; tint?: AttentionTint }) {
  return (
    <span
      title={`${date.getDate()} ${MON[date.getMonth()]} ${date.getFullYear()}`}
      className={cn('grid w-11 flex-none place-items-center rounded-md border-1.5 py-1 leading-none', TILE_TONE[tint])}
    >
      <b className="text-[16px] font-medium">{date.getDate()}</b>
      <span className={cn('text-[10.5px] font-medium uppercase tracking-wider', tint === 'idle' ? 'text-ink-muted' : 'opacity-80')}>{MON[date.getMonth()]}</span>
    </span>
  );
}

/** R-20 attention rows: date tile, title and sub, chip on the right, urgent rows soft red with "Open". */
export function AttentionList({ rows, empty = 'Nothing needs attention' }: { rows: DevAttentionRow[]; empty?: string }) {
  if (!rows.length) {
    return (
      <div className="p-4">
        <EmptyState title={empty} />
      </div>
    );
  }
  return (
    <ul>
      {rows.map((r) => {
        const body = (
          <>
            {r.date ? (
              <DateTile date={r.date} tint={r.tint} />
            ) : (
              <span className="grid h-11 w-11 flex-none place-items-center rounded-md border border-danger bg-surface-raised text-danger" aria-hidden>
                <AlertCircle size={16} strokeWidth={1.6} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-ink">{r.title}</span>
              {r.sub ? <span className="block truncate text-[12.5px] text-ink-muted">{r.sub}</span> : null}
            </span>
            <span className="flex flex-none items-center gap-2">
              <Chip tone={r.chip.tone} fixed>
                {r.chip.label}
              </Chip>
              {r.action ? (
                <Button asChild variant="strong" size="sm" className="max-sm:hidden">
                  <Link href={r.action.href}>{r.action.label}</Link>
                </Button>
              ) : null}
            </span>
          </>
        );
        const cls = cn(
          'flex items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0',
          r.urgent && 'bg-danger-soft',
          r.href && 'hover:bg-surface-sunken/60',
        );
        return (
          <li key={r.id}>
            {r.href ? (
              <Link href={r.href} className={cls}>
                {body}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Stacked bar ----------

const BAR_FILL: Record<ChipTone | 'navy', string> = {
  ok: 'bg-positive-mid',
  warn: 'bg-warning-mid',
  bad: 'bg-danger-mid',
  prog: 'bg-brand',
  idle: 'bg-upcoming-mid',
  violet: 'bg-identity',
  teal: 'bg-waiting-mid',
  navy: 'bg-navy',
};

/** R-25 (C2): one stacked bar with a legend and a total, values formatted by the caller. */
export function StackedBar({
  segments,
  total,
  format = (n) => String(n),
}: {
  segments: Array<{ label: string; value: number; tone: ChipTone | 'navy' }>;
  total?: ReactNode;
  format?: (n: number) => string;
}) {
  const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="grid gap-2.5 px-4 py-4">
      {total !== undefined ? <span className="text-right text-[26px] font-medium leading-none text-ink">{total}</span> : null}
      <span className="flex h-2 w-full gap-0.5 overflow-hidden rounded-bar bg-surface-sunken" aria-hidden>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <i key={s.label} className={cn('block h-full rounded-[2px]', BAR_FILL[s.tone])} style={{ width: `${(s.value / sum) * 100}%` }} />
          ))}
      </span>
      <ul className="grid gap-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px] text-ink-2">
            <i className={cn('h-2 w-2 flex-none rounded-[2px]', BAR_FILL[s.tone])} aria-hidden />
            {s.label}
            <b className="ml-auto font-medium tabular-nums text-ink">{format(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Write actions (R-40) ----------

/**
 * POST a console write route, then refetch every console query. Returns `run`, the busy
 * flag and the last error text; the caller shows the toast.
 */
export function useDevAction<B>(url: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (body: B): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
      if (!res.ok) return { ok: false, error: actionError(String(data.error ?? ''), res.status) };
      await qc.invalidateQueries({ queryKey: ['dev'] });
      return { ok: true, data };
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

/**
 * R-40 change confirm (the prototype's ChangeConfirm): the question, the value before and
 * after, Cancel and the action. The action stays busy until `onConfirm` settles.
 */
export function ChangeConfirm({
  open,
  onOpenChange,
  title,
  before,
  after,
  confirm,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  before: ReactNode;
  after: ReactNode;
  confirm: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-ink-muted">Before</dt>
              <dd className="min-w-0 break-all font-mono text-ink-2">{before}</dd>
              <dt className="text-ink-muted">After</dt>
              <dd className="min-w-0 break-all font-mono text-ink">{after}</dd>
            </dl>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {busy ? 'Working' : confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Plain words for a refused console write. */
function actionError(code: string, status: number): string {
  switch (code) {
    case 'not_set_up':
      return 'This service is not set up';
    case 'not_found':
      return 'It is already gone';
    case 'not_retryable':
      return 'This run cannot be retried from here';
    case 'busy':
      return 'Another operation is running';
    case 'paused':
      return 'Jobs are paused';
    case 'not_runnable':
      return 'This job has no run event yet';
    case 'current':
      return 'Production already runs this image';
    case 'unreachable':
      return 'Could not reach the service';
    case 'forbidden':
    case 'not permitted':
      return 'Not allowed';
    default:
      return `The action failed (${status})`;
  }
}

// ---------- Key and value ----------

export function KeyValue({ rows, cols = 3 }: { rows: Array<{ k: string; v: ReactNode; mono?: boolean }>; cols?: 2 | 3 | 4 }) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3 px-4 py-4',
        cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {rows.map((r) => (
        <div key={r.k} className="min-w-0">
          <dt className="text-[12px] text-ink-muted">{r.k}</dt>
          <dd className={cn('mt-0.5 break-words text-[14px] text-ink', r.mono && 'font-mono text-[13px]')}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A row in a card list (R-19): full width, hairline between rows. */
export function ListRow({ href, children }: { href?: string; children: ReactNode }) {
  const cls = 'flex min-h-[52px] items-center gap-3 border-b border-line-soft px-4 py-2 text-[14px] last:border-b-0';
  return href ? (
    <Link href={href} className={cn(cls, 'hover:bg-surface-sunken/60')}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

/** Env var names in mono (R-28: identifiers only). */
export function EnvNames({ names, tone = 'muted' }: { names: string[]; tone?: 'muted' | 'danger' }) {
  if (!names.length) return <span className="text-ink-faint">-</span>;
  return (
    <span className={cn('flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[12.5px]', tone === 'danger' ? 'text-danger' : 'text-ink-muted')}>
      {names.map((n) => (
        <span key={n}>{n}</span>
      ))}
    </span>
  );
}

// ---------- Setting rows ----------

/** A setting row (R-19): label and value or control on one line, hairline between rows. */
export function SettingRow({ label, sub, children }: { label: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2 first:border-t-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        {sub ? <span className="block text-[12.5px] text-ink-muted">{sub}</span> : null}
      </span>
      <span className="flex flex-none items-center gap-2">{children}</span>
    </div>
  );
}

/**
 * A switch setting (prototype SwitchRow). With `confirmOn`, turning it on first asks in place
 * (R-40, InlineConfirm); turning it off needs no question.
 */
export function SwitchRow({
  label,
  sub,
  on,
  busy,
  confirmOn,
  onChange,
}: {
  label: string;
  sub?: ReactNode;
  on: boolean;
  busy?: boolean;
  confirmOn?: { question: string; confirm: string };
  onChange: (on: boolean) => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="border-t border-line-soft first:border-t-0">
      <SettingRow label={label} sub={sub}>
        <Switch
          checked={on}
          disabled={busy}
          aria-label={label}
          onCheckedChange={(next) => {
            if (next && confirmOn) setAsking(true);
            else void onChange(next);
          }}
        />
      </SettingRow>
      {asking && confirmOn ? (
        <InlineConfirm
          question={confirmOn.question}
          confirm={confirmOn.confirm}
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={async () => {
            await onChange(true);
            setAsking(false);
          }}
        />
      ) : null}
    </div>
  );
}
