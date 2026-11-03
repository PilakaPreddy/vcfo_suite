'use client';

/**
 * Client Obligations · the non-statutory task table (COMPLIANCE-MODEL.md S-3, K-1, K-2): T1 rows
 * grouped by end-date week (This week, Next week, Later, Done). Columns: Task (the name, the
 * activity under it), Start, End, Urgency, With, Status. The client view has no Visibility
 * and no reviewer column; phones keep Task, End and Status. A row opens the task page.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Avatar } from '../incorporation/spectrum';
import { Chip, toneFor } from '@/components/ui/spectrum-chip';
import { fmtDM, daysBetween } from '@/lib/client-portal/compliances';
import { GoLink, GroupHead } from './spectrum';
import { UrgencyPill } from './task-marks';
import { taskWord, weekGroups, type ClientTask } from './tasks';
import { taskHref } from './task-api';

const COLS = 'grid-cols-[minmax(0,1fr)_64px_112px] md:grid-cols-[minmax(0,1fr)_64px_64px_104px_112px_112px]';

export function TaskList({ tasks, today }: { tasks: ClientTask[]; today: string }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const groups = weekGroups(tasks, today);
  return (
    <div role="table" aria-label="Non-statutory tasks">
      <div role="row" className={cn('grid items-center gap-3 border-b border-line-soft px-4 py-2 text-[12px] font-medium text-ink-muted md:px-5', COLS)}>
        <span role="columnheader">Task</span>
        <span role="columnheader" className="hidden md:block">
          Start
        </span>
        <span role="columnheader">End</span>
        <span role="columnheader" className="hidden md:block">
          Urgency
        </span>
        <span role="columnheader" className="hidden md:block">
          With
        </span>
        <span role="columnheader">Status</span>
      </div>
      {groups.map((g) => {
        const open = !closed[g.id];
        return (
          <div key={g.id} role="rowgroup">
            <GroupHead label={g.id} count={g.rows.length} open={open} onToggle={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))} />
            {open
              ? g.rows.map((t) => {
                  const w = taskWord(t, today);
                  const late = w === 'Overdue';
                  return (
                    <GoLink
                      key={t.id}
                      href={taskHref(t.id, t.boardMeetingId)}
                      label={`${t.name} · ${w}`}
                      className={cn('grid min-h-[52px] items-center gap-3 border-t border-line-soft px-4 py-2 text-[14px] text-ink first:border-t-0 hover:bg-surface-sunken md:px-5', COLS)}
                    >
                      <span role="cell" className="block min-w-0">
                        <b className="block truncate font-medium" title={t.name}>
                          {t.name}
                        </b>
                        {t.activityName ? <span className="block truncate text-[12.5px] text-ink-muted">{t.activityName}</span> : null}
                      </span>
                      <span role="cell" className="hidden whitespace-nowrap text-ink-muted md:block">
                        {fmtDM(t.startDate)}
                      </span>
                      <span
                        role="cell"
                        className={cn('whitespace-nowrap', late ? 'font-medium text-danger' : 'text-ink-2')}
                        title={late ? `${-daysBetween(today, t.endDate)} days late` : undefined}
                      >
                        {fmtDM(t.endDate)}
                      </span>
                      <span role="cell" className="hidden md:block">
                        <UrgencyPill urgency={t.urgency} />
                      </span>
                      <span role="cell" className="hidden min-w-0 items-center gap-2 md:inline-flex" title={t.ownerName ?? undefined}>
                        {t.ownerName ? (
                          <>
                            <Avatar name={t.ownerName} size={24} />
                            <span className="truncate">{t.ownerName.split(' ')[0]}</span>
                          </>
                        ) : (
                          <span className="text-ink-faint">SBC</span>
                        )}
                      </span>
                      <span role="cell">
                        <Chip tone={toneFor(w)} fixed>
                          {w}
                        </Chip>
                      </span>
                    </GoLink>
                  );
                })
              : null}
          </div>
        );
      })}
    </div>
  );
}
