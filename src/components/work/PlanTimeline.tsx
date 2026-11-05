'use client';

import { Lock } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EmptyState } from '@/components/ui/empty-state';
import { ClientDot } from '@/components/staff/today/today-parts';
import { shortCompany } from '@/components/super/parts/super-text';
import { internTimelineGantt, ymdInIst, type InternWorkItem } from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';

const MAX_ROWS = 12;
const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dateOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const shortDate = (ymd: string) => `${dateOf(ymd).getUTCDate()} ${MONTH[dateOf(ymd).getUTCMonth()]}`;

type BarKind = 'locked' | 'mine' | 'wait';

function barKind(item: InternWorkItem): BarKind {
  if (item.kind === 'waiting-client' || item.kind === 'waiting-request' || item.kind === 'waiting-manager') return 'wait';
  return item.source === 'task' || item.windowLabel ? 'locked' : 'mine';
}

/** Timeline legend swatches, matched to the bars (prototype `GANTT_LEGEND`). */
const LEGEND: [string, string][] = [
  ['Manager date', 'bg-brand'],
  ['Overdue', 'bg-danger-mid'],
  ['Waiting on client', 'border-1.5 border-waiting-mid bg-waiting-soft'],
  ['My to-do', 'border-1.5 border-dashed border-brand-line bg-brand-soft'],
];

function Legend() {
  return (
    <span className="hidden flex-wrap items-center gap-3 text-[12px] text-ink-muted xl:flex">
      {LEGEND.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-1.5">
          <i className={cn('h-2.5 w-3.5 rounded-bar', cls)} aria-hidden />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <i className="h-2 w-2 rotate-45 rounded-[1px] bg-ink-2" aria-hidden />
        Step due
      </span>
      <span className="flex items-center gap-1.5">
        <i className="h-2 w-2 rotate-45 rounded-[1px] bg-danger-mid" aria-hidden />
        Filing due
      </span>
    </span>
  );
}

/**
 * The Planner's Timeline (prototype `PlanTimeline`): 14 days with one row per open item. Manager
 * dates are hatched with a lock, my to-dos dashed, waiting on the client teal, overdue solid red.
 * A diamond marks the due day and a filing has only its diamond. The line marks today.
 */
export function PlanTimeline({ items, now, onOpen }: { items: InternWorkItem[]; now: Date; onOpen: (item: InternWorkItem) => void }) {
  const today = ymdInIst(now);
  const gantt = internTimelineGantt(items.filter((i) => i.kind !== 'done'), now);
  const todayCol = gantt.window.indexOf(today);
  const rows = gantt.rows.slice(0, MAX_ROWS);
  const grid = { gridTemplateColumns: `minmax(150px,190px) repeat(${gantt.window.length}, minmax(30px, 1fr))` };
  const first = gantt.window[0];
  const last = gantt.window[gantt.window.length - 1];

  return (
    <DashSection title="Timeline" meta={first && last ? `${shortDate(first)} to ${shortDate(last)}` : undefined} right={<Legend />} flush>
      {rows.length === 0 ? (
        <EmptyState title="Nothing dated" className="m-4" />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid h-9 items-center border-b-1.5 border-line text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted" style={grid}>
              <span className="px-4 md:px-5">Task</span>
              {gantt.window.map((ymd, i) => {
                const d = dateOf(ymd);
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return (
                  <span key={ymd} className={cn('text-center tracking-normal tabular-nums', i === todayCol && 'text-brand-text', weekend && i !== todayCol && 'text-ink-faint')}>
                    {DAY[d.getUTCDay()]} {d.getUTCDate()}
                  </span>
                );
              })}
            </div>
            {rows.map((row) => {
              const { item } = row;
              const filing = item.source === 'filing';
              const kind = barKind(item);
              const late = item.isOverdue;
              const span = Math.max(1, row.endIdx - row.startIdx + 1);
              const done = kind === 'locked' && !late && todayCol >= row.startIdx ? Math.max(0, Math.min(1, (todayCol + 1 - row.startIdx) / span)) : 0;
              return (
                <div key={item.id} className="relative grid border-b border-line-soft py-1.5 last:border-b-0" style={grid}>
                  <button type="button" onClick={() => onOpen(item)} className="flex min-w-0 items-center gap-2 px-4 text-left md:px-5" style={{ gridColumn: 1, gridRow: 1 }}>
                    <ClientDot name={item.companyName} />
                    <span className="min-w-0">
                      <b className="block truncate text-[13px] font-medium text-ink hover:underline" title={item.title}>
                        {item.title.split(' · ')[0]}
                      </b>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {shortCompany(item.companyName)} · {item.catalogLabel ?? (filing ? 'Filing' : 'To-do')}
                      </span>
                    </span>
                  </button>
                  {todayCol >= 0 ? (
                    <span aria-hidden className="pointer-events-none -my-1.5 flex justify-center" style={{ gridColumn: `${todayCol + 2} / span 1`, gridRow: 1 }}>
                      <i className="block h-full w-0.5 bg-highlight-bright" />
                    </span>
                  ) : null}
                  {filing ? null : (
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      title={`${item.title} · ${item.why}`}
                      style={{ gridColumn: `${row.startIdx + 2} / ${row.endIdx + 3}`, gridRow: 1 }}
                      className={cn(
                        'relative z-[1] flex h-4 min-w-0 items-center gap-1 self-center overflow-hidden whitespace-nowrap rounded-bar px-1.5 text-[11px] font-medium hover:opacity-90',
                        kind === 'locked' && (late ? 'bg-danger-mid text-on-brand' : 'hatch text-brand-text'),
                        kind === 'mine' && (late ? 'bg-danger-mid text-on-brand' : 'border-1.5 border-dashed border-brand-line bg-brand-soft text-brand-text'),
                        kind === 'wait' && 'bg-waiting-soft text-waiting',
                      )}
                    >
                      {done > 0 ? <i className="absolute inset-y-0 left-0 bg-brand" style={{ width: `${done * 100}%` }} aria-hidden /> : null}
                      {kind === 'locked' ? <Lock size={10} strokeWidth={1.6} className={cn('relative flex-none', done > 0 && 'text-on-brand')} aria-hidden /> : null}
                      {kind === 'wait' ? <span className="relative truncate">Waiting on client</span> : kind === 'mine' ? <span className="relative truncate">Mine</span> : null}
                    </button>
                  )}
                  {item.dueAt ? (
                    <span className="z-[2] grid place-items-center self-center" style={{ gridColumn: `${row.endIdx + 2} / span 1`, gridRow: 1 }} title={`${item.title} · ${item.why}`}>
                      <i className={cn('h-3 w-3 rotate-45 rounded-[2px]', filing ? 'bg-danger-mid' : 'bg-ink-2')} aria-hidden />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DashSection>
  );
}
