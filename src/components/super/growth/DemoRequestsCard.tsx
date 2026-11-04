'use client';

import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { plainDay } from '@/lib/date-format';
import type { DemoRequest } from '@/lib/growth/demo-request';
import { cn } from '@/lib/utils';

/**
 * "Book a demo" requests from the public site (G-30), newest first. "Add as prospect" turns
 * one into a lead in the pipeline; a request already added shows that instead.
 */
export function DemoRequestsCard({
  requests,
  loading,
  error,
  addingId,
  onAdd,
}: {
  requests: DemoRequest[];
  loading: boolean;
  error: string | null;
  addingId: string | null;
  onAdd: (r: DemoRequest) => void;
}) {
  const open = requests.filter((r) => !r.prospectId).length;
  const columns: EFilingColumn<DemoRequest>[] = [
    {
      key: 'who',
      header: 'From',
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{r.company || r.name}</span>
          <span className={cn(GRID_SUB, 'truncate text-[12px] text-ink-muted')}>
            {r.company ? `${r.name} · ` : ''}
            <a className="text-brand-text hover:underline" href={`mailto:${r.email}`} onClick={(e) => e.stopPropagation()}>
              {r.email}
            </a>
          </span>
        </span>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      wrap: true,
      render: (r) => <span className="line-clamp-2 text-[13px] text-ink-2">{r.message || '–'}</span>,
    },
    { key: 'date', header: 'Received', width: '96px', render: (r) => plainDay(r.createdAt) },
    {
      key: 'act',
      header: '',
      width: '150px',
      align: 'right',
      render: (r) =>
        r.prospectId ? (
          <Chip raw tone="ok">Prospect added</Chip>
        ) : (
          <Button size="sm" variant="outline" disabled={addingId === r.id} onClick={() => onAdd(r)}>
            Add as prospect
          </Button>
        ),
    },
  ];
  return (
    <DashSection title="Demo requests" meta={loading ? undefined : `${open} new · ${requests.length} in all`}>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <p className="text-[13.5px] text-danger">{error}</p>
      ) : (
        <EFilingGrid caption="Demo requests" columns={columns} rows={requests} rowKey={(r) => r.id} empty="No demo request yet" minWidth={720} pageSize={10} />
      )}
    </DashSection>
  );
}
