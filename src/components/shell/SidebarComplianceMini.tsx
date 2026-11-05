'use client';

import Link from 'next/link';
import { memo, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { useFilings } from '@/hooks/use-filings';
import { filingStatus, type FilingRow } from '@/lib/compliance/filings';
import type { TaskInstance } from '@/data/engagements';
import { complianceCalendarPath } from '@/components/shell/compliance-nav';
import { cn } from '@/lib/utils';

/**
 * Month calendar with "Due days" (VCFO Spectrum, prototype MiniCalendar). Lead and manager
 * only. Monday first, 17 px cells. Each due day has a 2 px underline in its worst status
 * colour; today has a blurple ring. The marks come from the person's own work: the filings in
 * their compliance register and their open task dates, both read through scoped repositories.
 */

export type DueMark = 'bad' | 'warn' | 'accent' | 'ok';
const RANK: Record<DueMark, number> = { bad: 3, warn: 2, accent: 1, ok: 0 };
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86_400_000;

const MARK_LINE: Record<DueMark, string> = {
  bad: 'shadow-[inset_0_-2px_0_oklch(var(--danger-mid))]',
  warn: 'shadow-[inset_0_-2px_0_oklch(var(--warning-mid))]',
  ok: 'shadow-[inset_0_-2px_0_oklch(var(--positive-mid))]',
  accent: 'shadow-[inset_0_-2px_0_oklch(var(--brand))]',
};

function inMonth(iso: string | undefined, year: number, month: number): number | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1;
  if (y !== year || m !== month) return null;
  const d = Number(iso.slice(8, 10));
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** Due days in the month of `now`: filings and open task dates. The worst status of the day wins. */
function dueDayMarks(
  filings: readonly Pick<FilingRow, 'filedOn' | 'dueDate'>[],
  tasks: readonly Pick<TaskInstance, 'dueAt' | 'status'>[],
  now: Date,
): Map<number, DueMark> {
  const year = now.getFullYear();
  const month = now.getMonth();
  const out = new Map<number, DueMark>();
  const put = (day: number, mark: DueMark) => {
    const old = out.get(day);
    if (!old || RANK[mark] > RANK[old]) out.set(day, mark);
  };
  for (const f of filings) {
    const day = inMonth(f.dueDate, year, month);
    if (day === null) continue;
    const s = filingStatus(f, now);
    put(day, s === 'filed' ? 'ok' : s === 'overdue' ? 'bad' : s === 'due-soon' ? 'warn' : 'accent');
  }
  const today = new Date(year, month, now.getDate()).getTime();
  for (const t of tasks) {
    const day = inMonth(t.dueAt, year, month);
    if (day === null || t.status === 'not-applicable') continue;
    const due = new Date(year, month, day).getTime();
    put(
      day,
      t.status === 'completed' ? 'ok' : due < today || t.status === 'overdue' ? 'bad' : due - today <= 7 * DAY_MS ? 'warn' : 'accent',
    );
  }
  return out;
}

/** The Indian financial year that holds `now` (April to March), as its start year. */
function fyStartOf(now: Date): number {
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export const SidebarComplianceMini = memo(function SidebarComplianceMini({
  expanded,
  staffBase,
  ink = 'dark',
}: {
  expanded: boolean;
  staffBase: string;
  ink?: 'light' | 'dark';
}) {
  const { user } = useApp();
  if (!user || !expanded || (user.role !== 'intern' && user.role !== 'manager')) return null;
  return <MiniMonth role={user.role} staffBase={staffBase} ink={ink} />;
});

/** Mounted only for a lead or manager, so other roles never read the register. */
function MiniMonth({ role, staffBase, ink }: { role: 'intern' | 'manager'; staffBase: string; ink: 'light' | 'dark' }) {
  const { tasks } = useApp();
  const now = useMemo(() => new Date(), []);
  const filings = useFilings({ fyStartYear: fyStartOf(now) });
  const marks = useMemo(() => dueDayMarks(filings.data?.rows ?? [], tasks, now), [filings.data, tasks, now]);

  const year = now.getFullYear();
  const month = now.getMonth();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const light = ink === 'light';

  return (
    <Link
      href={complianceCalendarPath(role, staffBase)}
      title="Open compliance calendar"
      className={cn('mx-1.5 mt-3 block border-t pt-2.5', light ? 'border-side-line text-white' : 'border-line text-ink')}
    >
      <span className="mb-1 flex justify-between text-[11.5px] font-medium">
        <span>
          {MONTH[month]} {year}
        </span>
        <span className={light ? 'text-side-muted' : 'text-ink-muted'}>Due days</span>
      </span>
      <span className={cn('grid grid-cols-7 gap-px text-center text-[10px] font-medium', light ? 'text-side-muted' : 'text-ink-muted')}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <span key={`w${i}`} className="h-4" aria-hidden>
            {w}
          </span>
        ))}
        {cells.map((n, i) => {
          if (n === null) return <span key={`e${i}`} />;
          const mark = marks.get(n);
          const today = n === now.getDate();
          return (
            <span
              key={n}
              className={cn(
                'grid h-[17px] place-items-center rounded-[3px] tabular-nums',
                today
                  ? cn('font-medium ring-1 ring-inset ring-brand', light ? 'bg-side-active text-white' : 'bg-brand-soft text-brand-text')
                  : mark && cn(light ? 'text-white' : 'text-ink', MARK_LINE[mark]),
              )}
              aria-label={mark ? `${n} ${MONTH[month]}: due` : undefined}
            >
              {n}
            </span>
          );
        })}
      </span>
    </Link>
  );
}
