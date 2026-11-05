'use client';

import { useState } from 'react';
import { ArrowUpRight, FileText, Landmark } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { SpectrumTabs } from '@/components/ui/spectrum-tabs';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  groupedVcfoPortalTasks,
  type VcfoPortalGroup,
  type VcfoPortalHead,
  type VcfoPortalTask,
} from '@/lib/notifications/announcement-portals';
import { cn } from '@/lib/utils';

/* VCFO Spectrum "Official portals" card (prototype AnnouncementsScreen `PortalsCard`): a
   Setup / Recurring segmented switch, group heads in table-head capitals and one clean row per
   task with two square buttons, Portal and Circular. The links come from the real catalogue. */

const RECURRING_HEADS = new Set<VcfoPortalHead>([
  'Monthly Compliances',
  'Quarterly Compliances',
  'Half-yearly Compliances',
  'Yearly Compliances',
]);

const ACT = cn(
  buttonVariants({ variant: 'outline', size: 'icon' }),
  'h-[30px] w-[30px] min-w-0 flex-none text-ink-2 hover:text-ink',
);

function TaskRow({ task }: { task: VcfoPortalTask }) {
  return (
    <li className="flex min-h-11 items-center gap-2 border-b border-line-soft py-1 text-[14px] last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink" title={task.task}>
        {task.task}
      </span>
      {task.portalUrl ? (
        <a
          href={task.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={ACT}
          aria-label={`Open portal for ${task.task}`}
          title="Portal"
        >
          <ArrowUpRight className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
        </a>
      ) : null}
      {task.circularUrl ? (
        <a
          href={task.circularUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={ACT}
          aria-label={`Read circular for ${task.task}`}
          title="Circular"
        >
          <FileText className="h-[15px] w-[15px]" strokeWidth={1.6} aria-hidden />
        </a>
      ) : null}
    </li>
  );
}

function Group({ group }: { group: VcfoPortalGroup }) {
  return (
    <section>
      <h3 className="flex items-center justify-between border-b-1.5 border-line pb-1.5 pt-3 text-[11.5px] font-medium uppercase tracking-[.07em] text-ink-muted">
        <span>{group.head}</span>
        <span className="tabular-nums">{group.tasks.length}</span>
      </h3>
      <ul>
        {group.tasks.map((task) => (
          <TaskRow key={`${group.head}:${task.task}`} task={task} />
        ))}
      </ul>
    </section>
  );
}

export function OfficialPortalsDirectory({ compact }: { compact?: boolean }) {
  const groups = groupedVcfoPortalTasks();
  const setup = groups.filter((group) => !RECURRING_HEADS.has(group.head));
  const recurring = groups.filter((group) => RECURRING_HEADS.has(group.head));
  const [tab, setTab] = useState<'setup' | 'recurring'>('setup');
  const count = (list: VcfoPortalGroup[]) => list.reduce((n, g) => n + g.tasks.length, 0);

  if (compact) {
    return (
      <div className="grid gap-1">
        {groups.map((group) => (
          <Group key={group.head} group={group} />
        ))}
      </div>
    );
  }

  const shown = tab === 'setup' ? setup : recurring;

  return (
    <div id="official-portals">
      <DashSection title="Official portals" headIcon={{ icon: Landmark, tone: 'blue' }} bodyClassName="grid gap-1 px-4 pb-2 pt-3 md:px-5">
        <div>
          <SpectrumTabs
            label="Portal group"
            items={[
              { key: 'setup', label: 'Setup', count: count(setup) },
              { key: 'recurring', label: 'Recurring', count: count(recurring) },
            ]}
            value={tab}
            onChange={(key) => setTab(key as 'setup' | 'recurring')}
          />
        </div>
        {shown.map((group) => (
          <Group key={group.head} group={group} />
        ))}
      </DashSection>
    </div>
  );
}
