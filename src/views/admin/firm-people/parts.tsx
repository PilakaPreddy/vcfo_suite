'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CardHeadTile } from '@/components/common/CardHeadTile';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Chip, type ChipTone } from '@/components/ui/spectrum-chip';
import { STAGE_LABEL, type Stage } from '@/lib/projects/stage';
import { initialsFromName } from '@/lib/auth';
import { adminProjectPath, type StaffPathBase } from '@/lib/projects/project-step-path';
import { cn } from '@/lib/utils';

/* VCFO Spectrum parts of the People page (prototype `LeadsScreen`, `ManagersScreen` and the
   T1 grids): one card head, a person avatar, and the projects grid. */

/** A card with the 52px head (R-15, R-16): icon tile, 15px title, a count and an action. */
export function PeopleCard({
  title,
  count,
  action,
  className,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('surface min-w-0 overflow-hidden', className)}>
      <div className="flex min-h-[52px] min-w-0 items-center gap-2.5 border-b border-line-soft px-4 py-2">
        <CardHeadTile title={title} />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{title}</h2>
        {count !== undefined ? <span className="shrink-0 text-[12.5px] tabular-nums text-ink-muted">{count}</span> : null}
        {action}
      </div>
      {children}
    </section>
  );
}

/** People avatars are circles (R-44). */
export function PersonAvatar({ name, size = 30 }: { name: string; size?: 24 | 30 | 36 }) {
  return (
    <span
      aria-hidden
      className="inline-grid flex-none place-items-center rounded-full bg-surface-sunken text-[11px] font-medium text-ink-2"
      style={{ width: size, height: size }}
    >
      {(initialsFromName(name) || '•').slice(0, 2)}
    </span>
  );
}

const HEALTH: Record<string, { word: string; tone: ChipTone }> = {
  'on-track': { word: 'On track', tone: 'ok' },
  'at-risk': { word: 'At risk', tone: 'warn' },
  overdue: { word: 'Overdue', tone: 'bad' },
};

export function HealthChip({ health, stuck }: { health?: string | null; stuck?: boolean }) {
  const h = HEALTH[health ?? ''] ?? (stuck ? { word: 'Stuck', tone: 'bad' as ChipTone } : { word: 'On track', tone: 'ok' as ChipTone });
  return (
    <Chip tone={h.tone} fixed>
      {h.word}
    </Chip>
  );
}

const STAGE_TONE: Record<string, ChipTone> = {
  'Pre-Incorporation': 'violet',
  'Post-Incorporation': 'prog',
  'Operational Readiness': 'teal',
};

export function StageChip({ stage }: { stage?: string | null }) {
  if (!stage) return null;
  return (
    <Chip tone={STAGE_TONE[stage] ?? 'idle'} dot={false} fixed>
      {STAGE_LABEL[stage as Stage] ?? stage}
    </Chip>
  );
}

export interface PeopleProjectRow {
  id: string;
  slug?: string | null;
  company: string;
  client: string;
  stage: string;
  managerId?: string | null;
  leadId?: string | null;
  health?: string | null;
  stuck: boolean;
}

/** Clients and projects as a T1 grid (R-07): company, client, manager, lead, stage, health. */
export function PeopleProjectsGrid({
  rows,
  staffBase,
  managerName,
  leadName,
  showManager = true,
}: {
  rows: PeopleProjectRow[];
  staffBase: StaffPathBase;
  managerName?: (id: string | null | undefined) => string;
  leadName: (id: string | null | undefined) => string;
  showManager?: boolean;
}) {
  const router = useRouter();
  const columns: EFilingColumn<PeopleProjectRow>[] = [
    {
      key: 'company',
      header: 'Company',
      render: (c) => (
        <Link
          href={adminProjectPath({ id: c.id, slug: c.slug ?? undefined }, staffBase)}
          onClick={(ev) => ev.stopPropagation()}
          className="font-medium text-ink hover:underline"
          title={c.company}
        >
          {c.company}
        </Link>
      ),
    },
    { key: 'client', header: 'Client', width: '18%', render: (c) => <span title={c.client}>{c.client}</span> },
    ...(showManager && managerName
      ? [{ key: 'manager', header: 'Manager', width: '14%', render: (c: PeopleProjectRow) => managerName(c.managerId) }]
      : []),
    { key: 'lead', header: 'Project lead', width: '14%', render: (c) => leadName(c.leadId) },
    { key: 'stage', header: 'Stage', width: '128px', render: (c) => <StageChip stage={c.stage} /> },
    { key: 'health', header: 'Health', width: '128px', render: (c) => <HealthChip health={c.health} stuck={c.stuck} /> },
  ];
  return (
    <div className="px-2 pb-2">
      <EFilingGrid
        caption="Clients and projects"
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        pageSize={12}
        minWidth={760}
        onRowClick={(c) => router.push(adminProjectPath({ id: c.id, slug: c.slug ?? undefined }, staffBase))}
      />
    </div>
  );
}
