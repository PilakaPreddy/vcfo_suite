import type { Engagement } from '@/data/engagements';
import type { ChecklistItemStateSlice } from '@/lib/checklist/checklist-state-key';
import type { ChipTone } from '@/components/ui/spectrum-chip';
import { buildIncorporationModel, type PortalStep } from '@/lib/client-portal/step-model';
import { isIncorporated } from '@/lib/compliance/incorporation-state';
import { internCompanyPhaseProgress, type InternCompanyPhaseProgress } from '@/lib/intern/intern-work';
import { deriveStuckReason, type StuckReason } from '@/lib/projects/project-stuck';
import type { EngagementSchedule } from '@/lib/projects/schedule-windows';
import { sep } from '@/lib/date-format';
import { cn } from '@/lib/utils';

/**
 * CLIENT ROW FACTS for the staff Clients lists (lead Clients, manager Projects, admin Work ›
 * Projects and the admin home "Clients" card; prototype `ClientsGrid`). Every value is derived
 * from the engagement row and its checklist state; nothing is stored for the list itself.
 *
 *   stage   — Incorporating until the company is incorporated (`isIncorporated`), then Compliance.
 *   now     — the current step of the client step model (`buildIncorporationModel`): its code
 *             ("Pre-8", "Post-3", "Reg-12"), its title and who holds it (client, SBC or MCA).
 *   next    — the earliest manager-set window end still ahead (or the latest one if all passed).
 *   health  — one of the prototype's six words, plus Done when every step is finished.
 */

export type ClientStage = 'incorporating' | 'compliance';
export type ClientHolder = 'client' | 'sbc' | 'mca';
export type ClientHealth = 'Stuck' | 'Overdue' | 'Due this week' | 'With client' | 'In progress' | 'Not started' | 'Done';

export const CLIENT_HEALTHS: ClientHealth[] = ['Stuck', 'Overdue', 'Due this week', 'With client', 'In progress', 'Not started', 'Done'];

export const HEALTH_TONE: Record<ClientHealth, ChipTone> = {
  Stuck: 'bad',
  Overdue: 'bad',
  'Due this week': 'warn',
  'With client': 'teal',
  'In progress': 'prog',
  'Not started': 'idle',
  Done: 'ok',
};

/** Worst first, for the admin list's sort. */
export const HEALTH_RANK: Record<ClientHealth, number> = {
  Stuck: 0,
  Overdue: 1,
  'Due this week': 2,
  'With client': 3,
  'In progress': 4,
  'Not started': 5,
  Done: 6,
};

export const STAGE_WORD: Record<ClientStage, string> = { incorporating: 'Incorporating', compliance: 'Compliance' };
export const STAGE_CHIP_TONE: Record<ClientStage, ChipTone> = { incorporating: 'violet', compliance: 'teal' };

export interface ClientNow {
  code: string;
  title: string;
  holder: ClientHolder;
}

export interface ClientRowFacts {
  stage: ClientStage;
  now: ClientNow | null;
  next: string | null;
  health: ClientHealth;
  stuckReason: StuckReason;
  progress: InternCompanyPhaseProgress;
  done: number;
  total: number;
}

/** "Pre-8", "Post-3" from the step id; "Reg-n" for the registration phase. */
function stepCode(step: Pick<PortalStep, 'id' | 'phaseNo' | 'phaseId'>, indexInPhase: number): string {
  const m = /^(pre|post)-(\d+)$/i.exec(step.id);
  if (m) return `${m[1]!.toLowerCase() === 'pre' ? 'Pre' : 'Post'}-${m[2]}`;
  return step.phaseNo === 4 ? `Reg-${indexInPhase + 1}` : `Step ${indexInPhase + 1}`;
}

/** The earliest window end that is still ahead (or the latest one if all have passed). */
function nextScheduleDate(schedule: EngagementSchedule | null | undefined, todayIso: string): string | null {
  const ends = [schedule?.incorporation?.to, ...Object.values(schedule?.steps ?? {}).map((w) => w?.to)].filter(
    (d): d is string => Boolean(d),
  );
  if (ends.length === 0) return null;
  const ahead = ends.filter((d) => d >= todayIso).sort();
  return ahead[0] ?? ends.sort().at(-1) ?? null;
}

