'use client';

import { useState } from 'react';
import { CalendarClock, Download, Play, Save, Trash2 } from 'lucide-react';
import { DashSection } from '@/components/dash/DashSection';
import { EFilingGrid, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { Button } from '@/components/ui/button';
import { AreaPill } from '@/components/ui/spectrum-chip';
import { SkeletonRows } from '@/components/ui/empty-state';
import { plainDay } from '@/lib/date-format';
import { SuperFilterChips } from '@/components/super/parts/super-parts';
import { monthKeyLabel, REPORT_SCHEDULE_LABEL, type SavedReport } from '@/lib/reports/partner-report';

/**
 * The caller's saved reports (G-21): the area (every saved report is the firm's partner report),
 * the period, when it last went out and the schedule, with Run (opens it above), Schedule, Download
 * (PDF or Excel CSV, as saved) and Delete on each row. The recipients are in the Schedule dialog.
 * The report open above has the soft blurple row fill; the Period chip narrows the list by month.
 * "Save report" sits in the head because it is the only way to make one.
 */
export function SavedReportsCard({
  reports,
  loading,
  error,
  onOpen,
  onSchedule,
  onDelete,
  onSave,
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
  /** Saves the month open above as a new report. */
  onSave?: () => void;
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
    { key: 'area', header: 'Area', width: '124px', render: () => <AreaPill area="Firm" /> },
    { key: 'period', header: 'Period', width: '140px', render: (r) => monthKeyLabel(r.params.month) },
    { key: 'sent', header: 'Last run', width: '96px', render: (r) => (r.lastSentAt ? plainDay(r.lastSentAt) : 'Never') },
    { key: 'schedule', header: 'Schedule', width: '120px', render: (r) => REPORT_SCHEDULE_LABEL[r.schedule] },
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
      right={
        loading ? undefined : (
          <>
            {periods.length > 1 ? (
              <SuperFilterChips
                onClear={() => setPeriod('')}
                filters={[{ key: 'period', label: 'Period', value: period, options: periods, onChange: setPeriod }]}
              />
            ) : null}
            {onSave ? (
              <Button size="sm" variant="outline" onClick={onSave}>
                <Save aria-hidden />
                Save report
              </Button>
            ) : null}
          </>
        )
      }
      flush
    >
      {loading ? (
        <SkeletonRows rows={3} className="p-4" />
      ) : error ? (
        <p className="p-4 text-[13.5px] text-danger">{error}</p>
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
