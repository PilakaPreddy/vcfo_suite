'use client';

import { useState } from 'react';
import { CalendarClock, Download, Play, Trash2 } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { SkeletonRows } from '@/components/ui/empty-state';
import { plainDay } from '@/lib/date-format';
import { SuperFilterChips } from '@/components/super/parts/super-parts';
import { monthKeyLabel, REPORT_SCHEDULE_LABEL, type SavedReport } from '@/lib/reports/partner-report';
import { cn } from '@/lib/utils';

/**
 * The caller's saved reports (G-21): which month, the schedule, who gets it, when it last
 * went out, and Run (opens it above), Schedule, Download (PDF or Excel CSV, as saved) and Delete on each row. The report
 * open above has the soft blurple row fill; the Period chip narrows the list by month.
 */
export function SavedReportsCard({
  reports,
  loading,
  error,
  onOpen,
  onSchedule,
  onDelete,
  openId = null,
}: {
  reports: SavedReport[];
  /** The saved report open above, if any; its row takes the selected fill. */
  openId?: string | null;
  loading: boolean;
  error: string | null;
  onOpen: (r: SavedReport) => void;
  onSchedule: (r: SavedReport) => void;
  onDelete: (r: SavedReport) => void;
}) {
  const [period, setPeriod] = useState('');
  const periods = [...new Set(reports.map((r) => monthKeyLabel(r.params.month)))];
  const rows = period ? reports.filter((r) => monthKeyLabel(r.params.month) === period) : reports;
  const columns: EFilingColumn<SavedReport>[] = [
    {
      key: 'name',
      header: 'Report',
      render: (r) => (
        <button type="button" onClick={() => onOpen(r)} className="truncate text-left font-medium text-brand-text hover:underline">
          {r.name}
        </button>
      ),
    },
    { key: 'month', header: 'Month', width: '140px', render: (r) => monthKeyLabel(r.params.month) },
    { key: 'schedule', header: 'Schedule', width: '120px', render: (r) => REPORT_SCHEDULE_LABEL[r.schedule] },
    {
      key: 'to',
      header: 'Send to',
      render: (r) =>
        r.recipients.length === 0 ? (
          '–'
        ) : (
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{r.recipients[0]}</span>
            {r.recipients.length > 1 ? (
              <span className={cn(GRID_SUB, 'text-[12px] text-ink-muted')}>and {r.recipients.length - 1} more</span>
            ) : null}
          </span>
        ),
    },
    { key: 'sent', header: 'Last sent', width: '96px', render: (r) => (r.lastSentAt ? plainDay(r.lastSentAt) : 'Never') },
    {
      key: 'act',
      header: '',
      width: '200px',
      align: 'right',
      render: (r) => (
        <span className="flex items-center justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => onOpen(r)}>
            <Play aria-hidden />
            Run
          </Button>
          <Button size="icon" variant="quiet" aria-label={`Schedule ${r.name}`} title="Schedule" onClick={() => onSchedule(r)}>
            <CalendarClock aria-hidden />
          </Button>
          <Button size="icon" variant="quiet" asChild>
            <a
              href={`/api/super/reports/${r.id}/${r.params.format === 'csv' ? 'csv' : 'pdf'}`}
              aria-label={`Download ${r.name}`}
              title={r.params.format === 'csv' ? 'Download Excel (CSV)' : 'Download PDF'}
            >
              <Download aria-hidden />
            </a>
          </Button>
          <Button size="icon" variant="quiet" aria-label={`Delete ${r.name}`} title="Delete" onClick={() => onDelete(r)}>
            <Trash2 aria-hidden />
          </Button>
        </span>
      ),
    },
  ];
  return (
    <DashSection
      title="Saved reports"
      meta={
        loading ? undefined : (
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="tabular-nums">{rows.length}</span>
            {periods.length > 1 ? (
              <SuperFilterChips
                onClear={() => setPeriod('')}
                filters={[{ key: 'period', label: 'Period', value: period, options: periods, onChange: setPeriod }]}
              />
            ) : null}
          </span>
        )
      }
    >
      {loading ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <p className="text-[13.5px] text-danger">{error}</p>
      ) : (
        <EFilingGrid
          caption="Saved reports"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowClassName={(r) => (r.id === openId ? 'bg-brand-soft' : undefined)}
          empty="No saved report yet"
          minWidth={800}
        />
      )}
    </DashSection>
  );
}