/** "14 Oct". */
export function shortDate(iso: string): string {
  return sep(new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
}

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday to Sunday of the week that holds `todayIso`, or of the week after it. */
function weekRange(todayIso: string, which: 'week' | 'next'): [string, string] {
  const dow = (new Date(`${todayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
  const mon = addDays(todayIso, -dow + (which === 'next' ? 7 : 0));
  return [mon, addDays(mon, 6)];
}

/** Next date filter of the lists: the next window end falls in this week or next week. */
export function nextInWeek(next: string | null, todayIso: string, which: string): boolean {
  if (which !== 'week' && which !== 'next') return true;
  if (!next) return false;
  const [a, b] = weekRange(todayIso, which);
  return next >= a && next <= b;
}

export function clientRowFacts(
  e: Engagement,
  state: Record<string, ChecklistItemStateSlice>,
  now: Date = new Date(),
): ClientRowFacts {
  const todayIso = now.toISOString().slice(0, 10);
  const progress = internCompanyPhaseProgress(e, state, now);
  const done = progress.phases.reduce((n, p) => n + p.done, 0);
  const total = progress.phases.reduce((n, p) => n + p.total, 0);
  const model = buildIncorporationModel(state, e.schedule, todayIso);
  const cur = model.current;
  let current: ClientNow | null = null;
  if (cur) {
    const phase = model.phases.find((p) => p.id === cur.phaseId);
    const idx = phase ? phase.steps.findIndex((s) => s.id === cur.id) : 0;
    current = {
      code: stepCode(cur, Math.max(0, idx)),
      title: cur.title,
      holder: cur.owner === 'mca' ? 'mca' : cur.kind === 'you' || cur.kind === 'prog' ? 'client' : 'sbc',
    };
  }
  const stuckReason = deriveStuckReason(e, state);
  const next = nextScheduleDate(e.schedule, todayIso);
  let health: ClientHealth;
  if (total > 0 && done >= total) health = 'Done';
  else if (progress.stuck || stuckReason === 'blocked') health = 'Stuck';
  else if (e.health === 'overdue' || model.counts.late > 0) health = 'Overdue';
  else if (nextInWeek(next, todayIso, 'week')) health = 'Due this week';
  else if (stuckReason === 'waiting_client' || current?.holder === 'client') health = 'With client';
  else if (done === 0) health = 'Not started';
  else health = 'In progress';
  return {
    stage: isIncorporated(e, state) ? 'compliance' : 'incorporating',
    now: current,
    next,
    health,
    stuckReason,
    progress,
    done,
    total,
  };
}

const HOLDER_DOT: Record<ClientHolder, string> = { client: 'bg-warning-mid', sbc: 'bg-info-mid', mca: 'bg-identity-mid' };
const HOLDER_LABEL: Record<ClientHolder, string> = { client: 'Waiting on the client', sbc: 'SBC step', mca: 'With MCA' };

/** 8px square before the step: amber for the client, blue for SBC, violet for MCA. */
export function HolderSquare({ holder, className }: { holder: ClientHolder; className?: string }) {
  return (
    <i
      className={cn('inline-block h-2 w-2 flex-none rounded-[2px]', HOLDER_DOT[holder], className)}
      title={HOLDER_LABEL[holder]}
      aria-label={HOLDER_LABEL[holder]}
      role="img"
    />
  );
}

/** The Now cell: holder square, mono step code in 12px muted, then the step name. */
export function NowCell({ now, className }: { now: ClientNow | null; className?: string }) {
  if (!now) return <span className={cn('text-ink-muted', className)}>—</span>;
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)} title={`${now.code} · ${now.title}`}>
      <HolderSquare holder={now.holder} />
      <span className="min-w-0 truncate">
        <span className="font-mono text-[12px] text-ink-muted">{now.code}</span> <span className="text-ink-2">{now.title}</span>
      </span>
    </span>
  );
}

/**
 * Footer legend of the Clients lists (lg and up): the phase bar colours and the holder squares.
 */
export function ClientsLegend({ className }: { className?: string }) {
  const sw = 'inline-block h-2 w-3 flex-none rounded-bar';
  return (
    <div className={cn('hidden flex-wrap items-center gap-x-4 gap-y-1 px-2 pt-2 text-[12px] text-ink-muted lg:flex', className)} aria-hidden>
      <span className="flex items-center gap-1.5">
        <i className={cn(sw, 'bg-positive-mid')} />
        Done
      </span>
      <span className="flex items-center gap-1.5">
        <i className={cn(sw, 'bg-brand ring-[1.5px] ring-brand-line')} />
        Current phase
      </span>
      <span className="flex items-center gap-1.5">
        <i className={cn(sw, 'bg-danger-mid')} />
        Stuck
      </span>
      <span className="flex items-center gap-1.5">
        <i className={cn(sw, 'bg-surface-sunken shadow-[inset_0_0_0_1px_oklch(var(--line))]')} />
        Not started
      </span>
      <span className="flex items-center gap-1.5">
        <HolderSquare holder="sbc" />
        SBC step
      </span>
      <span className="flex items-center gap-1.5">
        <HolderSquare holder="client" />
        Waiting on the client
      </span>
      <span className="flex items-center gap-1.5">
        <HolderSquare holder="mca" />
        With MCA
      </span>
    </div>
  );
}
