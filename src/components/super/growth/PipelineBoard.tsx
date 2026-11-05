'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/spectrum-chip';
import { EFilingGrid, GRID_SUB, type EFilingColumn } from '@/components/dash/EFilingGrid';
import { plainDay } from '@/lib/date-format';
import {
  byStage,
  PROSPECT_SERVICE_LABEL,
  PROSPECT_SOURCE_LABEL,
  PROSPECT_STAGE_LABEL,
  PROSPECT_STAGES,
  type Prospect,
  type ProspectStage,
} from '@/lib/growth/pipeline';
import { cn } from '@/lib/utils';
import { daysSince, FIELD_SELECT_SM, STAGE_TONE } from './growth-ui';

/**
 * The sales pipeline (G-21) as a board and as a list. The board has the prototype's three columns:
 * Enquiry (lead and contacted), Proposal sent and Won; a lost prospect stays in the list. A card
 * opens the edit dialog; the stage picker on each card moves it. A won prospect shows "Convert to
 * client" until it is linked to an engagement, then the linked company. No fee amounts (R-37).
 */
interface PipelineProps {
  prospects: Prospect[];
  /** Company name of the engagement a won prospect links to, by prospect id. */
  linkedCompany: Map<string, string>;
  onEdit: (p: Prospect) => void;
  onMove: (p: Prospect, stage: ProspectStage) => void;
  onConvert: (p: Prospect) => void;
}

function StagePicker({ prospect, onMove }: { prospect: Prospect; onMove: PipelineProps['onMove'] }) {
  return (
    <select
      aria-label={`Stage of ${prospect.name}`}
      className={FIELD_SELECT_SM}
      value={prospect.stage}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onMove(prospect, e.target.value as ProspectStage)}
    >
      {PROSPECT_STAGES.map((s) => (
        <option key={s} value={s}>{PROSPECT_STAGE_LABEL[s]}</option>
      ))}
    </select>
  );
}

function WonLink({ prospect, linkedCompany, onConvert }: { prospect: Prospect; linkedCompany: Map<string, string>; onConvert: PipelineProps['onConvert'] }) {
  if (prospect.stage !== 'won') return null;
  if (prospect.engagementId) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-positive">
        <Link2 className="h-3.5 w-3.5 flex-none" aria-hidden />
        <span className="truncate">{linkedCompany.get(prospect.id) ?? 'Client linked'}</span>
      </span>
    );
  }
  return (
    <Button
      size="sm"
      variant="soft"
      onClick={(e) => {
        e.stopPropagation();
        onConvert(prospect);
      }}
    >
      Convert to client
    </Button>
  );
}

const BOARD: Array<{ key: string; label: string; stages: ProspectStage[] }> = [
  { key: 'enquiry', label: 'Enquiry', stages: ['lead', 'contacted'] },
  { key: 'proposal', label: PROSPECT_STAGE_LABEL.proposal, stages: ['proposal'] },
  { key: 'won', label: PROSPECT_STAGE_LABEL.won, stages: ['won'] },
];

export function PipelineBoard({ prospects, linkedCompany, onEdit, onMove, onConvert }: PipelineProps) {
  const grouped = byStage(prospects);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {BOARD.map((col) => {
        const items = col.stages.flatMap((stage) => grouped[stage]);
        return (
          <div key={col.key} className="min-w-0 rounded-md border-1.5 border-line bg-surface-sunken p-2.5">
            <h3 className="flex items-center gap-2 px-1 pb-2.5 text-[13px] font-medium text-ink-2">
              {col.label}
              <span className="rounded-sm bg-surface-raised px-1.5 text-[12px] font-medium text-ink-muted">{items.length}</span>
            </h3>
            {items.length === 0 ? (
              <EmptyState title="None" className="min-h-[72px] bg-surface-raised py-4 text-[13px]" />
            ) : (
              <ul className="grid gap-2">
                {items.map((p) => (
                  <li key={p.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onEdit(p)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onEdit(p);
                      }}
                      className="grid min-w-0 cursor-pointer gap-1.5 rounded-md border-1.5 border-line bg-surface-raised px-3 py-2.5 text-left transition-colors hover:border-line-strong focus-visible:border-brand focus-visible:outline-none"
                    >
                      <b className="block truncate text-[13.5px] font-medium text-ink">{p.company || p.name}</b>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {[p.company ? p.name : null, p.service ? PROSPECT_SERVICE_LABEL[p.service] : null].filter(Boolean).join(' · ') ||
                          PROSPECT_SOURCE_LABEL[p.source]}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-2">
                        {p.ownerName ?? 'No owner'} · {daysSince(p.updatedAt)}d
                        {p.nextStepOn ? ` · next ${plainDay(p.nextStepOn)}` : ''}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <StagePicker prospect={p} onMove={onMove} />
                        <WonLink prospect={p} linkedCompany={linkedCompany} onConvert={onConvert} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PipelineList({ prospects, linkedCompany, onEdit, onMove, onConvert }: PipelineProps) {
  const columns: EFilingColumn<Prospect>[] = [
    {
      key: 'name',
      header: 'Prospect',
      render: (p) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{p.company || p.name}</span>
          <span className={cn(GRID_SUB, 'truncate text-[12px] text-ink-muted')}>{p.company ? p.name : PROSPECT_SOURCE_LABEL[p.source]}</span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      width: '130px',
      render: (p) => (
        <Chip raw tone={STAGE_TONE[p.stage]}>
          {PROSPECT_STAGE_LABEL[p.stage]}
        </Chip>
      ),
    },
    { key: 'service', header: 'Service', width: '130px', render: (p) => (p.service ? PROSPECT_SERVICE_LABEL[p.service] : '–') },
    { key: 'owner', header: 'Owner', width: '150px', render: (p) => <span className="truncate">{p.ownerName ?? '–'}</span> },
    { key: 'next', header: 'Next step', width: '100px', render: (p) => plainDay(p.nextStepOn) },
    { key: 'source', header: 'Source', width: '120px', render: (p) => PROSPECT_SOURCE_LABEL[p.source] },
    {
      key: 'act',
      header: '',
      width: '210px',
      align: 'right',
      render: (p) => (
        <span className="flex items-center justify-end gap-2">
          <WonLink prospect={p} linkedCompany={linkedCompany} onConvert={onConvert} />
          <StagePicker prospect={p} onMove={onMove} />
        </span>
      ),
    },
  ];
  return (
    <EFilingGrid
      caption="Prospects"
      columns={columns}
      rows={prospects}
      rowKey={(p) => p.id}
      onRowClick={onEdit}
      empty="No prospect yet"
      minWidth={900}
      pageSize={20}
    />
  );
}
