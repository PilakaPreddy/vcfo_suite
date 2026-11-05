'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import type { ComplianceFiling } from '@/data/compliance';
import type { Engagement } from '@/data/engagements';
import { sep } from '@/lib/date-format';
import { ymdFromIsoInIst } from '@/lib/intern/intern-work';
import { cn } from '@/lib/utils';
import { DUE_SOON_DAYS } from '@/lib/compliance/filings';
import { exactDate, relativeDue } from '@/lib/relative-due';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Overdue and due-soon filings on the lead's Today (K-31, audit row 127): only clients with a
 * filing that is late or due soon appear. Each row has a 44px date tile tinted by urgency, the
 * filing and the company, and a state chip on the right; a late row is tinted soft red and
 * carries a small navy action (rule R-20).
 */
/** Overdue, or open and due within the due-soon window. Shared with the practice strip. */
function isOverdueOrDueSoon(f: ComplianceFiling, now: Date): boolean {
  if (f.status === 'overdue') return true;
  if (f.status !== 'upcoming' && f.status !== 'in-progress') return false;
  const due = Date.parse(f.nextDue);
  return Number.isFinite(due) && due - now.getTime() <= DUE_SOON_DAYS * 86_400_000;
}

export function LeadOverdueFilings({ filings, engagements, now }: { filings: ComplianceFiling[]; engagements: Engagement[]; now: Date }) {
  const byId = new Map(engagements.map((e) => [e.id, e]));
  const rows = filings
    .filter((f) => isOverdueOrDueSoon(f, now))
    .sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || a.nextDue.localeCompare(b.nextDue))
    .slice(0, 8);
  return (
    <DashSection title="Overdue filings" meta={rows.length ? `${rows.length}` : undefined} href="/app/intern/compliances/filings" hrefLabel="Filings" bodyClassName="px-0 py-0">
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-muted">No filing is overdue or due soon.</p>
      ) : (
        <ul>
          {rows.map((f) => {
            const ymd = ymdFromIsoInIst(f.nextDue) ?? f.nextDue.slice(0, 10);
            const late = f.status === 'overdue';
            const company = byId.get(f.engagementId)?.companyName ?? '';
            return (
              <li
                key={f.id}
                className={cn(
                  'relative flex min-w-0 items-center gap-3 border-t border-line-soft px-4 py-3 first:border-t-0',
                  late ? 'bg-danger-soft' : 'hover:bg-surface-sunken/60',
                )}
              >
                <span
                  className={cn(
                    'grid w-11 shrink-0 place-items-center rounded-md py-1 leading-none',
                    late ? 'bg-surface-raised text-danger' : 'bg-warning-soft text-warning',
                  )}
                  title={exactDate(ymd)}
                  aria-hidden
                >
                  <b className="text-[16px] font-medium tabular-nums">{Number(ymd.slice(8, 10))}</b>
                  <span className="text-[10.5px] font-medium uppercase tracking-wider opacity-80">{sep(MON[Number(ymd.slice(5, 7)) - 1] ?? '')}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href="/app/intern/compliances/calendar"
                    className="block truncate text-[13.5px] font-medium text-ink after:absolute after:inset-0 hover:underline"
                  >
                    {f.periodLabel && !f.periodLabel.startsWith(f.filing) ? `${f.filing} · ${f.periodLabel}` : (f.periodLabel ?? f.filing)}
                  </Link>
                  {/* E-11: the sub line starts with the relative due words; the exact date is the tooltip. */}
                  <span className="block truncate text-[12.5px] text-ink-muted" title={exactDate(ymd)}>
                    {[relativeDue(ymd, now), company, f.authority].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Chip tone={late ? 'bad' : 'warn'} fixed className="relative">
                  {late ? 'Overdue' : 'Due soon'}
                </Chip>
                {late ? (
                  <Button size="sm" variant="strong" asChild className="relative">
                    <Link href="/app/intern/compliances/calendar">Open</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </DashSection>
  );
}
